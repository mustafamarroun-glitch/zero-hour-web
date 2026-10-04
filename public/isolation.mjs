// Static hosts without COOP/COEP headers can isolate subsequent navigations.
// No game data or response caching is involved.
if(!crossOriginIsolated&&isSecureContext&&'serviceWorker' in navigator){
  try{
    await navigator.serviceWorker.register(new URL('./coi-serviceworker.js',import.meta.url),{scope:new URL('./',import.meta.url).pathname});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    if(!sessionStorage.getItem('zhweb-isolation-retry')){sessionStorage.setItem('zhweb-isolation-retry','1');location.reload();}
  }catch(e){console.warn('Static-host isolation unavailable',e.message);}
}else if(crossOriginIsolated)sessionStorage.removeItem('zhweb-isolation-retry');
