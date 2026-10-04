// RA2 VM reads yr/<path> Blob records from this existing, game-specific cache.
// Install/removal commits records and metadata together in one IDB transaction.
const DB='zhweb-yuri-game-files-v1',STORE='files',MANIFEST='zhweb-library-manifest-v1',LOCK='zhweb-yuri-library';
const REQUIRED=['gamemd.exe','ra2.mix','ra2md.mix','language.mix','langmd.mix','binkw32.dll','blowfish.dll'];
const range=()=>IDBKeyRange.bound('yr/','yr/\uffff');
const bytes=value=>value>=1024**3?`${(value/1024**3).toFixed(2)} GiB`:`${(value/1024**2).toFixed(1)} MiB`;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function database(){
 const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
 const db=await request(r);db.onversionchange=()=>db.close();return db;
}
async function locked(mode,action){
 if(!navigator.locks?.request)throw Error('File management requires a current browser with storage locks.');
 return navigator.locks.request(LOCK,{mode,ifAvailable:true},lock=>{if(!lock)throw Error('Yuri files are in use in another tab. Exit that game and retry.');return action()});
}
async function readFiles(){
 const db=await database();try{
  const tx=db.transaction(STORE),store=tx.objectStore(STORE),rows=[];
  await new Promise((resolve,reject)=>{const r=store.openCursor(range());r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c)return resolve();const value=c.value;const file=value instanceof Blob?value:value instanceof Uint8Array?new Blob([value]):null;if(!file)return reject(Error(`Unreadable cached game file: ${c.key}. Use Remove installed game to recover.`));rows.push({name:String(c.key).slice(3),file});c.continue()}});
  return rows;
 }finally{db.close()}
}
function safePath(path){
 const value=path.replaceAll('\\','/').normalize('NFC');
 if(!value||value.startsWith('/')||/[\x00-\x1f\x7f:]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error(`Unsafe game file path: ${path}`);
 return value.toLowerCase();
}
async function validate(files,signal,onProgress=()=>{}){
 const names=new Map();let total=0;
 for(const {name,file} of files){signal?.throwIfAborted();if(names.has(name))throw Error(`Multiple copies of ${name}. Choose one installation.`);if(!(file instanceof Blob))throw Error(`Unreadable file: ${name}`);names.set(name,file);total+=file.size}
 const missing=REQUIRED.filter(name=>!names.has(name));if(missing.length)throw Error(`Missing required files: ${missing.join(', ')}`);
 const exe=names.get('gamemd.exe'),header=new DataView(await exe.slice(0,64).arrayBuffer());
 if(header.byteLength<64||header.getUint16(0,true)!==0x5a4d)throw Error('gamemd.exe is damaged or is not the original Windows executable.');
 const at=header.getUint32(60,true),pe=new Uint8Array(await exe.slice(at,at+4).arrayBuffer());
 if(at>=exe.size-4||pe.length!==4||pe[0]!==80||pe[1]!==69||pe[2]||pe[3])throw Error('gamemd.exe has an invalid executable header.');
 for(const name of REQUIRED.filter(n=>n.endsWith('.mix')||n.endsWith('.dll'))){signal?.throwIfAborted();const file=names.get(name);if(file.size<64)throw Error(`${name} is empty or incomplete.`);const h=new Uint8Array(await file.slice(0,4).arrayBuffer());if(name.endsWith('.dll')&&(h[0]!==77||h[1]!==90))throw Error(`${name} has an invalid DLL header.`)}
 onProgress({phase:'scan',detail:`${files.length} files checked`,completed:files.length,total:files.length});return total;
}
async function commit(files,manifest,{signal,onProgress=()=>{}}={}){
 signal?.throwIfAborted();const db=await database();try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let queueError;
   const abort=()=>{try{tx.abort()}catch{}};signal?.addEventListener('abort',abort,{once:true});
   const finish=()=>signal?.removeEventListener('abort',abort);
   tx.oncomplete=()=>{finish();resolve()};tx.onerror=()=>{};tx.onabort=()=>{finish();reject(signal?.aborted?new DOMException('Import cancelled.','AbortError'):queueError||tx.error||Error('Browser storage could not commit the installation. Your previous files were kept.'))};
   try{store.delete(range());store.delete(MANIFEST);
    if(files){let done=0;for(const {name,file} of files){const r=store.put(file,'yr/'+name);r.onsuccess=()=>{done+=file.size;onProgress({phase:'prepare',detail:name,completedBytes:done,totalBytes:manifest.totalBytes})}}store.put(manifest,MANIFEST)}
   }catch(e){queueError=e;abort()}
   if(signal?.aborted)abort();
  });
 }finally{db.close()}
}
class YuriLibrary{
 constructor(){this.library=null;this.lastValidationError=null;this.scanResult=null}
 installedLibrary(){return this.library}
 summary(){const total=this.library?.totalBytes||0;return {installed:!!this.library,totalBytes:total,formattedBytes:bytes(total),ready:!!this.library&&!this.lastValidationError}}
 async scan(files,{onProgress=()=>{},signal}={}){
  this.scanResult=null;
  try{
   const candidates=files.map(file=>({path:safePath(file.relativePath||file.webkitRelativePath||file.name),file}));
   const executables=candidates.filter(e=>/(?:^|\/)gamemd\.exe$/.test(e.path));
   if(executables.length!==1)throw Error(executables.length?'Multiple Yuri installations found. Choose one game folder.':'Missing required files: gamemd.exe. Choose your complete Yuri game folder.');
   const base=executables[0].path.slice(0,-'gamemd.exe'.length);
   const selected=candidates.filter(e=>e.path.startsWith(base)).map(e=>({name:e.path.slice(base.length),file:e.file}));
   if(selected.length>20000)throw Error('Too many game files. Choose one installation.');
   const totalBytes=await validate(selected,signal,onProgress);this.scanResult={files:selected,totalBytes};return {ok:true,totalBytes};
  }catch(e){return {ok:false,error:e.message}}
 }
 async prepare(_mode,onProgress,options={}){
  if(!this.scanResult)throw Error('Check a complete game folder before installing.');
  const candidate=this.scanResult;
  return locked('exclusive',async()=>{
   const estimate=await navigator.storage.estimate();
   if(estimate.quota&&estimate.quota-(estimate.usage||0)<candidate.totalBytes*1.03)throw Error('Not enough browser storage for this installation. Free space or use another browser profile; your previous game is kept.');
   const manifest={version:1,root:crypto.randomUUID(),archives:candidate.files.map(e=>({name:e.name,size:e.file.size})),totalBytes:candidate.totalBytes};
   await commit(candidate.files,manifest,{...options,onProgress});this.library=manifest;this.lastValidationError=null;this.scanResult=null;return manifest;
  });
 }
 recoverWorker(){this.scanResult=null}
 async verifyInstalledLibrary(){
  this.lastValidationError=null;
  try{return await locked('shared',async()=>{
   const db=await database();let manifest;try{manifest=await request(db.transaction(STORE).objectStore(STORE).get(MANIFEST))}finally{db.close()}
   const files=await readFiles();if(!files.length){this.library=null;return null}
   if(manifest){
    if(!Array.isArray(manifest.archives)||manifest.version!==1)throw Error('Installed-file metadata is unreadable. Use Remove installed game to recover.');
    const actual=new Map(files.map(e=>[e.name,e.file.size]));
    if(actual.size!==manifest.archives.length||manifest.archives.some(e=>actual.get(e.name)!==e.size))throw Error('Installed files differ from their saved inventory. Import a complete replacement or remove this installation.');
   }
   const totalBytes=await validate(files);
   // Adopt an existing RA2 VM cache only after validating the actual local files.
   this.library=manifest||{version:1,root:'legacy-yuri-cache',archives:files.map(e=>({name:e.name,size:e.file.size})),totalBytes};
   return this.library;
  })}catch(e){this.lastValidationError=e.message;throw e}
 }
 async archivesForLaunch(){if(!await this.verifyInstalledLibrary())throw Error('No installed Yuri files. Import your game again.');return this.filesForBackup()}
 async filesForBackup(){return readFiles()}
 async configureForLaunch(preferences,name){
  return locked('exclusive',async()=>{
   const files=await readFiles(),original=files.find(e=>e.name==='ra2md.ini')?.file;
   if(original?.size>1024*1024)throw Error('RA2MD.INI is too large to apply settings safely. Import a clean game folder.');
   let text='';if(original){const data=new Uint8Array(await original.arrayBuffer());for(let i=0;i<data.length;i+=16384)text+=String.fromCharCode(...data.subarray(i,i+16384))}
   const set=(section,key,value)=>{
    const lines=text.split(/\r?\n/);let start=lines.findIndex(line=>line.trim().toLowerCase()===`[${section.toLowerCase()}]`);
    if(start<0){if(lines.at(-1))lines.push('');start=lines.length;lines.push(`[${section}]`)}
    let end=lines.findIndex((line,index)=>index>start&&/^\s*\[/.test(line));if(end<0)end=lines.length;
    const at=lines.findIndex((line,index)=>index>start&&index<end&&line.split('=')[0].trim().toLowerCase()===key.toLowerCase());
    if(at<0)lines.splice(end,0,`${key}=${value}`);else lines[at]=`${key}=${value}`;text=lines.join('\r\n');
   };
   set('Audio','ScoreVolume',(preferences.music/100).toFixed(6));set('Audio','SoundVolume',(preferences.effects/100).toFixed(6));set('Audio','VoiceVolume',(preferences.effects/100).toFixed(6));
   set('Options','AutoScroll',preferences.edgeScroll?'yes':'no');
   set('MultiPlayer','Handle',[...name].map(c=>c.charCodeAt(0).toString(16)).join(',')+',');
   const blob=new Blob([Uint8Array.from(text,c=>c.charCodeAt(0)&255)]);
   const manifest={...this.library,archives:this.library.archives.filter(e=>e.name!=='ra2md.ini').concat({name:'ra2md.ini',size:blob.size}),totalBytes:this.library.totalBytes-(original?.size||0)+blob.size};
   const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let queueError;tx.oncomplete=resolve;tx.onabort=()=>reject(queueError||tx.error||Error('Could not save launch settings'));tx.onerror=()=>{};try{store.put(blob,'yr/ra2md.ini');store.put(manifest,MANIFEST)}catch(e){queueError=e;tx.abort()}})}finally{db.close()}
   this.library=manifest;
  });
 }
 async removeInstalledLibrary(){await locked('exclusive',()=>commit(null,null));this.library=null;this.scanResult=null;this.lastValidationError=null}
 async managedStorageInventory(){return {entries:[]}}
 async cleanUnusedStorage(){return locked('exclusive',async()=>({removed:[],failed:[],skipped:false}))}
 async holdForGame(){
  let release,ready;const hold=new Promise(resolve=>{release=resolve});const acquired=new Promise((resolve,reject)=>{ready={resolve,reject}});
  const task=navigator.locks.request(LOCK,{mode:'shared',ifAvailable:true},async lock=>{if(!lock){ready.reject(Error('File installation is running in another tab. Retry when it finishes.'));return}ready.resolve();await hold});
  await acquired;return async()=>{release();await task};
 }
}
export const assetLibrary=new YuriLibrary();
window.YuriAssetLibrary=assetLibrary;
