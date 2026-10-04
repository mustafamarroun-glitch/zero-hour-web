import './storage-scope.js';
import {assetLibrary} from './launcher-asset-manager.mjs';
const params=new URLSearchParams(location.search), name=params.get('commander');
let ready=false;
let roomTimer;
let controlSignature='';
const controlNames=/^LanGameOptionsMenu\.wnd:ComboBox(PlayerTemplate|Color|Team|Player)([0-7])$/;
const report=message=>{document.querySelector('#status').textContent=message;parent.postMessage({type:'zh-status',message},location.origin)};
async function checked(command,payload={}){const result=await window.CnCPort.rpc(command,payload);if(result?.ok===false)throw Error(result.error||`${command} failed`);return result}
export async function boot(){
  try{
    if(!name||!/^[A-Za-z0-9 _-]{2,12}$/.test(name))throw Error('Choose a valid commander name before launching.');
    if(!crossOriginIsolated)throw Error('Threaded runtime requires HTTPS and COOP/COEP isolation headers.');
    window.__cncDiagLevel='lite';
    await import('./bridge.js');
    await assetLibrary.archivesForLaunch();
    await checked('resumeBrowserAudioRuntime',{trigger:'standalone-launch'});
    report('Mounting your local archives…');
    await checked('mountPreparedArchives',{path:'/assets/real-init',verifyEach:false,archives:assetLibrary.preparedArchives,videos:[],includeVideos:false});
    if(params.get('room')){
      report('Connecting game transport…');
      const config=await fetch('../network-config.json').then(r=>r.json());
      await checked('browserWebRtcEndpointConnect',{room:`zhweb-${params.get('room')}`,peerId:params.get('guest'),displayName:name,relayUrls:[new URL(config.signaling,location.href).href.replace(/^http/,'ws')],iceServers:config.iceServers||[],timeoutMs:30000});
    }
    report('Initializing the engine…');
    const init=await checked('realEngineInit',{runDirectory:'/assets/real-init',shellMap:false,stepped:true,commanderName:name,bootWidth:1280,bootHeight:720});
    if(init.frontier?.initReturned!==true)throw Error('Engine initialization did not complete.');
    await checked('realEngineSetLoadStepping',{enabled:true,budgetMs:5});
    await checked('threadedStartLoop',{clientFps:60,logicFps:30});
    ready=true;
    document.querySelector('#loading').hidden=true;
    document.querySelector('#viewport').focus();
    for(const point of [{x:32,y:32},{x:96,y:96}])await checked('postMessage',{message:0x200,lParam:(point.y<<16)|point.x,point});
    parent.postMessage({type:'zh-ready',name,init},location.origin);
    if(params.get('room'))await enterRoom();
    else{
      await clickWhenReady('MainMenu.wnd:ButtonSinglePlayer');
      await clickWhenReady('MainMenu.wnd:ButtonSkirmish');
      const entry=await waitForWindow('SkirmishGameOptionsMenu.wnd:TextEntryPlayerName');
      await checked('agentUiSetText',{windowId:entry.id,name:entry.name,text:name});
      await checked('agentUiSubmit',{windowId:entry.id,name:entry.name});
      report('Choose your battlefield, faction and AI opponents. Your commander name is already set.');
    }
  }catch(error){report(error.message);document.querySelector('#retry').hidden=false;parent.postMessage({type:'zh-error',message:error.message},location.origin)}
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
document.querySelector('#retry').onclick=()=>parent.postMessage({type:'zh-exit'},location.origin);
window.addEventListener('cncport:threadedlooperror',e=>parent.postMessage({type:'zh-error',message:e.detail?.error||'Engine loop stopped. Exit and relaunch.'},location.origin));
window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==parent)return;
  try{
    if(e.data.type==='zh-volume'){const value=Math.max(0,Math.min(1,Number(e.data.value)));await checked('setBrowserAudioMixerVolumes',{scriptVolumes:{music:value,sound:value,sound3D:value,speech:value}});}
    if(e.data.type==='zh-lan-command'&&params.get('room'))await checked('realEngineLanCommand',{action:e.data.action,value:e.data.value||''});
    if(e.data.type==='zh-lan-select'&&params.get('room')){
      if(!controlNames.test(e.data.name))throw Error('Unknown match setting.');
      const w=(await checked('queryWindowByName',{name:e.data.name})).result;
      await checked('agentUiSelectIndex',{windowId:w.id,name:w.name,index:Number(e.data.index)});
      controlSignature='';
    }
    if(e.data.type==='zh-exit'){
      clearInterval(roomTimer);
      if(ready){await checked('threadedStopLoop',{timeoutMs:15000});window.CnCPort.stopSavePersistenceScheduling();await window.CnCPort.persistFinalSaves('standalone-exit');await checked('browserWebRtcEndpointDisconnect');await checked('forceShutdownRuntime');}
      parent.postMessage({type:'zh-exited'},location.origin);
    }
    if(e.data.type==='zh-diagnostics'){
      const result=await checked('threadedStatus');
      const frame=ready?await checked('realEngineFrame',{frames:1}):null;
      const transport=params.get('room')?await checked('browserWebRtcEndpointState'):null;
      parent.postMessage({type:'zh-diagnostics',result,frame,transport,userAgent:navigator.userAgent,isolation:crossOriginIsolated,graphics:params.get('shaderTier'),date:new Date().toISOString()},location.origin);
    }
  }catch(error){parent.postMessage({type:'zh-error',message:error.message},location.origin)}
});
boot();
