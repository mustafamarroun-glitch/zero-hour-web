import {parseAniCursor} from '../harness/original-cursor-assets.mjs';

// Pack player-owned cursor files only. No artwork is bundled with the website.
export async function buildCursorPack(files, {signal}={}) {
  if(!files.length||files.length>128)throw Error('Select the original .ani cursor files from Data/Cursors.');
  const entries=[],names=new Set(),encoder=new TextEncoder();let total=16;
  for(const file of files){
    signal?.throwIfAborted();
    const name=file.name;
    if(!/^[a-z0-9_ -]+\.ani$/i.test(name)||names.has(name.toLowerCase()))throw Error(`Invalid or duplicate cursor file: ${name}`);
    if(file.size<12||file.size>512*1024)throw Error(`${name}: unsupported cursor file size.`);
    const bytes=new Uint8Array(await file.arrayBuffer());
    parseAniCursor(bytes,name);
    const path=encoder.encode(`Data\\Cursors\\${name}`);
    total+=9+path.length+bytes.length;
    if(total>8*1024*1024)throw Error('Cursor artwork exceeds the 8 MB limit.');
    names.add(name.toLowerCase());entries.push({bytes,path});
  }
  if(!names.has('sccpointer.ani')||!names.has('sccattack.ani'))throw Error('Select the complete cursor folder, including SCCPointer.ani and SCCAttack.ani.');
  const pack=new Uint8Array(total),view=new DataView(pack.buffer);
  pack.set([0x42,0x49,0x47,0x46]);view.setUint32(4,total,true);view.setUint32(8,entries.length);
  let directory=16,payload=16+entries.reduce((n,e)=>n+9+e.path.length,0);
  for(const {bytes,path} of entries){view.setUint32(directory,payload);view.setUint32(directory+4,bytes.length);pack.set(path,directory+8);pack.set(bytes,payload);directory+=9+path.length;payload+=bytes.length;}
  return {bytes:pack,entryCount:entries.length};
}
