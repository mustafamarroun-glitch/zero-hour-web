/* Standalone storage boundary. GPL-3.0-or-later.
 * GitHub Pages repositories on one account share an origin. Keep every legacy
 * engine/importer key and OPFS path inside this product's own namespace.
 */
(()=>{
 if(globalThis.__zhwebStorageScoped)return;
 globalThis.__zhwebStorageScoped=true;
 const shockwave=typeof location!=='undefined'&&(/\/shockwave(?:\/|$)/.test(location.pathname)||new URLSearchParams(location.search).get('game')==='shockwave');
 globalThis.__zhwebGame=shockwave?'shockwave':'zero-hour';
 const prefix=shockwave?'zero-hour-web-v1:shockwave:':'zero-hour-web-v1:';
 // Every ShockWave worker must open the same isolated storage, including pthread and I/O realms.
 if(shockwave&&typeof Worker==='function'){
  const NativeWorker=globalThis.Worker;
  globalThis.Worker=new Proxy(NativeWorker,{construct(Target,args){
   const url=new URL(String(args[0]),location.href);
   if(url.origin===location.origin&&/\.(?:m?js)$/.test(url.pathname)){url.searchParams.set('game','shockwave');args=[url.href,...args.slice(1)]}
   return Reflect.construct(Target,args);
  }});
 }
 if(shockwave&&globalThis.indexedDB){
  const open=indexedDB.open.bind(indexedDB),remove=indexedDB.deleteDatabase.bind(indexedDB);
  indexedDB.open=(name,...args)=>open(prefix+name,...args);
  indexedDB.deleteDatabase=name=>remove(prefix+name);
 }
 if(typeof window!=='undefined')for(const name of ['localStorage','sessionStorage']){
  try{
   const native=window[name],keys=()=>Array.from({length:native.length},(_,i)=>native.key(i)).filter(k=>k?.startsWith(prefix)&&(shockwave||!k.startsWith(prefix+'shockwave:')));
   const methods={getItem:key=>native.getItem(prefix+key),setItem:(key,value)=>native.setItem(prefix+key,value),removeItem:key=>native.removeItem(prefix+key),clear:()=>keys().forEach(k=>native.removeItem(k)),key:index=>keys()[index]?.slice(prefix.length)||null};
   const scoped=new Proxy(methods,{get:(target,key)=>key==='length'?keys().length:typeof key==='symbol'?Reflect.get(target,key):key in target?target[key]:native.getItem(prefix+key),set:(target,key,value)=>{native.setItem(prefix+String(key),value);return true},deleteProperty:(target,key)=>{native.removeItem(prefix+String(key));return true},ownKeys:()=>keys().map(k=>k.slice(prefix.length)),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
   Object.defineProperty(window,name,{configurable:true,value:scoped});
  }catch(error){console.warn('Standalone storage unavailable',error.message);}
 }
 if(navigator.storage?.getDirectory){
  const native=navigator.storage.getDirectory.bind(navigator.storage);
  navigator.storage.getDirectory=async()=>{const root=await(await native()).getDirectoryHandle('zero-hour-web-v1',{create:true});return shockwave?root.getDirectoryHandle('shockwave-v1',{create:true}):root};
 }
})();
