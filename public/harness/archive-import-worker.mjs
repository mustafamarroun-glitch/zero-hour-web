import {Extractor} from './vendor/unrar/Extractor.mjs';
import unrarFactory from './vendor/unrar/unrar.mjs';
const LIMIT=8*1024**3, MAX_FILES=20000;
const table=Uint32Array.from({length:256},(_,v)=>{for(let b=0;b<8;b++)v=(v>>>1)^((v&1)?0xedb88320:0);return v>>>0});
function pathName(name){
  const path=name.replaceAll('\\','/').normalize('NFC').replace(/\/$/,'');
  if(!path||/[\x00-\x1f\x7f:]/.test(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error(`Unsafe archive path: ${name}`);
  return path;
}
const wanted=path=>/\.big$/i.test(path)||/(?:^|\/)cursors\/[a-z0-9_ -]+\.ani$/i.test(path);
function validate(entries){
  if(!entries.length||entries.length>MAX_FILES)throw Error('Archive is empty or contains too many entries.');
  const seen=new Set(),basenames=new Set();let total=0;
  for(const e of entries){e.path=pathName(e.name);const k=e.path.toLowerCase();if(seen.has(k))throw Error(`Duplicate archive path: ${e.path}`);seen.add(k);
    if(e.directory)continue;
    if(!Number.isSafeInteger(e.size)||e.size<0)throw Error(`Invalid file size: ${e.path}`);
    total+=e.size;if(total>LIMIT)throw Error('Archive expands beyond the 8 GB import limit. Choose a Data folder.');
    if(wanted(e.path)){const base=e.path.split('/').at(-1).toLowerCase();if(basenames.has(base))throw Error(`Multiple copies of ${base}. Choose an archive containing one installation.`);basenames.add(base)}
  }
  const selected=entries.filter(e=>!e.directory&&wanted(e.path));
  if(!selected.some(e=>/\.big$/i.test(e.path)))throw Error('No game .big files found. Choose an archive of the installed game’s Data folder.');
  return selected;
}
const progress=(detail,completedBytes,totalBytes)=>postMessage({type:'progress',phase:'Extracting archive',detail,completedBytes,totalBytes});
async function zipEntries(file){
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());let at=tail.length-22;
  while(at>=0){if(new DataView(tail.buffer).getUint32(at,true)===0x06054b50&&at+22+new DataView(tail.buffer).getUint16(at+20,true)===tail.length)break;at--}
  if(at<0)throw Error('ZIP directory is missing or damaged.');
  const end=new DataView(tail.buffer,at),count=end.getUint16(10,true),size=end.getUint32(12,true),offset=end.getUint32(16,true);
  if(end.getUint16(4,true)||end.getUint16(6,true)||end.getUint16(8,true)!==count)throw Error('Multipart ZIP files must be extracted on your computer.');
  if(count===65535||size===0xffffffff||offset===0xffffffff)throw Error('ZIP64 archives must be extracted on your computer.');
  if(count>MAX_FILES||size>16*1024**2||offset+size>file.size)throw Error('ZIP directory exceeds import limits or is damaged.');
  const data=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),view=new DataView(data.buffer),entries=[];let p=0;
  for(let i=0;i<count;i++){
    if(p+46>size||view.getUint32(p,true)!==0x02014b50)throw Error('Damaged ZIP directory.');
    const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),n=view.getUint16(p+28,true),x=view.getUint16(p+30,true),c=view.getUint16(p+32,true);
    if(p+46+n+x+c>size)throw Error('Truncated ZIP directory.');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(p+46,p+46+n));
    if(flags&1)throw Error('Encrypted ZIP files must be extracted on your computer.');
    if(view.getUint16(p+34,true))throw Error('Multipart ZIP is unsupported.');
    const attrs=view.getUint32(p+38,true),type=(attrs>>>16)&0xf000;
    if(type===0xa000)throw Error('Archive links are unsupported.');
    entries.push({name,directory:name.endsWith('/')||!!(attrs&16),flags,method,crc:view.getUint32(p+16,true),packed:view.getUint32(p+20,true),size:view.getUint32(p+24,true),offset:view.getUint32(p+42,true)});
    p+=46+n+x+c;
  }
  return entries;
}
async function extractZip(file,directory){
  const selected=validate(await zipEntries(file)),total=selected.reduce((n,e)=>n+e.size,0),files=[];let done=0;
  for(const e of selected){
    if(![0,8].includes(e.method))throw Error(`Unsupported ZIP compression in ${e.path}. Extract the folder on your computer.`);
    const header=new DataView(await file.slice(e.offset,e.offset+30).arrayBuffer());if(header.byteLength!==30||header.getUint32(0,true)!==0x04034b50||header.getUint16(8,true)!==e.method)throw Error(`Damaged ZIP header: ${e.path}`);
    const start=e.offset+30+header.getUint16(26,true)+header.getUint16(28,true);if(start+e.packed>file.size)throw Error(`Truncated ZIP file: ${e.path}`);
    let stream=file.slice(start,start+e.packed).stream();if(e.method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));
    const id=`file-${files.length}`,handle=await directory.getFileHandle(id,{create:true}),writer=await handle.createWritable();let written=0,crc=0xffffffff,last=0;
    try{for await(const bytes of stream){written+=bytes.length;if(written>e.size)throw Error(`Expanded size mismatch: ${e.path}`);for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);await writer.write(bytes);if(Date.now()-last>120){progress(`Extracting ${e.path}`,done+written,total);last=Date.now()}}
      if(written!==e.size||((crc^0xffffffff)>>>0)!==e.crc)throw Error(`ZIP checksum failed: ${e.path}`);await writer.close();
    }catch(error){await writer.abort().catch(()=>{});throw error}
    done+=written;files.push({id,path:e.path});progress(`Extracted ${e.path}`,done,total);
  }
  return files;
}
// Blob-backed input and OPFS-backed output avoid retaining the RAR and all extracted
// game data in RAM. Only the UnRAR dictionary and a read chunk live in the worker.
class BrowserExtractor extends Extractor{
  constructor(unrar,file){super(unrar);this.file=file;this._filePath='input.rar';this.io=new Map();this.next=1;this.outputs=new Map();this.reader=new FileReaderSync();this.written=0;this.lastProgress=0;this.currentName=''}
  open(name){if(name!==this._filePath)return 0;const fd=this.next++;this.io.set(fd,{input:true,pos:0,size:this.file.size});return fd}
  create(name){const output=this.outputs.get(name);if(!output)throw Error(`Unexpected RAR output: ${name}`);const fd=this.next++;this.currentName=name;output.handle.truncate(0);this.io.set(fd,{handle:output.handle,pos:0,size:0,expected:output.size});return fd}
  closeFile(fd){const f=this.io.get(fd);if(f?.handle)f.handle.flush();this.io.delete(fd)}
  read(fd,buf,size){const f=this.io.get(fd);if(!f?.input)return -1;const bytes=new Uint8Array(this.reader.readAsArrayBuffer(this.file.slice(f.pos,f.pos+size)));this.unrar.HEAPU8.set(bytes,buf);f.pos+=bytes.length;return bytes.length}
  write(fd,buf,size){const f=this.io.get(fd);if(!f?.handle||f.pos+size>f.expected)throw Error('RAR expanded size exceeds its header.');const n=f.handle.write(this.unrar.HEAPU8.subarray(buf,buf+size),{at:f.pos});f.pos+=n;f.size=Math.max(f.size,f.pos);this.written+=n;if(Date.now()-this.lastProgress>150){progress(`Extracting ${this.currentName}`,this.written,this.total);this.lastProgress=Date.now()}return n===size}
  tell(fd){return this.io.get(fd)?.pos??-1}
  seek(fd,pos,method){const f=this.io.get(fd);if(!f)return false;const next=(method==='SET'?0:method==='END'?f.size:f.pos)+pos;if(next<0||next>f.size)return false;f.pos=next;return true}
}
async function extractRar(file,directory){
  const wasmBinary=await fetch(new URL('./vendor/unrar/unrar.wasm',import.meta.url)).then(r=>{if(!r.ok)throw Error('Could not load local RAR decoder. Reload and retry.');return r.arrayBuffer()});
  const unrar=await unrarFactory({wasmBinary}),extractor=new BrowserExtractor(unrar,file);unrar.extractor=extractor;
  const handles=[];
  try{
    const list=extractor.getFileList();if(list.arcHeader.flags.volume||list.arcHeader.flags.headerEncrypted)throw Error('Multipart or encrypted RAR files must be extracted on your computer.');
    const entries=[];for(const h of list.fileHeaders){if(h.flags.encrypted)throw Error('Encrypted RAR files must be extracted on your computer.');entries.push({name:h.name,size:h.unpSize,directory:h.flags.directory});if(entries.length>MAX_FILES)throw Error('Too many RAR entries.')}
    const selected=validate(entries);extractor.total=selected.reduce((n,e)=>n+e.size,0);const files=[];
    for(const e of selected){const id=`file-${files.length}`,handle=await(await directory.getFileHandle(id,{create:true})).createSyncAccessHandle();handles.push(handle);extractor.outputs.set(e.name,{handle,size:e.size});files.push({id,path:e.path})}
    const output=extractor.extract({files:h=>extractor.outputs.has(h.name)});for(const entry of output.files){const e=extractor.outputs.get(entry.fileHeader.name);if(e.handle.getSize()!==e.size)throw Error(`RAR file size mismatch: ${entry.fileHeader.name}`)}
    progress('RAR extraction complete',extractor.total,extractor.total);return files;
  }finally{for(const handle of handles)try{handle.close()}catch{}if(extractor._archive)extractor.closeArc()}
}
self.onmessage=async({data:{file,directory}})=>{
  try{progress(`Reading ${file.name}…`,0,0);const files=/\.zip$/i.test(file.name)?await extractZip(file,directory):await extractRar(file,directory);postMessage({type:'done',files})}
  catch(error){postMessage({type:'error',message:`${error.message||error}. Choose ZIP or extract the archive on your computer if this format cannot be read.`})}
};
