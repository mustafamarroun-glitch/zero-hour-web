/* Standalone storage boundary. GPL-3.0-or-later.
 * GitHub Pages repositories on one account share an origin. Keep every legacy
 * engine/importer key and OPFS path inside this product's own namespace.
 */
(()=>{
 if(globalThis.__zhwebStorageScoped)return;
 globalThis.__zhwebStorageScoped=true;
 const prefix='zero-hour-web-v1:';
 if(typeof window!=='undefined')for(const name of ['localStorage','sessionStorage']){
  try{
   const native=window[name],keys=()=>Array.from({length:native.length},(_,i)=>native.key(i)).filter(k=>k?.startsWith(prefix));
   const methods={getItem:key=>native.getItem(prefix+key),setItem:(key,value)=>native.setItem(prefix+key,value),removeItem:key=>native.removeItem(prefix+key),clear:()=>keys().forEach(k=>native.removeItem(k)),key:index=>keys()[index]?.slice(prefix.length)||null};
   const scoped=new Proxy(methods,{get:(target,key)=>key==='length'?keys().length:typeof key==='symbol'?Reflect.get(target,key):key in target?target[key]:native.getItem(prefix+key),set:(target,key,value)=>{native.setItem(prefix+String(key),value);return true},deleteProperty:(target,key)=>{native.removeItem(prefix+String(key));return true},ownKeys:()=>keys().map(k=>k.slice(prefix.length)),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
   Object.defineProperty(window,name,{configurable:true,value:scoped});
  }catch(error){console.warn('Standalone storage unavailable',error.message);}
 }
 if(navigator.storage?.getDirectory){
  const native=navigator.storage.getDirectory.bind(navigator.storage);
  navigator.storage.getDirectory=async()=> (await native()).getDirectoryHandle('zero-hour-web-v1',{create:true});
 }
})();
