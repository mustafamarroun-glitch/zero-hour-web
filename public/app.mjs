import './isolation.mjs';
import './harness/storage-scope.js';
import {PROFILES} from './game-profiles.mjs';
import {buildArchiveZip,buildFileZip} from './harness/launcher-backup-zip.mjs';
import {extractGameArchive,cleanArchiveStaging} from './harness/archive-import.mjs';
import {VERSION,DEFAULTS,gameDefaults,loadPreferences,savePreferences,resolutionSize} from './preferences.mjs';
import {diagnosticReport,recordError} from './diagnostics.mjs';
const $=id=>document.getElementById(id), key='zhweb-identity-v1';
const profile=PROFILES[document.documentElement.dataset.game]||PROFILES['zero-hour'],isYuri=profile.id==='yuri';
if(matchMedia('(pointer: coarse)').matches){$('hideToolbar').textContent='Hide';$('revealToolbar').textContent='Menu';}
const {assetLibrary}=await import(isYuri?'./yuri/library.mjs':'./harness/launcher-asset-manager.mjs');
let identity,installed=false,importing=false,importController,backupController,zipUrl,roomSocket,roomState,connecting=false,gameReady=false,inMatch=false,hideTimer,resizeTimer,confirmCallback;
let preferences=loadPreferences(profile.id),releaseGameFiles,restoreTask=Promise.resolve();
let libraryBusy=false,launching=false,exiting=false,exitTimer,forceExitTimer,diagnosticRequest;
let profilingEnabled=false,profilingBusy=false,profilingRequestId,profilingTimer,profilingError='';
try{identity=JSON.parse(localStorage.getItem(key)||'null')}catch{}
const error=message=>{recordError(message);$('error').textContent=message;$('error').hidden=!message};
function view(id){for(const name of ['entry','setup','lobby','room'])$(name).hidden=name!==id;error('')}
function setImportCopy(replacement){
  const replacing=replacement&&installed;
  $('setupTitle').textContent=replacing?'Replace your installed game.':'Prepare for deployment.';
  $('setupDescription').textContent=replacing?`Choose a compatible ZIP, RAR, or ${isYuri?'game':'Data'} folder. Your current installation stays available until the replacement passes validation.`:`Import your compatible ${isYuri?'Red Alert 2 + Yuri’s Revenge':'Generals + Zero Hour'} files. They stay on this device.`;
}
function showSetup(replacement=false){setImportCopy(replacement);view('setup');$('backToLibrary').hidden=!installed;if(replacement)setTimeout(()=>{if(!$('setup').hidden)$('chooseFolder').focus()},0)}
function progress(p){const stage=p.phase==='scan'?'Validating files':p.phase==='prepare'?'Saving game files':p.phase||'Processing local files';$('installProgress').textContent=`${stage}${p.detail?`: ${p.detail}`:''}`;$('progress').hidden=false;const total=p.totalBytes||p.total;const completed=p.completedBytes||p.completed||0;if(total)$('progress').value=completed/total;else $('progress').removeAttribute('value')}
function restoreIdentity(){if(identity?.name){$('commander').textContent=identity.name;document.querySelector('.identity').hidden=false;return true}return false}
function restore(){return restoreTask=restoreLibrary()}
async function restoreLibrary(){
  if(!restoreIdentity()){view('entry');return;}
  showSetup();
  try{installed=!!await assetLibrary.verifyInstalledLibrary();if(installed){await assetLibrary.archivesForLaunch();showLobby()}else{ $('backToLibrary').hidden=true;if(assetLibrary.lastValidationError)error(assetLibrary.lastValidationError)}}catch(e){$('backToLibrary').hidden=true;error(`Installed files could not be restored: ${e.message}. Import your folder again.`)}
}
function showLobby(){view('lobby');$('librarySummary').textContent=`Local installation ready · ${assetLibrary.installedLibrary()?.archives.length||0} validated ${isYuri?'files':'archives'} · ${assetLibrary.summary().formattedBytes}`;updateStorage();const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite;$('joinForm').requestSubmit()}}
$('nameForm').onsubmit=e=>{e.preventDefault();const name=$('name').value.trim();if(!/^[A-Za-z0-9 _-]{2,12}$/.test(name)){error('Use 2–12 letters, numbers, spaces, underscores or hyphens.');return;}identity={name,guest:identity?.guest||crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(identity))}catch{error('Browser storage is unavailable. Allow site storage to remember your commander name.');return;}restore()};
$('changeName').onclick=()=>{if(roomSocket){error('Leave your room before changing your commander name.');return;}$('name').value=identity?.name||'';view('entry');$('name').focus()};
async function importFiles(files,archive=false){
  if(importing||!files.length)return;
  if(!restoreIdentity()){view('entry');error('Enter your commander name before importing files.');return;}
  if(libraryBusy||launching||$('exportLibrary').disabled||!$('gameView').hidden){error('Wait for the current file operation or exit the game before importing.');return;}
  importing=true;importController=new AbortController();const controller=importController;let extracted;
  error('');$('cancelImport').hidden=false;for(const id of ['chooseFolder','chooseFiles','chooseArchive','backToLibrary'])$(id).disabled=true;
  try{
    await restoreTask;
    if(archive){extracted=await extractGameArchive(files[0],{signal:controller.signal,onProgress:progress,profile:profile.archiveProfile});files=extracted.files;}
    controller.signal.throwIfAborted();
    const scan=await assetLibrary.scan(files,{onProgress:progress,signal:controller.signal});
    controller.signal.throwIfAborted();
    if(!scan.ok)throw Error(scan.error||scan.detail||`Missing required files: ${(scan.missing||scan.missingArchives||[]).map(v=>v.name||v).join(', ')}`);
    const result=await assetLibrary.prepare('install',progress,{signal:controller.signal});installed=true;$('cancelImport').disabled=true;
    progress({phase:'Finishing installation',detail:'Cleaning temporary extraction files'});
    await extracted?.dispose().catch(e=>recordError(`Temporary extraction cleanup: ${e.message}`));extracted=null;showLobby();if(result.warning)$('backupStatus').textContent=result.warning.message;
  }catch(e){installed=!!assetLibrary.installedLibrary();setImportCopy(installed);$('backToLibrary').hidden=!installed;error(controller.signal.aborted?'Import cancelled. Your previous installation is preserved.':`${e.message}. Select a complete compatible ${isYuri?'Yuri game':'Data'} folder and retry.`);}
  finally{await extracted?.dispose().catch(()=>{});importing=false;importController=null;$('cancelImport').hidden=true;$('cancelImport').disabled=false;$('progress').hidden=true;for(const id of ['chooseFolder','chooseFiles','chooseArchive','backToLibrary'])$(id).disabled=false;$('folderInput').value=$('fileInput').value=$('archiveInput').value='';}
}
$('chooseFolder').onclick=()=> $('folderInput').click();$('chooseFiles').onclick=()=>$('fileInput').click();
$('folderInput').onchange=e=>importFiles([...e.target.files]);$('fileInput').onchange=e=>importFiles([...e.target.files]);
$('chooseArchive').onclick=()=>$('archiveInput').click();$('archiveInput').onchange=e=>importFiles([...e.target.files],true);
// Prevent a dropped local archive navigating away from the installation flow.
const dropZone=$('importDrop');let dragDepth=0;
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault()});
dropZone.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;dropZone.classList.add('dragging')}});
dropZone.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;dropZone.classList.remove('dragging')}});
document.addEventListener('drop',event=>{
  if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth=0;dropZone.classList.remove('dragging');
  if(!dropZone.contains(event.target)||$('setup').hidden){error('Open Import another installation, then drop a ZIP or RAR in the installation area.');return;}
  const items=[...event.dataTransfer.items];if(items.some(item=>item.webkitGetAsEntry?.()?.isDirectory)){error('For folders, use Choose game folder. You can drop a ZIP or RAR here.');return;}
  const files=[...event.dataTransfer.files],archives=files.filter(file=>/\.(zip|rar)$/i.test(file.name));
  if(archives.length&&(files.length!==1||archives.length!==1)){error('Choose one ZIP or RAR at a time. Your installed game is kept.');return;}
  importFiles(files,archives.length===1);
});
$('cancelImport').onclick=()=>{if(!importing)return;importController?.abort();assetLibrary.recoverWorker(assetLibrary.worker,'Import cancelled');$('cancelImport').disabled=true;error('Cancelling import…');};
$('replaceLibrary').onclick=$('settingsReplaceLibrary').onclick=()=>{try{if(libraryBusy)throw Error('Wait for the current file check to finish.');assertLibraryIdle('import replacement files');$('settings').close();showSetup(true)}catch(e){$('settingsStorageStatus').textContent=e.message;error(e.message)}};
$('backToLibrary').onclick=()=>restore();
async function installedFiles(){
  if(assetLibrary.filesForBackup)return assetLibrary.filesForBackup();
  const entries=[];for(const archive of assetLibrary.installedLibrary().archives){let dir=await navigator.storage.getDirectory();const parts=archive.opfsPath.split('/');const name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);entries.push({name:archive.name,file:await(await dir.getFileHandle(name)).getFile()});}return entries;
}
$('exportLibrary').onclick=async()=>{
  backupController=new AbortController();$('exportLibrary').disabled=true;$('cancelBackup').hidden=false;$('saveZip').hidden=true;error('');
  try{const entries=await installedFiles();const result=await (isYuri?buildFileZip:buildArchiveZip)(entries,{signal:backupController.signal,onProgress:p=>{$('backupStatus').textContent=p.detail||`Preparing ${p.name||'backup'}…`;}});if(zipUrl)URL.revokeObjectURL(zipUrl);zipUrl=URL.createObjectURL(result.blob||result);$('saveZip').href=zipUrl;$('saveZip').hidden=false;$('backupStatus').textContent=isYuri?'Backup ready. Save ZIP and import it directly into the website. Stored saves are kept separately.':'Backup ready. Save ZIP and import it directly into Version 2. Original cursor art and saved matches are not included in this game-archive backup.';}catch(e){error(e.message)}finally{$('exportLibrary').disabled=false;$('cancelBackup').hidden=true;}
};$('cancelBackup').onclick=()=>backupController?.abort();
async function launch(room){
  error('');if(!installed||!$('gameView').hidden||libraryBusy||launching||importing||$('exportLibrary').disabled)return;
  if(!restoreIdentity()){view('entry');error('Enter your commander name before launching.');return;}
  launching=true;
  $('solo').disabled=$('roomLaunch').disabled=true;
  try{
    $('librarySummary').textContent='Checking installed files before launch…';
    if(!await assetLibrary.verifyInstalledLibrary())throw Error(assetLibrary.lastValidationError||'Installed files are missing. Import a complete game again.');
    await assetLibrary.archivesForLaunch();
    const url=new URL(isYuri?'./yuri/play.html':'./harness/game.html',import.meta.url);url.searchParams.set('commander',identity.name);url.searchParams.set('shaderTier',preferences.graphics);const size=currentResolution();url.searchParams.set('width',size.width);url.searchParams.set('height',size.height);
    if(isYuri){await assetLibrary.configureForLaunch(preferences,identity.name);releaseGameFiles=await assetLibrary.holdForGame();url.searchParams.set('settings',JSON.stringify(preferences));if(room)url.searchParams.set('session',room.relayCode);}
    if(room){url.searchParams.set('room',room.code);url.searchParams.set('guest',identity.guest);url.searchParams.set('host',room.players.find(p=>p.name===identity.name)?.host?'1':'0');}
    gameReady=false;inMatch=false;resetProfiling();$('gameName').textContent=identity.name;$('gameStatus').textContent='Restoring local files…';$('gameFrame').src=url.href;$('gameView').hidden=false;document.body.classList.add('playing');document.querySelector('header').inert=document.querySelector('main').inert=document.querySelector('footer').inert=true;setToolbar(true);$('gameFrame').focus();
  }catch(e){await releaseGameFiles?.();releaseGameFiles=null;installed=!!assetLibrary.installedLibrary();if(!installed){view('setup');$('backToLibrary').hidden=true}error(e.message)}finally{launching=false;$('solo').disabled=false;$('roomLaunch').disabled=!!roomState&&!roomState.compatible}
}
$('solo').onclick=()=>launch();
$('exitGame').onclick=()=>{if(isYuri||inMatch)confirmAction('Exit this match?',isYuri?'Save inside Yuri first. This closes the game session. Installed files and committed saves are kept.':'Your current match will end. The engine will flush local saves before closing.','Exit game',exitGame);else exitGame()};
function watchExit(){if(exiting)return;exiting=true;syncProfiling();setToolbar(true);$('exitGame').disabled=true;$('gameStatus').textContent='Saving and shutting down…';forceExitTimer=setTimeout(()=>{$('forceExit').hidden=false;$('gameStatus').textContent='Shutdown is taking longer. You can wait or force close.'},12000);exitTimer=setTimeout(()=>closeGame('Game force-closed after shutdown timed out. The latest save could not be confirmed.'),60000)}
function exitGame(){if(isYuri){closeGame();return}watchExit();postGame({type:'zh-exit'})}
function closeGame(warning){clearTimeout(exitTimer);clearTimeout(forceExitTimer);clearTimeout(hideTimer);exiting=false;gameReady=false;inMatch=false;resetProfiling();$('settings').close();$('help').close();$('confirmAction').close();$('graphicsLost').close();$('gameFrame').src='about:blank';$('gameView').hidden=true;document.body.classList.remove('playing');document.querySelector('header').inert=document.querySelector('main').inert=document.querySelector('footer').inert=false;releaseGameFiles?.();releaseGameFiles=null;$('matchControls').hidden=true;$('matchControls').replaceChildren();$('exitGame').disabled=false;$('forceExit').hidden=true;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(warning)error(warning);else $('maintenanceStatus').textContent='Game closed. Your installed files are ready for another launch.';$('solo').focus();}
$('forceExit').onclick=()=>confirmAction('Force close the game?','The latest save may not have finished writing. Previously stored saves and your installation will remain.','Force close',()=>closeGame('Game force-closed. The latest save could not be confirmed.'));
$('fullscreen').onclick=toggleFullscreen;
$('sound').oninput=()=>{preferences.effects=Number($('sound').value);syncPreferences();sendAudio()};
$('diagnostics').onclick=()=>exportDiagnostics(false);
$('graphics').onchange=()=>{preferences.graphics=$('graphics').value;syncPreferences();$('settingsStatus').textContent='Renderer change saved. It applies on your next launch.'};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow||$('gameView').hidden)return;const d=e.data;if(d.type==='zh-status'&&!exiting)$('gameStatus').textContent=d.message;if(d.type==='zh-ready'&&!exiting){$('gameStatus').textContent='Choose Single Player → Skirmish';if(roomState) $('gameStatus').textContent=isYuri?'Network: host creates, guest joins':'Multiplayer → Anonymous (LAN): host creates, guest joins';}if(d.type==='zh-webgl-context-lost'&&!exiting){const renderer=d.details?.renderer;recordError(`WebGL context lost${renderer?` on ${renderer}`:''}`);$('gameStatus').textContent='Graphics context lost. Download diagnostics or exit safely.';setToolbar(true);if(!$('graphicsLost').open)$('graphicsLost').showModal();}if(d.type==='zh-error'&&!exiting){recordError(d.message);$('gameStatus').textContent=d.message;$('exitGame').disabled=false;}if(d.type==='zh-exit-started')watchExit();if(d.type==='zh-exited')closeGame(d.warning);if(d.type==='zh-diagnostics')diagnosticRequest?.(d);});
$('graphicsLostDiagnostics').onclick=()=>exportDiagnostics(false);
$('graphicsLostExit').onclick=()=>{$('graphicsLost').close();$('exitGame').click()};
$('showHelp').onclick=()=>{if(!$('gameView').hidden)$('gameView').append($('help'));else document.body.append($('help'));$('help').showModal();postGame({type:'zh-input-neutral'})};$('closeHelp').onclick=()=>$('help').close();$('help').addEventListener('close',()=>postGame({type:'zh-focus'}));
async function roomConnect(action,code){
  if(connecting||roomSocket||libraryBusy||launching||importing||$('exportLibrary').disabled)return;
  connecting=true;$('createRoom').disabled=true;$('joinForm').querySelector('button').disabled=true;
  try{
  error('');const config=await fetch(new URL('./network-config.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Room service is unavailable. Solo skirmish remains available.');return r.json()});
  if(!config.rooms||!config.signaling)throw Error('The multiplayer service is offline. Solo skirmish remains available.');
  const content=await fingerprint();const url=new URL(config.rooms,new URL('./',import.meta.url));if(url.protocol==='https:')url.protocol='wss:';else if(url.protocol==='http:')url.protocol='ws:';if(!['ws:','wss:'].includes(url.protocol))throw Error('The room service must use a WebSocket URL.');
  roomSocket=new WebSocket(url);roomSocket.onopen=()=>roomSocket.send(JSON.stringify({action,code,name:identity.name,guest:identity.guest,content,runtime:isYuri?profile.runtime:config.runtime,game:profile.id}));
  roomSocket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.error){error(msg.error);roomSocket.close();roomSocket=null;return;}roomState=msg;view('room');$('roomTitle').textContent=msg.code;$('roomStatus').textContent=`${msg.players.length}/2 commanders connected to the room service`;$('players').replaceChildren(...msg.players.map(p=>{const li=document.createElement('li');const name=document.createElement('strong');name.textContent=p.name;const state=document.createElement('span');state.textContent=p.host?'Host':'Guest';li.append(name,state);return li}));$('compatibility').textContent=msg.compatible?'Runtime and content fingerprints match.':'Waiting for a second compatible installation.';$('roomLaunch').disabled=!msg.compatible;};
  roomSocket.onerror=()=>error('Could not connect to the room service. Check its URL and restart the service.');roomSocket.onclose=()=>{if(roomState)$('roomStatus').textContent='Room connection closed. Leave and reconnect before starting another game.';else roomSocket=null;};
  }finally{connecting=false;$('createRoom').disabled=false;$('joinForm').querySelector('button').disabled=false;}
}
async function fingerprint(){
  const library=assetLibrary.installedLibrary(),cacheKey=`zhweb-content-${library.root}`;
  const cached=sessionStorage.getItem(cacheKey);if(cached)return cached;
  $('librarySummary').textContent='Checking complete archive fingerprints for multiplayer…';
  const hashes=[];
  for(const archive of (await installedFiles()).filter(e=>!isYuri||e.name!=='ra2md.ini').sort((a,b)=>a.name.localeCompare(b.name))){
    const file=archive.file;const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    hashes.push(`${archive.name}:${[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}`);
  }
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(hashes.join('|')));const result=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  sessionStorage.setItem(cacheKey,result);$('librarySummary').textContent=`Local installation ready · ${assetLibrary.summary().formattedBytes}`;return result;
}
$('createRoom').onclick=()=>roomConnect('create').catch(e=>error(e.message));$('joinForm').onsubmit=e=>{e.preventDefault();roomConnect('join',$('roomCode').value.trim().toUpperCase()).catch(e=>error(e.message))};
$('leaveRoom').onclick=()=>{roomState=null;roomSocket?.close();roomSocket=null;history.replaceState(null,'',location.pathname);showLobby()};
$('copyInvite').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',roomState.code);try{await navigator.clipboard.writeText(url.href);$('roomStatus').textContent='Invite link copied.'}catch{error(`Copy this invite: ${url.href}`)}};
$('roomLaunch').onclick=()=>launch(roomState);
function gameCommand(action,value=''){$('gameFrame').contentWindow.postMessage({type:'zh-lan-command',action,value},location.origin)}
$('gameReady').onclick=()=>gameCommand('ready');$('gameStart').onclick=()=>gameCommand('start');$('gameMap').onchange=()=>gameCommand('setMap',$('gameMap').value);
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow)return;
  const d=e.data;
  if(d.type==='zh-ready'&&!exiting){
    gameReady=true;syncProfiling();sendAudio();sendDisplay(false);scheduleHide();
    const host=roomState?.players.find(p=>p.name===identity.name)?.host;
    $('gameReady').hidden=isYuri||!roomState;$('gameStart').hidden=isYuri||!host;$('gameMap').hidden=isYuri||!host;
  }
  if(d.type==='zh-maps'){
    const maps=d.maps.probe?.officialMultiplayerMaps||[];
    $('gameMap').replaceChildren(...maps.map(m=>{const o=document.createElement('option');o.value=m.key;o.textContent=m.key.split(/[\\/]/).at(-2)+` (${m.players} players)`;return o}));
    if(!$('gameMap').options.length)$('gameMap').hidden=true;
  }
  if(d.type==='zh-room-state'){
    const state=d.state,slots=state?.game?.slots||[];
    $('gameStatus').textContent=state?.network?.ready?`${state.network.logicFrame>0?'Match running':'Waiting for simulation'} · frame ${state.network.logicFrame}${state.network.crcMismatch?' · DESYNC: exit and report diagnostics':''}`:`${slots.filter(s=>s.human).length}/2 engine players · ${slots.filter(s=>s.human&&s.accepted).length} ready`;
    if(state?.network?.ready&&d.transport?.endpoint?.openPeers===0)$('gameStatus').textContent='Game peer disconnected. Exit and reconnect before starting another match.';
    $('gameStart').disabled=slots.filter(s=>s.human).length!==2||slots.filter(s=>s.human).some(s=>!s.accepted||!s.hasMap);
    $('gameReady').disabled=!!state?.network?.ready;
    if(state?.game?.map)$('gameMap').value=state.game.map;
    if(state?.network?.ready)$('matchControls').hidden=true;
  }
  if(d.type==='zh-room-controls'){
    const labels={PlayerTemplate:'Faction',Color:'Color',Team:'Team',Player:'Slot'};
    $('matchControls').replaceChildren(...d.controls.map(c=>{
      const label=document.createElement('label');label.textContent=`Player ${c.slot+1} ${labels[c.kind]} `;
      const select=document.createElement('select');select.dataset.engineName=c.name;
      for(const row of c.rows){const option=document.createElement('option');option.value=row.index;option.textContent=row.cells.filter(Boolean).join(' ')||`Option ${row.index+1}`;select.append(option);}
      select.value=c.selectedIndex;select.onchange=()=>{$('gameFrame').contentWindow.postMessage({type:'zh-lan-select',name:c.name,index:Number(select.value)},location.origin)};
      label.append(select);return label;
    }));$('matchControls').hidden=!d.controls.length;
  }
});
$('nameForm').querySelector('button').disabled=false;
syncPreferences(false);
syncProfiling();
cleanArchiveStaging({profile:profile.archiveProfile}).catch(()=>{});
restore();

function postGame(data){if(!$('gameView').hidden)$('gameFrame').contentWindow.postMessage(data,location.origin)}
function syncProfiling(){
  $('profilingTools').hidden=isYuri;
  const input=$('engineProfiling');input.checked=profilingEnabled===true;input.indeterminate=profilingEnabled===null;input.disabled=isYuri||!gameReady||exiting||profilingBusy;
  $('profilingStatus').textContent=profilingBusy?'Waiting for the engine…':profilingError||(profilingEnabled===true?'On · confirmed by the engine. Reproduce the slowdown, then download diagnostics.':profilingEnabled===null?'State unknown. Retry, or exit and relaunch to turn profiling off.':gameReady?'Off · ready to record.':'Off. Launch a game to enable profiling.');
}
function resetProfiling(){clearTimeout(profilingTimer);profilingRequestId=null;profilingEnabled=false;profilingBusy=false;profilingError='';syncProfiling()}
$('engineProfiling').onchange=()=>{
  if(isYuri||!gameReady||exiting||profilingBusy){syncProfiling();return;}
  const enabled=$('engineProfiling').checked,requestId=crypto.randomUUID();
  profilingRequestId=requestId;profilingBusy=true;profilingError='';syncProfiling();
  profilingTimer=setTimeout(()=>{if(profilingRequestId!==requestId)return;profilingBusy=false;profilingEnabled=null;profilingError='The engine has not confirmed the change. Retry, or exit and relaunch to turn profiling off.';syncProfiling()},8000);
  postGame({type:'zh-profiling',enabled,requestId});
};
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow||$('gameView').hidden||exiting)return;
  const d=e.data;
  if(d?.type!=='zh-profiling-result'||d.requestId!==profilingRequestId)return;
  clearTimeout(profilingTimer);profilingBusy=false;profilingEnabled=typeof d.profiling?.enabled==='boolean'?d.profiling.enabled:null;profilingError=d.error||'';
  if(profilingError)recordError(profilingError);syncProfiling();
});
function currentResolution(){return resolutionSize(preferences.resolution,$('gameFrame').clientWidth||innerWidth,$('gameFrame').clientHeight||innerHeight)}
function sendAudio(){if(isYuri){$('settingsStatus').textContent='Yuri audio changes are saved and apply on your next launch.';return}if(gameReady)postGame({type:'zh-volume',music:preferences.music/100,effects:preferences.effects/100})}
function sendDisplay(resize=true){if(isYuri){postGame({type:'zh-display',performance:preferences.performance});$('settingsStatus').textContent='Yuri display and scrolling changes are saved and apply on your next launch.';return}if(gameReady)postGame({type:'zh-display',...currentResolution(),resize,scaling:preferences.scaling,edgeScroll:preferences.edgeScroll,performance:preferences.performance})}
function syncPreferences(save=true){
  document.documentElement.dataset.theme=preferences.dark?'dark':'light';$('themeToggle').textContent=`Dark mode: ${preferences.dark?'on':'off'}`;$('themeToggle').setAttribute('aria-pressed',String(preferences.dark));
  for(const [id,key] of [['darkMode','dark'],['autoHide','autoHide'],['edgeScroll','edgeScroll'],['showPerformance','performance']])$(id).checked=preferences[key];
  for(const [id,key] of [['resolution','resolution'],['scaling','scaling'],['graphics','graphics'],['music','music'],['sound','effects']])$(id).value=preferences[key];
  $('musicValue').value=`${preferences.music}%`;$('soundValue').value=`${preferences.effects}%`;$('performanceInfo').hidden=!preferences.performance;
  if(save)$('settingsStatus').textContent=savePreferences(preferences,profile.id)?'Changes saved on this device.':'Settings work for this session. Browser storage could not save them.';
}
function openSettings(){clearTimeout(hideTimer);if(!$('gameView').hidden)$('gameView').append($('settings'));else document.body.append($('settings'));$('yuriTools').hidden=!isYuri;for(const id of ['yuriDownloadSave','yuriUploadSave','yuriAddMaps','yuriPerformance'])$(id).disabled=!gameReady;$('settings').scrollTop=0;$('settings').showModal();updateStorage();postGame({type:'zh-input-neutral'})}
for(const [id,action] of [['yuriDownloadSave','downloadSave'],['yuriUploadSave','uploadSave'],['yuriAddMaps','maps'],['yuriPerformance','performance']])$(id).onclick=()=>{if(!isYuri||!gameReady)return;$('settings').close();postGame({type:'zh-yuri-tool',action})};
$('openSettings').onclick=$('gameSettings').onclick=openSettings;
$('closeSettings').onclick=()=>$('settings').close();$('settings').addEventListener('close',()=>{postGame({type:'zh-focus'});scheduleHide()});
$('themeToggle').onclick=()=>{preferences.dark=!preferences.dark;syncPreferences()};
for(const [id,key] of [['darkMode','dark'],['autoHide','autoHide'],['edgeScroll','edgeScroll'],['showPerformance','performance']])$(id).onchange=()=>{preferences[key]=$(id).checked;syncPreferences();sendDisplay(false);if(key==='autoHide'){if(!preferences.autoHide)setToolbar(true);else scheduleHide()}};
$('music').oninput=()=>{preferences.music=Number($('music').value);syncPreferences();sendAudio()};
$('resolution').onchange=()=>{preferences.resolution=$('resolution').value;syncPreferences();sendDisplay()};
$('lowGpuSettings').onclick=()=>{preferences={...preferences,resolution:'800x600',graphics:'ff'};syncPreferences();if(isYuri){$('settingsStatus').textContent='Low-GPU settings saved. They apply on Yuri’s next launch.'}else{sendDisplay();$('settingsStatus').textContent='Low-GPU settings saved: 800 × 600 and Compatibility. The renderer change applies on the next launch.'}};
$('scaling').onchange=()=>{preferences.scaling=$('scaling').value;syncPreferences();sendDisplay(false)};
$('resetSettings').onclick=()=>{preferences=gameDefaults(profile.id);syncPreferences();sendAudio();sendDisplay();scheduleHide()};
$('yuriLighterSettings').onclick=()=>{if(!isYuri)return;preferences={...preferences,resolution:'800x600',scaling:'actual',graphics:'ff'};syncPreferences();$('settingsStatus').textContent='Lighter settings saved. Exit to the website and launch again to apply them.'};
function setToolbar(visible){clearTimeout(hideTimer);$('gameView').classList.toggle('toolbar-hidden',!visible);$('revealToolbar').hidden=visible;$('revealToolbar').setAttribute('aria-expanded',String(visible));postGame({type:'zh-input-neutral'});scheduleNativeResize()}
function scheduleHide(){clearTimeout(hideTimer);if(exiting||roomState&&!inMatch)return;if(gameReady&&preferences.autoHide&&!$('settings').open&&!$('gameBar').contains(document.activeElement))hideTimer=setTimeout(()=>{if(!exiting&&!$('settings').open&&!$('confirmAction').open&&!$('help').open&&!$('gameBar').contains(document.activeElement))setToolbar(false)},2500)}
$('hideToolbar').onclick=()=>{setToolbar(false);postGame({type:'zh-focus'})};$('revealToolbar').onclick=()=>{setToolbar(true);scheduleHide()};
$('gameBar').addEventListener('pointerenter',()=>clearTimeout(hideTimer));$('gameBar').addEventListener('pointerleave',scheduleHide);$('gameBar').addEventListener('focusin',()=>clearTimeout(hideTimer));$('gameBar').addEventListener('focusout',scheduleHide);
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('gameView').requestFullscreen();postGame({type:'zh-focus'})}catch(e){$('gameStatus').textContent=`Fullscreen unavailable: ${e.message}`}}
function shortcut(action){if($('gameView').hidden)return;if(action==='toolbar'){setToolbar($('gameView').classList.contains('toolbar-hidden'));postGame({type:'zh-focus'})}if(action==='fullscreen')toggleFullscreen()}
window.addEventListener('keydown',e=>{if($('gameView').hidden||$('settings').open||$('confirmAction').open)return;if(e.key==='F8'||(e.altKey&&e.key==='Enter')){e.preventDefault();shortcut(e.key==='F8'?'toolbar':'fullscreen')}});
function scheduleNativeResize(){clearTimeout(resizeTimer);if(preferences.resolution==='native'&&gameReady)resizeTimer=setTimeout(()=>sendDisplay(),250)}
window.addEventListener('resize',scheduleNativeResize);document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Leave fullscreen':'Fullscreen';scheduleNativeResize()});
function confirmAction(title,description,label,callback){confirmCallback=callback;$('confirmTitle').textContent=title;$('confirmDescription').textContent=description;$('confirmProceed').textContent=label;if(!$('gameView').hidden)$('gameView').append($('confirmAction'));else document.body.append($('confirmAction'));$('confirmAction').showModal();postGame({type:'zh-input-neutral'})}
$('confirmCancel').onclick=()=>$('confirmAction').close();$('confirmProceed').onclick=()=>{const callback=confirmCallback;$('confirmAction').close();callback?.()};$('confirmAction').addEventListener('close',()=>{confirmCallback=null;postGame({type:'zh-focus'})});
const formatBytes=bytes=>`${(bytes/1024**3).toFixed(2)} GiB`;
async function updateStorage(){try{const [estimate,persisted,managed]=await Promise.all([navigator.storage.estimate(),navigator.storage.persisted(),assetLibrary.managedStorageInventory()]);const unusedBytes=managed.entries.filter(entry=>['stale','orphaned'].includes(entry.state)).reduce((total,entry)=>total+entry.totalBytes,0);const text=`Game library: ${assetLibrary.summary().formattedBytes}. Leftover game files: ${formatBytes(unusedBytes)}. Shared origin storage: ${formatBytes(estimate.usage||0)} used of ${formatBytes(estimate.quota||0)}. ${persisted?'Persistent storage granted.':'Storage may be reclaimed when space is low; keep a ZIP backup.'}`;$('storageInfo').textContent=$('settingsStorageInfo').textContent=text;return {estimate,persisted,unusedBytes}}catch{$('storageInfo').textContent=$('settingsStorageInfo').textContent='Storage estimates are unavailable. Keep a ZIP backup before clearing browser data.'}}
$('libraryDetails').addEventListener('toggle',()=>{if($('libraryDetails').open)updateStorage()});
$('persistStorage').onclick=async()=>{try{const granted=await navigator.storage.persist();await updateStorage();$('backupStatus').textContent=granted?'Persistent storage granted. Keep an external backup too.':'This browser did not grant persistent storage. Keep your original archive or ZIP backup.'}catch(e){error(e.message)}};
$('verifyLibrary').onclick=$('settingsVerifyLibrary').onclick=()=>maintainLibrary(async()=>{
  $('backupStatus').textContent=$('settingsStorageStatus').textContent=isYuri?'Checking installed file sizes and required headers…':'Checking installed archive headers and required contents…';
  const library=await assetLibrary.verifyInstalledLibrary();
  if(!library){installed=false;throw Error(assetLibrary.lastValidationError||'No installed library was found. Import a complete game.');}
  const files=[];
  for(const entry of await installedFiles()){const file=new File([entry.file],entry.name);Object.defineProperty(file,'relativePath',{value:entry.name});files.push(file)}
  const scan=await assetLibrary.scan(files);
  if(!scan.ok){installed=false;throw Error(scan.error||scan.detail||'Required game content is missing. Import a complete installation.');}
  await assetLibrary.archivesForLaunch();installed=true;showLobby();
  $('backupStatus').textContent=$('settingsStorageStatus').textContent=isYuri?`Ready: ${library.archives.length} files passed inventory, size and required-header checks.`:`Ready: ${library.archives.length} archives passed file size, header and required-content checks.`;
});
function assertLibraryIdle(action='manage installed files'){
  if(roomSocket)throw Error(`Leave your private room before you ${action}.`);
  if(!$('gameView').hidden)throw Error(`Exit the game before you ${action}.`);
  if(launching||importing)throw Error(`Wait for the current game-file operation to finish before you ${action}.`);
  if($('exportLibrary').disabled)throw Error(`Wait for the backup to finish before you ${action}.`);
}
async function maintainLibrary(action){
  if(libraryBusy)return;
  const controls=['removeLibrary','replaceLibrary','cleanStorage','settingsCleanStorage','settingsVerifyLibrary','settingsReplaceLibrary','settingsRemoveLibrary','exportLibrary','verifyLibrary','solo','createRoom'];
  try{assertLibraryIdle();libraryBusy=true;error('');for(const id of controls)$(id).disabled=true;$('joinForm').querySelector('button').disabled=true;await action();}
  catch(e){$('maintenanceStatus').textContent=$('settingsStorageStatus').textContent=`Game file operation did not finish: ${e.message}`;error(e.message)}
  finally{libraryBusy=false;for(const id of controls)$(id).disabled=false;$('joinForm').querySelector('button').disabled=false;await updateStorage();}
}
$('removeLibrary').onclick=$('settingsRemoveLibrary').onclick=()=>{if($('settings').open)$('settings').close();confirmAction('Remove installed game?','Remove this app’s installed game files from this browser. Your original files, commander, settings and stored saves are preserved. Keep a ZIP backup first.','Remove game',()=>maintainLibrary(async()=>{
  $('maintenanceStatus').textContent='Removing installed game files…';
  const root=assetLibrary.installedLibrary()?.root;await assetLibrary.removeInstalledLibrary();
  installed=false;if(root)sessionStorage.removeItem(`zhweb-content-${root}`);
  if(zipUrl){URL.revokeObjectURL(zipUrl);zipUrl=null}$('saveZip').hidden=true;$('backupStatus').textContent='';
  showSetup();$('backToLibrary').hidden=true;$('installProgress').textContent='';
  $('maintenanceStatus').textContent=$('settingsStorageStatus').textContent='Installed game removed from this browser. Your commander, settings and stored saves were kept. Import your files to play again.';
}));};
const cleanStorage=()=>maintainLibrary(async()=>{
  $('maintenanceStatus').textContent=$('settingsStorageStatus').textContent='Cleaning leftover game files…';
  const unused=await assetLibrary.cleanUnusedStorage(),staging=await cleanArchiveStaging({profile:profile.archiveProfile});
  const count=unused.removed.length+staging.removed.length,failed=[...unused.failed,...staging.failed];
  const message=`${count?`Removed ${count} leftover game folder${count===1?'':'s'}.`:'No unused game files needed removal.'} Your installation and stored saves were kept.${unused.skipped||staging.skipped?' Files in use by another tab were kept. Close that tab and retry if needed.':''}${failed.length?' Some files could not be removed. Close other game tabs and retry.':''}`;
  failed.forEach(item=>recordError(`Storage cleanup: ${item.name}: ${item.error}`));
  $('maintenanceStatus').textContent=$('settingsStorageStatus').textContent=message;
});
$('cleanStorage').onclick=$('settingsCleanStorage').onclick=cleanStorage;
function downloadDiagnostics(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${profile.id}-${VERSION}-diagnostics.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportDiagnostics(copy){
  const buttons=['diagnostics','settingsDiagnostics','copyDiagnostics'];if(diagnosticRequest)return;
  for(const id of buttons)$(id).disabled=true;
  try{
    const engine=$('gameView').hidden?null:await new Promise(resolve=>{
      const timer=setTimeout(()=>{diagnosticRequest=null;resolve({error:'Engine diagnostics timed out. Browser diagnostics are still available.'})},7000);
      diagnosticRequest=data=>{clearTimeout(timer);diagnosticRequest=null;resolve(data)};postGame({type:'zh-diagnostics'});
    });
    const data=diagnosticReport({game:profile.id,preferences,library:assetLibrary.summary(),storage:await updateStorage(),engine});
    if(copy){try{await navigator.clipboard.writeText(JSON.stringify(data,null,2));$('settingsStatus').textContent='Diagnostics copied. They include browser and graphics information and recent errors.'}catch{downloadDiagnostics(data);$('settingsStatus').textContent='Clipboard unavailable. Diagnostics downloaded instead.'}}
    else{downloadDiagnostics(data);$('settingsStatus').textContent='Diagnostics downloaded.'}
  }catch(e){recordError(e.message);$('settingsStatus').textContent=`Diagnostics could not be prepared: ${e.message}`}
  finally{for(const id of buttons)$(id).disabled=false;}
}
$('settingsDiagnostics').onclick=()=>exportDiagnostics(false);$('copyDiagnostics').onclick=()=>exportDiagnostics(true);
let availableVersion;
$('appVersion').textContent=`Installed interface: ${VERSION}`;
$('checkUpdates').onclick=async()=>{
  $('checkUpdates').disabled=true;$('updateStatus').textContent='Checking for an interface update…';$('applyUpdate').hidden=true;
  try{const response=await fetch(new URL('./version.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Version information is unavailable');const latest=await response.json();if(!/^\d+\.\d+\.\d+$/.test(latest.version))throw Error('Version information is invalid');const compare=latest.version.split('.').map(Number),current=VERSION.split('.').map(Number);const difference=compare.map((value,index)=>value-current[index]).find(value=>value!==0)||0;availableVersion=difference>0?latest.version:null;$('updateStatus').textContent=availableVersion?`Version ${availableVersion} is available. Exit the game and leave your room before applying it. Your local installation and saves will be kept.`:`Version ${VERSION} is current on this site.`;$('applyUpdate').hidden=!availableVersion;}
  catch(e){$('updateStatus').textContent=`Could not check for updates. Check your connection and retry. ${e.message}`}
  finally{$('checkUpdates').disabled=false;}
};
$('applyUpdate').onclick=()=>{if(!availableVersion)return;try{assertLibraryIdle();if(libraryBusy)throw Error('Wait for file cleanup to finish.');location.reload()}catch(e){$('updateStatus').textContent=e.message}};
$('settingsHelp').onclick=()=>{$('settings').close();$('showHelp').click()};
window.addEventListener('beforeunload',e=>{if(inMatch||importing||$('exportLibrary').disabled){e.preventDefault();e.returnValue=''}});
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow)return;const d=e.data;
  if(d.type==='zh-shortcut')shortcut(d.action);
  if(d.type==='zh-gameplay'&&!exiting){const was=inMatch;inMatch=d.inGame;if(!was&&d.inGame&&preferences.autoHide&&!$('settings').open&&!$('confirmAction').open)setToolbar(false)}
  if(d.type==='zh-game-focus'&&!exiting&&preferences.autoHide&&gameReady&&(!roomState||inMatch)&&!$('settings').open&&!$('gameView').classList.contains('toolbar-hidden'))setToolbar(false);
  if(d.type==='zh-performance')$('performanceInfo').textContent=d.text||`${d.renderer||'Renderer'} · ${d.width} × ${d.height}${Number.isFinite(d.logicFrame)?` · frame ${d.logicFrame}`:''}`;
  if(d.type==='zh-display-result'){if(!d.ok&&d.width&&d.height){preferences.resolution=`${d.width}x${d.height}`;if(!['800x600','1024x768','1280x720','1600x900','1920x1080'].includes(preferences.resolution))preferences.resolution=DEFAULTS.resolution;syncPreferences()}$('settingsStatus').textContent=d.ok?`Rendering at ${d.width} × ${d.height}.`:`Resolution was not applied: ${d.error}`}
  if(d.type==='zh-error')setToolbar(true);
});
