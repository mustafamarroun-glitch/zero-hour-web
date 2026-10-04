// Integration surrounds the pinned runtime; no executable or simulation patches.
const frame=document.getElementById('runtime'),query=new URLSearchParams(location.search);
let preferences={};try{preferences=JSON.parse(query.get('settings')||'{}')}catch{}
const send=data=>parent.postMessage(data,location.origin);
const available=[[800,600],[1024,768],[1280,720],[1280,800],[1440,900],[1600,900],[1920,1080]];
const requested=[Number(query.get('width'))||1280,Number(query.get('height'))||720];
const size=available.reduce((best,value)=>Math.abs(value[0]-requested[0])+Math.abs(value[1]-requested[1])<Math.abs(best[0]-requested[0])+Math.abs(best[1]-requested[1])?value:best,available[0]);
try{localStorage.setItem('zhweb-yuri-preferred-game','yr');localStorage.setItem('zhweb-yuri-resolution-yr',size.join('x'));localStorage.setItem('zhweb-yuri-master-volume','100')}catch{}
const url=new URL('./engine/runtime/',location.href);url.searchParams.set('debug','1');
const session=query.get('session');if(/^[a-f0-9]{24}$/.test(session||'')){
 try{
  const response=await fetch(new URL('../network-config.json',import.meta.url));if(!response.ok)throw Error('Yuri multiplayer configuration is unavailable.');
  const config=await response.json(),service=new URL(config.yuriRelay||config.rooms||location.origin,location.origin),relay=new URL('/yuri-'+session,service);
  if(!['ws:','wss:','http:','https:'].includes(relay.protocol))throw Error('Invalid Yuri relay address.');
  relay.protocol=relay.protocol==='https:'||relay.protocol==='wss:'?'wss:':'ws:';
  if(location.protocol==='https:'&&relay.protocol!=='wss:')throw Error('Yuri multiplayer requires a secure relay.');
  url.searchParams.set('network','1');url.searchParams.set('relay',relay.href);
 }catch(error){send({type:'zh-error',message:error.message});throw error}
}
frame.src=url.href;
if(preferences.scaling==='actual'){document.body.className='actual';frame.style.width=`min(100%, ${size[0]}px)`;frame.style.height=`min(100%, ${size[1]}px)`}
let ready=false,lastStatus='',effectsApplied=false;
const timer=setInterval(()=>{
 try{
  const doc=frame.contentDocument,canvas=doc?.getElementById('screen');if(!canvas)return;
  if(!ready){ready=true;send({type:'zh-ready'});send({type:'zh-status',message:session?'Network: host creates, guest joins':'Choose Single Player → Skirmish'});frame.focus();
   doc.addEventListener('keydown',event=>{if(event.key==='F8'||event.altKey&&event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();send({type:'zh-shortcut',action:event.key==='F8'?'toolbar':'fullscreen'})}},true);
  }
  if(!effectsApplied){const select=doc.getElementById('vm-reshade-mode');if(select){select.value=preferences.graphics==='ps11'?'enhance':'off';select.dispatchEvent(new Event('change',{bubbles:true}));effectsApplied=true}}
  const status=canvas.dataset.vmStatus||'';if(status!==lastStatus){lastStatus=status;let state;try{state=JSON.parse(status)}catch{}if(state?.phase==='failed')send({type:'zh-error',message:state.detail||'Yuri could not start. Check your installation.'})}
  send({type:'zh-performance',renderer:'Yuri WebGL2',width:size[0],height:size[1],logicFrame:Number(canvas.dataset.vmFrame)||0});
 }catch(error){send({type:'zh-error',message:error.message});clearInterval(timer)}
},750);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent)return;
 if(event.data?.type==='zh-focus')frame.focus();
 if(event.data?.type==='zh-input-neutral')frame.contentDocument?.exitPointerLock?.();
 if(event.data?.type==='zh-diagnostics')send({type:'zh-diagnostics',runtime:'ra2-vm-a10ac989',state:{...frame.contentDocument?.getElementById('screen')?.dataset}});
});
window.addEventListener('pagehide',()=>clearInterval(timer));
