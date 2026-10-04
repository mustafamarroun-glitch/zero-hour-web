// Presentation-only integration loaded before the unmodified native runtime.
(()=>{
 const query=new URLSearchParams(location.search),limitRatio=query.get('display-ratio')==='1';
 const realRatio=window.devicePixelRatio||1;
 // Scope the presentation ratio to this iframe. Guest frames, input coordinates,
 // VM timing and the containing website retain their original semantics.
 if(limitRatio&&realRatio>1){try{Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>1})}catch{}}
 document.documentElement.dataset.presentationRatio=String(window.devicePixelRatio);
 try{if(localStorage.getItem('zhweb-yuri-touch-controls-hidden')===null)localStorage.setItem('zhweb-yuri-touch-controls-hidden','1')}catch{}
 // Native chunks load additional CSS lazily; keep our presentation rules last.
 const style=document.getElementById('yuri-player-style');
 const styles=new MutationObserver(()=>{
  const links=document.head.querySelectorAll('link[rel="stylesheet"]');
  if(style&&links[links.length-1]!==style)document.head.append(style);
 });
 styles.observe(document.head,{childList:true});
 const send=data=>parent.postMessage(data,location.origin);
 let lastState='',timer;
 function snapshot(){
  const canvas=document.getElementById('screen');if(!canvas)return;
  const root=document.querySelector('#root > div'),nextPhase=root?.classList.contains('game-running')?'running':root?.classList.contains('game-home')?'loading':'waiting';
  const output=document.getElementById('vm-fps'),fps=output?.textContent||'',renderer=output?.title||'';
  const status=document.querySelector('#ui .panel')?.textContent?.trim()||'';
  return {phase:nextPhase,fps,status,renderer,softwareRenderer:/llvmpipe|swiftshader|software|mesa offscreen/i.test(renderer),presentationRatio:window.devicePixelRatio,physicalRatio:realRatio,buffer:[canvas.width,canvas.height],display:[canvas.clientWidth,canvas.clientHeight],viewport:[innerWidth,innerHeight],shellPage:canvas.dataset.shellPage||'',upscale:document.getElementById('vm-upscale-mode')?.value||'off',effects:document.getElementById('vm-reshade-mode')?.value||'off'};
 }
 function report(){
  const state=snapshot();if(!state)return;
  const signature=JSON.stringify(state);if(signature!==lastState){lastState=signature;send({type:'yuri-player-state',...state})}
 }
 // Prevent an accidental backtick from enabling expensive tracing during play.
 // Other native keys, pointer input and adaptive touch controls remain intact.
 document.addEventListener('keydown',event=>{
  if(event.key==='`'||event.code==='Backquote'){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent)return;
  if(event.data?.type==='yuri-player-diagnostics'){send({type:'yuri-player-diagnostics',state:{...snapshot(),hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemory:navigator.deviceMemory??null,isolation:crossOriginIsolated,visibility:document.visibilityState}});return;}
  const action=event.data?.type==='yuri-player-tool'&&event.data.action;
 const ids={downloadSave:'vm-save-download',uploadSave:'vm-save-upload',maps:'vm-custom-maps',performance:'vm-performance-diagnostics'};
  const button=ids[action]&&document.getElementById(ids[action]);
  if(action){
   if(!button||button.disabled){send({type:'yuri-player-tool-error',message:'Wait for Yuri to finish loading, then try again.'});return;}
   button.click();
  }
 });
 window.addEventListener('error',event=>send({type:'yuri-player-error',message:event.message||'Yuri could not start.'}));
 window.addEventListener('unhandledrejection',event=>send({type:'yuri-player-error',message:event.reason?.message||String(event.reason)}));
 document.addEventListener('DOMContentLoaded',()=>{report();timer=setInterval(report,1000)},{once:true});
 window.addEventListener('pagehide',()=>{clearInterval(timer);styles.disconnect()});
})();
