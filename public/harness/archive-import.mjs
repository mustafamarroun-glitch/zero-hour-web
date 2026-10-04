// Extract only game data to private staging storage; the existing validator owns installation.
import './storage-scope.js';
let active=null;
async function staging(){return (await navigator.storage.getDirectory()).getDirectoryHandle('archive-staging',{create:true})}
export async function cleanArchiveStaging(){
  const dir=await staging();
  for await(const [name] of dir.entries())if(/^extract-[a-z0-9-]+$/.test(name)){
    await navigator.locks.request(`zhweb-extract:${name}`,{ifAvailable:true},async lock=>{if(lock)await dir.removeEntry(name,{recursive:true})});
  }
}
export async function extractGameArchive(file,{signal,onProgress=()=>{}}={}){
  if(active)throw Error('An archive is already being extracted.');
  if(!/\.(zip|rar)$/i.test(file.name))throw Error('Choose one .zip or .rar archive.');
  if(!navigator.storage?.getDirectory||!navigator.locks)throw Error('Archive import requires browser storage. Use a current desktop browser.');
  signal?.throwIfAborted();
  const root=`extract-${crypto.randomUUID()}`;
  const parent=await staging();
  const directory=await parent.getDirectoryHandle(root,{create:true});
  let releaseLock;const hold=new Promise(resolve=>{releaseLock=resolve});let lockReady;
  const locked=new Promise(resolve=>{lockReady=resolve});
  const lockOperation=navigator.locks.request(`zhweb-extract:${root}`,async()=>{lockReady();await hold});
  await locked;
  const worker=new Worker(new URL('./archive-import-worker.mjs',import.meta.url),{type:'module'});active=worker;
  let disposed=false;
  const dispose=async()=>{if(disposed)return;disposed=true;worker.terminate();active=null;try{await parent.removeEntry(root,{recursive:true})}finally{releaseLock();await lockOperation}};
  try{
    const names=await new Promise((resolve,reject)=>{
      const abort=()=>{worker.terminate();reject(new DOMException('Import cancelled.','AbortError'))};
      signal?.addEventListener('abort',abort,{once:true});
      const finish=(callback,value)=>{signal?.removeEventListener('abort',abort);callback(value)};
      worker.onmessage=e=>{if(e.data.type==='progress')onProgress(e.data);if(e.data.type==='done')finish(resolve,e.data.files);if(e.data.type==='error')finish(reject,Error(e.data.message))};
      worker.onerror=e=>{e.preventDefault();finish(reject,Error(e.message||'Archive extraction failed. Use ZIP or extract the folder on your computer.'))};
      worker.postMessage({file,directory});
      if(signal?.aborted)abort();
    });
    worker.terminate();active=null;
    const files=[];
    for(const entry of names){const extracted=await(await directory.getFileHandle(entry.id)).getFile();Object.defineProperty(extracted,'relativePath',{value:entry.path});files.push(extracted)}
    return {files,dispose};
  }catch(e){await dispose().catch(()=>{});throw e}
}
