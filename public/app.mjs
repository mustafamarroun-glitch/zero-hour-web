import './isolation.mjs';
import './harness/storage-scope.js';
import {assetLibrary} from './harness/launcher-asset-manager.mjs';
import {buildArchiveZip} from './harness/launcher-backup-zip.mjs';
import {extractGameArchive,cleanArchiveStaging} from './harness/archive-import.mjs';
import {VERSION,DEFAULTS,loadPreferences,savePreferences,resolutionSize} from './preferences.mjs';
const $=id=>document.getElementById(id), key='zhweb-identity-v1';
let identity,installed=false,importing=false,importController,backupController,zipUrl,roomSocket,roomState,connecting=false,gameReady=false,inMatch=false,hideTimer,resizeTimer,confirmCallback;
let preferences=loadPreferences();
try{identity=JSON.parse(localStorage.getItem(key)||'null')}catch{}
const error=message=>{$('error').textContent=message;$('error').hidden=!message};
function view(id){for(const name of ['entry','setup','lobby','room'])$(name).hidden=name!==id;error('')}
function progress(p){$('installProgress').textContent=p.detail||p.phase||'Processing local files…';$('progress').hidden=false;const total=p.totalBytes||p.total;const completed=p.completedBytes||p.completed||0;if(total)$('progress').value=completed/total;else $('progress').removeAttribute('value')}
function restoreIdentity(){if(identity?.name){$('commander').textContent=identity.name;document.querySelector('.identity').hidden=false;return true}return false}
async function restore(){
  if(!restoreIdentity()){view('entry');return;}
  view('setup');
  try{installed=!!await assetLibrary.verifyInstalledLibrary();if(installed){await assetLibrary.archivesForLaunch();showLobby()}}catch(e){error(`Installed files could not be restored: ${e.message}. Import your folder again.`)}
}
function showLobby(){view('lobby');$('librarySummary').textContent=`Local installation ready · ${assetLibrary.installedLibrary()?.archives.length||0} validated archives · ${assetLibrary.summary().formattedBytes}`;updateStorage();const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite;$('joinForm').requestSubmit()}}
$('nameForm').onsubmit=e=>{e.preventDefault();const name=$('name').value.trim();if(!/^[A-Za-z0-9 _-]{2,12}$/.test(name)){error('Use 2–12 letters, numbers, spaces, underscores or hyphens.');return;}identity={name,guest:identity?.guest||crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(identity))}catch{error('Browser storage is unavailable. Allow site storage to remember your commander name.');return;}restore()};
$('changeName').onclick=()=>{if(roomSocket){error('Leave your room before changing your commander name.');return;}$('name').value=identity?.name||'';view('entry');$('name').focus()};
async function importFiles(files,archive=false){
  if(importing||!files.length)return;
  importing=true;importController=new AbortController();const controller=importController;let extracted;
  error('');$('cancelImport').hidden=false;for(const id of ['chooseFolder','chooseFiles','chooseArchive','backToLibrary'])$(id).disabled=true;
  try{
    if(archive){extracted=await extractGameArchive(files[0],{signal:controller.signal,onProgress:progress});files=extracted.files;}
    controller.signal.throwIfAborted();
    const scan=await assetLibrary.scan(files,{onProgress:progress});
    controller.signal.throwIfAborted();
    if(!scan.ok)throw Error(scan.error||scan.detail||`Missing required files: ${(scan.missing||scan.missingArchives||[]).map(v=>v.name||v).join(', ')}`);
    const result=await assetLibrary.prepare('install',progress);installed=true;await extracted?.dispose();extracted=null;showLobby();if(result.warning)error(result.warning.message);
  }catch(e){installed=!!assetLibrary.installedLibrary();$('backToLibrary').hidden=!installed;error(controller.signal.aborted?'Import cancelled. Your previous installation is preserved.':`${e.message}. Select a complete compatible Data folder and retry.`);}
  finally{await extracted?.dispose().catch(()=>{});importing=false;importController=null;$('cancelImport').hidden=true;$('cancelImport').disabled=false;$('progress').hidden=true;for(const id of ['chooseFolder','chooseFiles','chooseArchive','backToLibrary'])$(id).disabled=false;$('folderInput').value=$('fileInput').value=$('archiveInput').value='';}
}
$('chooseFolder').onclick=()=> $('folderInput').click();$('chooseFiles').onclick=()=>$('fileInput').click();
$('folderInput').onchange=e=>importFiles([...e.target.files]);$('fileInput').onchange=e=>importFiles([...e.target.files]);
$('chooseArchive').onclick=()=>$('archiveInput').click();$('archiveInput').onchange=e=>importFiles([...e.target.files],true);
$('cancelImport').onclick=()=>{if(!importing)return;importController?.abort();assetLibrary.recoverWorker(assetLibrary.worker,'Import cancelled');$('cancelImport').disabled=true;error('Cancelling import…');};
$('replaceLibrary').onclick=()=>{view('setup');$('backToLibrary').hidden=!installed};
$('backToLibrary').onclick=()=>restore();
$('exportLibrary').onclick=async()=>{
  backupController=new AbortController();$('exportLibrary').disabled=true;$('cancelBackup').hidden=false;$('saveZip').hidden=true;error('');
  try{const entries=[];for(const archive of assetLibrary.installedLibrary().archives){let dir=await navigator.storage.getDirectory();const parts=archive.opfsPath.split('/');const name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);entries.push({name:archive.name,file:await(await dir.getFileHandle(name)).getFile()});}const result=await buildArchiveZip(entries,{signal:backupController.signal,onProgress:p=>{$('backupStatus').textContent=p.detail||`Preparing ${p.name||'backup'}…`;}});if(zipUrl)URL.revokeObjectURL(zipUrl);zipUrl=URL.createObjectURL(result.blob||result);$('saveZip').href=zipUrl;$('saveZip').hidden=false;$('backupStatus').textContent='Backup ready. Save ZIP and import it directly into Version 2. Original cursor art and saved matches are not included in this game-archive backup.';}catch(e){error(e.message)}finally{$('exportLibrary').disabled=false;$('cancelBackup').hidden=true;}
};$('cancelBackup').onclick=()=>backupController?.abort();
async function launch(room){
  error('');if(!installed||!$('gameView').hidden)return;
  $('solo').disabled=$('roomLaunch').disabled=true;
  try{
    $('librarySummary').textContent='Checking installed files before launch…';
    if(!await assetLibrary.verifyInstalledLibrary())throw Error('Installed files are missing. Import a complete game again.');
    await assetLibrary.archivesForLaunch();
    const url=new URL('./harness/game.html',location.href);url.searchParams.set('commander',identity.name);url.searchParams.set('shaderTier',preferences.graphics);const size=currentResolution();url.searchParams.set('width',size.width);url.searchParams.set('height',size.height);
    if(room){url.searchParams.set('room',room.code);url.searchParams.set('guest',identity.guest);url.searchParams.set('host',room.players.find(p=>p.name===identity.name)?.host?'1':'0');}
    gameReady=false;inMatch=false;$('gameName').textContent=identity.name;$('gameStatus').textContent='Restoring local files…';$('gameFrame').src=url.href;$('gameView').hidden=false;document.body.classList.add('playing');setToolbar(true);
  }catch(e){error(e.message)}finally{$('solo').disabled=false;$('roomLaunch').disabled=!!roomState&&!roomState.compatible}
}
$('solo').onclick=()=>launch();
$('exitGame').onclick=()=>{if(inMatch)confirmAction('Exit this match?','Your current match will end. The engine will flush local saves before closing.','Exit game',exitGame);else exitGame()};
function exitGame(){setToolbar(true);$('exitGame').disabled=true;$('gameStatus').textContent='Saving and shutting down…';postGame({type:'zh-exit'})}
function closeGame(){clearTimeout(hideTimer);gameReady=false;inMatch=false;$('settings').close();$('gameFrame').src='about:blank';$('gameView').hidden=true;document.body.classList.remove('playing');$('matchControls').hidden=true;$('matchControls').replaceChildren();$('exitGame').disabled=false;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
$('fullscreen').onclick=toggleFullscreen;
$('sound').oninput=()=>{preferences.effects=Number($('sound').value);syncPreferences();sendAudio()};
$('diagnostics').onclick=()=>$('gameFrame').contentWindow.postMessage({type:'zh-diagnostics'},location.origin);
$('graphics').onchange=()=>{preferences.graphics=$('graphics').value;syncPreferences();$('settingsStatus').textContent='Renderer change saved. It applies on your next launch.'};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow)return;const d=e.data;if(d.type==='zh-status')$('gameStatus').textContent=d.message;if(d.type==='zh-ready'){$('gameStatus').textContent='Choose Single Player → Skirmish';if(roomState) $('gameStatus').textContent='Multiplayer → Anonymous (LAN): host creates, guest joins';}if(d.type==='zh-error'){$('gameStatus').textContent=d.message;$('exitGame').disabled=false;}if(d.type==='zh-exited'||d.type==='zh-exit')closeGame();if(d.type==='zh-diagnostics'){const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='zero-hour-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}});
$('showHelp').onclick=()=>{if(!$('gameView').hidden)$('gameView').append($('help'));else document.body.append($('help'));$('help').showModal();postGame({type:'zh-input-neutral'})};$('closeHelp').onclick=()=>$('help').close();$('help').addEventListener('close',()=>postGame({type:'zh-focus'}));
async function roomConnect(action,code){
  if(connecting||roomSocket)return;
  connecting=true;$('createRoom').disabled=true;$('joinForm').querySelector('button').disabled=true;
  try{
  error('');const config=await fetch('./network-config.json').then(r=>{if(!r.ok)throw Error('Room service is unavailable. Solo skirmish remains available.');return r.json()});
  if(!config.rooms||!config.signaling)throw Error('The multiplayer service is offline. Solo skirmish remains available.');
  const content=await fingerprint();const url=new URL(config.rooms,location.href);if(url.protocol==='https:')url.protocol='wss:';else if(url.protocol==='http:')url.protocol='ws:';if(!['ws:','wss:'].includes(url.protocol))throw Error('The room service must use a WebSocket URL.');
  roomSocket=new WebSocket(url);roomSocket.onopen=()=>roomSocket.send(JSON.stringify({action,code,name:identity.name,guest:identity.guest,content,runtime:config.runtime}));
  roomSocket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.error){error(msg.error);roomSocket.close();roomSocket=null;return;}roomState=msg;view('room');$('roomTitle').textContent=msg.code;$('roomStatus').textContent=`${msg.players.length}/2 commanders connected to the room service`;$('players').replaceChildren(...msg.players.map(p=>{const li=document.createElement('li');const name=document.createElement('strong');name.textContent=p.name;const state=document.createElement('span');state.textContent=p.host?'Host':'Guest';li.append(name,state);return li}));$('compatibility').textContent=msg.compatible?'Runtime and content fingerprints match.':'Waiting for a second compatible installation.';$('roomLaunch').disabled=!msg.compatible;};
  roomSocket.onerror=()=>error('Could not connect to the room service. Check its URL and restart the service.');roomSocket.onclose=()=>{if(roomState)$('roomStatus').textContent='Room connection closed. Leave and reconnect before starting another game.';else roomSocket=null;};
  }finally{connecting=false;$('createRoom').disabled=false;$('joinForm').querySelector('button').disabled=false;}
}
async function fingerprint(){
  const library=assetLibrary.installedLibrary(),cacheKey=`zhweb-content-${library.root}`;
  const cached=sessionStorage.getItem(cacheKey);if(cached)return cached;
  $('librarySummary').textContent='Checking complete archive fingerprints for multiplayer…';
  const hashes=[];
  for(const archive of [...library.archives].sort((a,b)=>a.name.localeCompare(b.name))){
    let dir=await navigator.storage.getDirectory();const parts=archive.opfsPath.split('/'),name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);
    const file=await(await dir.getFileHandle(name)).getFile();const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
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
  if(d.type==='zh-ready'){
    gameReady=true;sendAudio();sendDisplay(false);scheduleHide();
    const host=roomState?.players.find(p=>p.name===identity.name)?.host;
    $('gameReady').hidden=!roomState;$('gameStart').hidden=!host;$('gameMap').hidden=!host;
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
cleanArchiveStaging().catch(()=>{});
restore();

function postGame(data){if(!$('gameView').hidden)$('gameFrame').contentWindow.postMessage(data,location.origin)}
function currentResolution(){return resolutionSize(preferences.resolution,$('gameFrame').clientWidth||innerWidth,$('gameFrame').clientHeight||innerHeight)}
function sendAudio(){if(gameReady)postGame({type:'zh-volume',music:preferences.music/100,effects:preferences.effects/100})}
function sendDisplay(resize=true){if(gameReady)postGame({type:'zh-display',...currentResolution(),resize,scaling:preferences.scaling,edgeScroll:preferences.edgeScroll,performance:preferences.performance})}
function syncPreferences(save=true){
  document.documentElement.dataset.theme=preferences.dark?'dark':'light';$('themeToggle').textContent=`Dark mode: ${preferences.dark?'on':'off'}`;$('themeToggle').setAttribute('aria-pressed',String(preferences.dark));
  for(const [id,key] of [['darkMode','dark'],['autoHide','autoHide'],['edgeScroll','edgeScroll'],['showPerformance','performance']])$(id).checked=preferences[key];
  for(const [id,key] of [['resolution','resolution'],['scaling','scaling'],['graphics','graphics'],['music','music'],['sound','effects']])$(id).value=preferences[key];
  $('musicValue').value=`${preferences.music}%`;$('soundValue').value=`${preferences.effects}%`;$('performanceInfo').hidden=!preferences.performance;
  if(save)$('settingsStatus').textContent=savePreferences(preferences)?'Changes saved on this device.':'Settings work for this session. Browser storage could not save them.';
}
function openSettings(){clearTimeout(hideTimer);if(!$('gameView').hidden)$('gameView').append($('settings'));else document.body.append($('settings'));$('settings').showModal();postGame({type:'zh-input-neutral'})}
$('openSettings').onclick=$('gameSettings').onclick=openSettings;
$('closeSettings').onclick=()=>$('settings').close();$('settings').addEventListener('close',()=>{postGame({type:'zh-focus'});scheduleHide()});
$('themeToggle').onclick=()=>{preferences.dark=!preferences.dark;syncPreferences()};
for(const [id,key] of [['darkMode','dark'],['autoHide','autoHide'],['edgeScroll','edgeScroll'],['showPerformance','performance']])$(id).onchange=()=>{preferences[key]=$(id).checked;syncPreferences();sendDisplay(false);if(key==='autoHide'){if(!preferences.autoHide)setToolbar(true);else scheduleHide()}};
$('music').oninput=()=>{preferences.music=Number($('music').value);syncPreferences();sendAudio()};
$('resolution').onchange=()=>{preferences.resolution=$('resolution').value;syncPreferences();sendDisplay()};
$('scaling').onchange=()=>{preferences.scaling=$('scaling').value;syncPreferences();sendDisplay(false)};
$('resetSettings').onclick=()=>{preferences={...DEFAULTS};syncPreferences();sendAudio();sendDisplay();scheduleHide()};
function setToolbar(visible){clearTimeout(hideTimer);$('gameView').classList.toggle('toolbar-hidden',!visible);$('revealToolbar').hidden=visible;$('revealToolbar').setAttribute('aria-expanded',String(visible));postGame({type:'zh-input-neutral'});scheduleNativeResize()}
function scheduleHide(){clearTimeout(hideTimer);if(roomState&&!inMatch)return;if(gameReady&&preferences.autoHide&&!$('settings').open&&!$('gameBar').contains(document.activeElement))hideTimer=setTimeout(()=>{if(!$('settings').open&&!$('confirmAction').open&&!$('help').open&&!$('gameBar').contains(document.activeElement))setToolbar(false)},2500)}
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
async function updateStorage(){try{const [estimate,persisted]=await Promise.all([navigator.storage.estimate(),navigator.storage.persisted()]);$('storageInfo').textContent=`Game library: ${assetLibrary.summary().formattedBytes}. Origin storage: ${formatBytes(estimate.usage||0)} used of ${formatBytes(estimate.quota||0)}. ${persisted?'Persistent storage granted.':'Storage may be reclaimed when space is low; keep a ZIP backup.'}`;return {estimate,persisted}}catch{$('storageInfo').textContent='Storage estimates are unavailable. Keep a ZIP backup before clearing browser data.'}}
$('libraryDetails').addEventListener('toggle',()=>{if($('libraryDetails').open)updateStorage()});
$('persistStorage').onclick=async()=>{try{const granted=await navigator.storage.persist();await updateStorage();$('backupStatus').textContent=granted?'Persistent storage granted. Keep an external backup too.':'This browser did not grant persistent storage. Keep your original archive or ZIP backup.'}catch(e){error(e.message)}};
$('verifyLibrary').onclick=async()=>{const button=$('verifyLibrary');button.disabled=true;$('backupStatus').textContent='Checking installed archive headers and required contents…';try{const library=await assetLibrary.verifyInstalledLibrary();if(!library)throw Error('No complete installed library was found.');const files=[];for(const archive of library.archives){let dir=await navigator.storage.getDirectory();const parts=archive.opfsPath.split('/'),name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);const file=await(await dir.getFileHandle(name)).getFile();Object.defineProperty(file,'relativePath',{value:archive.name});files.push(file)}const scan=await assetLibrary.scan(files);if(!scan.ok)throw Error(scan.error||scan.detail||'Required game content is missing. Import a complete installation.');await assetLibrary.archivesForLaunch();$('backupStatus').textContent=`Ready: ${library.archives.length} archives passed file size, header and required-content checks.`}catch(e){error(e.message)}finally{button.disabled=false}};
$('removeLibrary').onclick=()=>confirmAction('Remove installed game?','Remove this site’s installed game files from this browser. Keep a ZIP backup first. Your original files and saves are preserved.','Remove game',async()=>{try{if(roomSocket||backupController&&!backupController.signal.aborted&&$('exportLibrary').disabled)throw Error('Leave your room and finish the backup before removing the game.');const root=assetLibrary.installedLibrary()?.root;if(root)await assetLibrary.deleteStorageRoot(root);installed=false;view('setup');$('backToLibrary').hidden=true;await updateStorage()}catch(e){error(e.message)}});
function downloadDiagnostics(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`zero-hour-${VERSION}-diagnostics.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('settingsDiagnostics').onclick=async()=>{if(gameReady)$('diagnostics').click();else downloadDiagnostics({version:VERSION,date:new Date().toISOString(),userAgent:navigator.userAgent,isolation:crossOriginIsolated,preferences,library:assetLibrary.summary(),storage:await updateStorage()})};
$('settingsHelp').onclick=()=>{$('settings').close();$('showHelp').click()};
window.addEventListener('beforeunload',e=>{if(inMatch||importing||$('exportLibrary').disabled){e.preventDefault();e.returnValue=''}});
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow)return;const d=e.data;
  if(d.type==='zh-shortcut')shortcut(d.action);
  if(d.type==='zh-gameplay'){const was=inMatch;inMatch=d.inGame;if(!was&&d.inGame&&preferences.autoHide&&!$('settings').open&&!$('confirmAction').open)setToolbar(false)}
  if(d.type==='zh-game-focus'&&preferences.autoHide&&gameReady&&(!roomState||inMatch)&&!$('settings').open&&!$('gameView').classList.contains('toolbar-hidden'))setToolbar(false);
  if(d.type==='zh-performance')$('performanceInfo').textContent=`${d.renderer||'Renderer'} · ${d.width} × ${d.height}${Number.isFinite(d.logicFrame)?` · frame ${d.logicFrame}`:''}`;
  if(d.type==='zh-display-result'){if(!d.ok&&d.width&&d.height){preferences.resolution=`${d.width}x${d.height}`;if(!['1024x768','1280x720','1600x900','1920x1080'].includes(preferences.resolution))preferences.resolution=DEFAULTS.resolution;syncPreferences()}$('settingsStatus').textContent=d.ok?`Rendering at ${d.width} × ${d.height}.`:`Resolution was not applied: ${d.error}`}
  if(d.type==='zh-error')setToolbar(true);
});
