import './storage-scope.js';
import {PROFILES} from '../game-profiles.mjs';
import {VERSION} from '../preferences.mjs';
import {runRuntimeShutdownSequence,runtimeShutdownWarning,settleWithin} from './runtime-shutdown-sequence.mjs';
import {createFrameProfiler} from './frame-profiling.mjs';
const params=new URLSearchParams(location.search), name=params.get('commander');
const gameProfile=params.get('game')==='shockwave'?'shockwave':'zero-hour';
const {assetLibrary}=await import(gameProfile==='shockwave'?'../shockwave/library.mjs':'./launcher-asset-manager.mjs');
let ready=false,exiting=false,exitPromise,contextLossReported=false;
let roomTimer,healthTimer,healthBusy=false,displayBusy=false,showPerformance=false;
const canvas=document.querySelector('#viewport');
function reportWebglContextLoss(details){
  if(contextLossReported)return;
  contextLossReported=true;
  const message='The browser lost the game graphics context. This screen cannot recover in place; use Exit game to close safely.';
  report(message);
  parent.postMessage({type:'zh-webgl-context-lost',details:details||null},location.origin);
}
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();reportWebglContextLoss({at:new Date().toISOString(),canvas:{width:canvas.width,height:canvas.height}})});
window.addEventListener('cncport:webglcontextlost',event=>reportWebglContextLoss(event.detail));
let display={width:Number(params.get('width'))||1280,height:Number(params.get('height'))||720};
if(![1024,1280,1600,1920].includes(display.width)&&!(display.width>=800&&display.width<=1920))display.width=1280;
if(!(display.height>=600&&display.height<=1080))display.height=720;
let scaling='fit';
function fitCanvas(){const capWidth=scaling==='actual'?`, ${display.width}px`:'',capHeight=scaling==='actual'?`, ${display.height}px`:'';canvas.style.width=`min(100vw, calc(100vh * ${display.width} / ${display.height})${capWidth})`;canvas.style.height=`min(100vh, calc(100vw * ${display.height} / ${display.width})${capHeight})`;canvas.style.objectFit='contain'}
canvas.width=display.width;canvas.height=display.height;fitCanvas();
let controlSignature='';
const controlNames=/^LanGameOptionsMenu\.wnd:ComboBox(PlayerTemplate|Color|Team|Player)([0-7])$/;
const report=message=>{document.querySelector('#status').textContent=message;parent.postMessage({type:'zh-status',message},location.origin)};
async function checked(command,payload={}){if(exiting)throw Error('Game is closing.');const result=await window.CnCPort.rpc(command,payload);if(result?.ok===false)throw Error(result.error||`${command} failed`);return result}
const frameProfiler=createFrameProfiler({rpc:checked});
function exitRuntime(reason='toolbar'){
  if(exitPromise)return exitPromise;
  exiting=true;ready=false;clearInterval(roomTimer);clearInterval(healthTimer);
  parent.postMessage({type:'zh-exit-started',reason},location.origin);
  exitPromise=(async()=>{
    let result,warning;
    try{
      const bridge=window.CnCPort;
      if(bridge){
        result=await runRuntimeShutdownSequence({
          stopSaveScheduling:()=>bridge.stopSavePersistenceScheduling(),
          stopLoop:()=>bridge.rpc('threadedStopLoop',{timeoutMs:6000}),
          persistFinalSave:()=>bridge.persistFinalSaves(`standalone-exit:${reason}`),
          gracefulShutdown:()=>bridge.rpc('shutdownRuntime'),
          forceShutdown:()=>bridge.rpc('forceShutdownRuntime'),
        });
        warning=runtimeShutdownWarning({...result.result,close:result.close});
      }
    }catch(error){warning={message:`Game closed. Final save status could not be confirmed: ${error.message}`}}
    finally{parent.postMessage({type:'zh-exited',warning:warning?.message,shutdown:result},location.origin)}
  })();
  return exitPromise;
}
export async function boot(){
  try{
    if(!name||!/^[A-Za-z0-9 _-]{2,12}$/.test(name))throw Error('Choose a valid commander name before launching.');
    if(!crossOriginIsolated)throw Error('Threaded runtime requires HTTPS and COOP/COEP isolation headers.');
    window.__cncDiagLevel='lite';
    await assetLibrary.archivesForLaunch();
    await import('./bridge.js');
    // Archive-only installations may not include loose original cursor art.
    // Use the browser arrow instead of requesting upstream developer artifacts.
    window.__zhUseSystemCursor=!assetLibrary.summary().originalCursors;
    await checked('resumeBrowserAudioRuntime',{trigger:'standalone-launch'});
    report('Mounting your local archives…');
    const mounted=await checked('mountPreparedArchives',{path:'/assets/real-init',verifyEach:false,archives:assetLibrary.preparedArchives,mods:assetLibrary.preparedMods||[],videos:[],includeVideos:false});
    if(params.get('room')){
      report('Connecting game transport…');
      const config=await fetch('../network-config.json').then(r=>r.json());
      await checked('browserWebRtcEndpointConnect',{room:`zhweb-${params.get('room')}`,peerId:params.get('guest'),displayName:name,relayUrls:[new URL(config.signaling,location.href).href.replace(/^http/,'ws')],iceServers:config.iceServers||[],timeoutMs:30000});
    }
    report('Initializing the engine…');
    const init=await checked('realEngineInit',{runDirectory:'/assets/real-init',modDirectory:mounted.modDirectory||'',shellMap:false,stepped:true,commanderName:name,bootWidth:display.width,bootHeight:display.height});
    if(init.frontier?.initReturned!==true)throw Error('Engine initialization did not complete.');
    await checked('realEngineSetLoadStepping',{enabled:true,budgetMs:5});
    await checked('threadedStartLoop',{clientFps:60,logicFps:30});
    ready=true;
    document.querySelector('#loading').hidden=true;
    document.querySelector('#viewport').focus();
    // The native menu reveals its buttons after two distinct mouse positions.
    // Consume each position in a frame so the input queue cannot coalesce them.
    for(const point of [{x:32,y:32},{x:96,y:96},{x:160,y:120}]){
      await checked('postMessage',{message:0x200,lParam:(point.y<<16)|point.x,point});
      await checked('realEngineFrame',{frames:1});
    }
    if(params.get('room'))await enterRoom();
    else{
      await clickWhenReady('MainMenu.wnd:ButtonSinglePlayer');
      await clickWhenReady('MainMenu.wnd:ButtonSkirmish');
      const entry=await waitForWindow('SkirmishGameOptionsMenu.wnd:TextEntryPlayerName');
      await checked('agentUiSetText',{windowId:entry.id,name:entry.name,text:name});
      await checked('agentUiSubmit',{windowId:entry.id,name:entry.name});
      report('Choose your battlefield, faction and AI opponents. Your commander name is already set.');
    }
    parent.postMessage({type:'zh-ready',name,init},location.origin);
    healthTimer=setInterval(async()=>{
      if(healthBusy||displayBusy)return;healthBusy=true;
      try{
        const result=await checked('realEngineFrame',{frames:1});
        frameProfiler.observe(result.frame);
        const state=result.frame?.clientState;
        parent.postMessage({type:'zh-gameplay',inGame:state?.gameplay?.inGame===true&&!state?.gameplay?.loadingMap},location.origin);
        if(showPerformance){const status=(await checked('threadedStatus')).status;const renderer=status?.graphics?.renderer||'';parent.postMessage({type:'zh-performance',renderer:/SwiftShader/i.test(renderer)?'Software graphics':'Graphics',width:display.width,height:display.height,logicFrame:state?.logicFrame??state?.gameplay?.logicFrame},location.origin)}
      }catch(error){parent.postMessage({type:'zh-error',message:error.message},location.origin)}finally{healthBusy=false}
    },2000);
  }catch(error){if(exiting)return;report(error.message);document.querySelector('#retry').hidden=false;parent.postMessage({type:'zh-error',message:error.message},location.origin)}
}
async function clickWhenReady(windowName){
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    const query=await window.CnCPort.rpc('queryWindowByName',{name:windowName});
    const frame=await checked('realEngineFrame',{frames:1});
    const state=frame.frame?.clientState;
    if(query.result?.clickable===true&&state?.transition?.finished===true&&state?.mainMenu?.debug?.dontAllowTransitions===0){const click=await window.CnCPort.rpc('clickWindowByName',{name:windowName});if(click.ok)return;}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error(`Could not open ${windowName}. Use the native Multiplayer → Anonymous menu or exit and retry.`);
}
async function waitForWindow(name){const deadline=Date.now()+30000;while(Date.now()<deadline){const q=await window.CnCPort.rpc('queryWindowByName',{name});if(q.result?.clickable)return q.result;await new Promise(r=>setTimeout(r,300));}throw Error(`Game window ${name} did not become ready. Exit and retry.`);}
async function enterRoom(){
  report('Opening the native network lobby…');
  await clickWhenReady('MainMenu.wnd:ButtonMultiplayer');
  await new Promise(r=>setTimeout(r,1500));
  await clickWhenReady('MainMenu.wnd:ButtonNetwork');
  const deadline=Date.now()+60000;let lan;
  while(Date.now()<deadline){lan=(await checked('realEngineLanState')).lan;if(lan?.lanReady&&lan.localIp)break;await new Promise(r=>setTimeout(r,400));}
  if(!lan?.localIp)throw Error('Game transport did not obtain a virtual LAN address. Exit and reconnect.');
  await checked('realEngineLanCommand',{action:'setName',value:name});
  if(params.get('host')==='1')await checked('realEngineLanCommand',{action:'host',value:`ZH ${params.get('room')}`});
  else{
    let joined=false;
    const discoveryDeadline=Date.now()+120000;
    while(Date.now()<discoveryDeadline){const state=(await checked('realEngineLanState')).lan;if(state?.discoveredGames>0){await checked('realEngineLanCommand',{action:'joinFirst'});joined=true;break;}await new Promise(r=>setTimeout(r,600));}
    if(!joined)throw Error('Host game was not discovered. Ask the host to enter the game room, then exit and retry.');
  }
  const maps=await checked('mapCacheProbe');
  parent.postMessage({type:'zh-maps',maps},location.origin);
  let polling=false;
  roomTimer=setInterval(async()=>{if(polling)return;polling=true;try{
    const state=await checked('realEngineLanState');const transport=await checked('browserWebRtcEndpointState');
    parent.postMessage({type:'zh-room-state',state:state.lan,transport:transport.runtime},location.origin);
    if(!state.lan?.network?.ready)await sendRoomControls();
  }catch(e){report(e.message)}finally{polling=false}},2000);
}

async function sendRoomControls(){
  const snapshot=(await checked('agentUiSnapshot')).result;
  const windows=(snapshot?.windows||[]).filter(w=>controlNames.test(w.name)&&w.visible);
  const signature=JSON.stringify(windows.map(w=>[w.name,w.enabled,w.interactive,w.selectedIndex,w.itemCount]));
  if(signature===controlSignature)return;
  const controls=[];
  for(const w of windows){
    if(!w.interactive)continue;
    const list=(await checked('agentUiListItems',{windowId:w.id,name:w.name,limit:64})).result;
    const match=w.name.match(controlNames);
    controls.push({name:w.name,slot:Number(match[2]),kind:match[1],selectedIndex:w.selectedIndex,rows:list.rows||[]});
  }
  controlSignature=signature;
  parent.postMessage({type:'zh-room-controls',controls},location.origin);
}
document.querySelector('#retry').onclick=()=>exitRuntime('retry');
window.addEventListener('cncport:runtimequit',()=>exitRuntime('native-menu'));
window.addEventListener('cncport:threadedlooperror',e=>parent.postMessage({type:'zh-error',message:e.detail?.error||'Engine loop stopped. Exit and relaunch.'},location.origin));
window.addEventListener('cncport:resolutionchange',e=>{display={width:e.detail.width,height:e.detail.height};fitCanvas()});
document.addEventListener('keydown',e=>{if(e.key==='F8'||(e.altKey&&e.key==='Enter')){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'zh-shortcut',action:e.key==='F8'?'toolbar':'fullscreen'},location.origin)}},true);
canvas.addEventListener('pointerdown',()=>parent.postMessage({type:'zh-game-focus'},location.origin));
document.addEventListener('pointermove',e=>{
  if(!ready||e.target===canvas||e.pointerType==='touch'||e.buttons)return;
  const box=canvas.getBoundingClientRect(),inset=window.__zhEdgeScrolling===false?8:0;
  const point={x:Math.max(inset,Math.min(display.width-inset-1,Math.round((e.clientX-box.left)*display.width/box.width))),y:Math.max(inset,Math.min(display.height-inset-1,Math.round((e.clientY-box.top)*display.height/box.height)))};
  void checked('postMessage',{message:0x200,lParam:(point.y<<16)|point.x,point}).catch(()=>{});
});
window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==parent)return;
  if(e.data?.type==='zh-exit'){await exitRuntime();return;}
  if(exiting)return;
  try{
    if(e.data.type==='zh-profiling'){
      let error;
      try{if(!ready)throw Error('Launch the game and wait for the skirmish menu first.');await frameProfiler.set(e.data.enabled);}
      catch(reason){error=reason.message;}
      if(!exiting)parent.postMessage({type:'zh-profiling-result',requestId:e.data.requestId,profiling:frameProfiler.snapshot(),error},location.origin);
      return;
    }
    if(e.data.type==='zh-volume'){const music=Math.max(0,Math.min(1,Number(e.data.music??e.data.value))),effects=Math.max(0,Math.min(1,Number(e.data.effects??e.data.value)));if(Number.isFinite(music)&&Number.isFinite(effects))await checked('setBrowserAudioMixerVolumes',{scriptVolumes:{music,sound:effects,sound3D:effects,speech:effects}});}
    if(e.data.type==='zh-focus')canvas.focus({preventScroll:true});
    if(e.data.type==='zh-input-neutral'&&ready){const point={x:Math.round(display.width/2),y:Math.round(display.height/2)};await checked('postMessage',{message:0x200,lParam:(point.y<<16)|point.x,point});}
    if(e.data.type==='zh-display'){
      window.__zhEdgeScrolling=e.data.edgeScroll!==false;showPerformance=e.data.performance===true;scaling=e.data.scaling==='actual'?'actual':'fit';fitCanvas();
      if(e.data.resize&&ready&&!displayBusy){
        const width=Number(e.data.width),height=Number(e.data.height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<800||width>1920||height<600||height>1080)throw Error('Unsupported render resolution.');
        displayBusy=true;
        try{const result=await checked('setEngineResolution',{width,height});display=result.applied||{width,height};fitCanvas();parent.postMessage({type:'zh-display-result',ok:true,...display},location.origin)}
        catch(error){parent.postMessage({type:'zh-display-result',ok:false,error:error.message,...display},location.origin)}finally{displayBusy=false}
      }
    }
    if(e.data.type==='zh-lan-command'&&params.get('room'))await checked('realEngineLanCommand',{action:e.data.action,value:e.data.value||''});
    if(e.data.type==='zh-lan-select'&&params.get('room')){
      if(!controlNames.test(e.data.name))throw Error('Unknown match setting.');
      const w=(await checked('queryWindowByName',{name:e.data.name})).result;
      await checked('agentUiSelectIndex',{windowId:w.id,name:w.name,index:Number(e.data.index)});
      controlSignature='';
    }
    if(e.data.type==='zh-diagnostics'){
      const [result,frame,transport]=await Promise.all([
        settleWithin(checked('threadedStatus'),5000,'Engine status'),
        ready?settleWithin(checked('realEngineFrame',{frames:1}),5000,'Game frame'):null,
        params.get('room')?settleWithin(checked('browserWebRtcEndpointState'),5000,'Game transport'):null,
      ]);
      if(frame?.ok===true)frameProfiler.observe(frame.value?.frame);
      parent.postMessage({type:'zh-diagnostics',version:VERSION,runtime:PROFILES[gameProfile].runtime,display,result,frame,transport,profiling:frameProfiler.snapshot(),userAgent:navigator.userAgent,isolation:crossOriginIsolated,graphics:params.get('shaderTier'),date:new Date().toISOString()},location.origin);
    }
  }catch(error){parent.postMessage({type:'zh-error',message:error.message},location.origin)}
});
boot();
