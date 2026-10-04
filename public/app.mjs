import './isolation.mjs';
import {assetLibrary} from './harness/launcher-asset-manager.mjs';
import {buildArchiveZip} from './harness/launcher-backup-zip.mjs';
const $=id=>document.getElementById(id), key='zhweb-identity-v1';
let identity,installed=false,importing=false,backupController,zipUrl,roomSocket,roomState,connecting=false;
try{$('sound').value=localStorage.getItem('zhweb-volume')||'75';$('graphics').value=localStorage.getItem('zhweb-graphics')||'ff'}catch{}
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
function showLobby(){view('lobby');$('librarySummary').textContent=`Local installation ready · ${assetLibrary.summary().formattedBytes}`;$('storageInfo').textContent='Installed files belong to this website and browser profile. Back up before clearing site data.';const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite;$('joinForm').requestSubmit()}}
$('nameForm').onsubmit=e=>{e.preventDefault();const name=$('name').value.trim();if(!/^[A-Za-z0-9 _-]{2,12}$/.test(name)){error('Use 2–12 letters, numbers, spaces, underscores or hyphens.');return;}identity={name,guest:identity?.guest||crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(identity))}catch{error('Browser storage is unavailable. Allow site storage to remember your commander name.');return;}restore()};
$('changeName').onclick=()=>{if(roomSocket){error('Leave your room before changing your commander name.');return;}$('name').value=identity?.name||'';view('entry');$('name').focus()};
async function importFiles(files){
  if(importing||!files.length)return;
  importing=true;error('');$('cancelImport').hidden=false;$('chooseFolder').disabled=$('chooseFiles').disabled=true;
  try{
    const scan=await assetLibrary.scan(files,{onProgress:progress});
    if(!scan.ok)throw Error(scan.error||scan.detail||`Missing required files: ${(scan.missing||scan.missingArchives||[]).map(v=>v.name||v).join(', ')}`);
    const result=await assetLibrary.prepare('install',progress);installed=true;showLobby();if(result.warning)error(result.warning.message);
  }catch(e){error(importing?`${e.message}. Select a complete compatible Data folder and retry.`:'Import cancelled. Your previous installation is preserved.');}
  finally{importing=false;$('cancelImport').hidden=true;$('progress').hidden=true;$('chooseFolder').disabled=$('chooseFiles').disabled=false;$('folderInput').value=$('fileInput').value='';}
}
$('chooseFolder').onclick=()=> $('folderInput').click();$('chooseFiles').onclick=()=>$('fileInput').click();
$('folderInput').onchange=e=>importFiles([...e.target.files]);$('fileInput').onchange=e=>importFiles([...e.target.files]);
$('cancelImport').onclick=()=>{importing=false;assetLibrary.recoverWorker(assetLibrary.worker,'Import cancelled');error('Import cancelled. Select the folder again to retry.');};
$('replaceLibrary').onclick=()=>view('setup');
$('exportLibrary').onclick=async()=>{
  backupController=new AbortController();$('exportLibrary').disabled=true;$('cancelBackup').hidden=false;$('saveZip').hidden=true;error('');
  try{const entries=[];for(const archive of assetLibrary.installedLibrary().archives){let dir=await navigator.storage.getDirectory();const parts=archive.opfsPath.split('/');const name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);entries.push({name:archive.name,file:await(await dir.getFileHandle(name)).getFile()});}const result=await buildArchiveZip(entries,{signal:backupController.signal,onProgress:p=>{$('backupStatus').textContent=p.detail||`Preparing ${p.name||'backup'}…`;}});if(zipUrl)URL.revokeObjectURL(zipUrl);zipUrl=URL.createObjectURL(result.blob||result);$('saveZip').href=zipUrl;$('saveZip').hidden=false;$('backupStatus').textContent='Backup ready. Save ZIP, then extract it before importing on another website.';}catch(e){error(e.message)}finally{$('exportLibrary').disabled=false;$('cancelBackup').hidden=true;}
};$('cancelBackup').onclick=()=>backupController?.abort();
function launch(room){error('');if(!installed)return;const url=new URL('./harness/game.html',location.href);url.searchParams.set('commander',identity.name);url.searchParams.set('shaderTier',$('graphics').value);if(room){url.searchParams.set('room',room.code);url.searchParams.set('guest',identity.guest);url.searchParams.set('host',room.players.find(p=>p.name===identity.name)?.host?'1':'0');} $('gameName').textContent=identity.name;$('gameStatus').textContent='Restoring local files…';$('gameFrame').src=url.href;$('gameView').hidden=false;}
$('solo').onclick=()=>launch();
$('exitGame').onclick=()=>{$('exitGame').disabled=true;$('gameStatus').textContent='Saving and shutting down…';$('gameFrame').contentWindow.postMessage({type:'zh-exit'},location.origin)};
function closeGame(){$('gameFrame').src='about:blank';$('gameView').hidden=true;$('matchControls').hidden=true;$('matchControls').replaceChildren();$('exitGame').disabled=false;if(document.fullscreenElement)document.exitFullscreen();}
$('fullscreen').onclick=()=>$('gameView').requestFullscreen().catch(e=>error(e.message));
$('sound').oninput=()=>{localStorage.setItem('zhweb-volume',$('sound').value);$('gameFrame').contentWindow.postMessage({type:'zh-volume',value:Number($('sound').value)/100},location.origin)};
$('diagnostics').onclick=()=>$('gameFrame').contentWindow.postMessage({type:'zh-diagnostics'},location.origin);
$('graphics').onchange=()=>{$('gameStatus').textContent='Graphics mode applies on next launch. In-game Options controls detail.';localStorage.setItem('zhweb-graphics',$('graphics').value)};
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('gameFrame').contentWindow)return;const d=e.data;if(d.type==='zh-status')$('gameStatus').textContent=d.message;if(d.type==='zh-ready'){$('gameStatus').textContent='Choose Single Player → Skirmish';if(roomState) $('gameStatus').textContent='Multiplayer → Anonymous (LAN): host creates, guest joins';}if(d.type==='zh-error'){$('gameStatus').textContent=d.message;$('exitGame').disabled=false;}if(d.type==='zh-exited'||d.type==='zh-exit')closeGame();if(d.type==='zh-diagnostics'){const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='zero-hour-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}});
$('showHelp').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();
async function roomConnect(action,code){
  if(connecting||roomSocket)return;
  connecting=true;$('createRoom').disabled=true;$('joinForm').querySelector('button').disabled=true;
  try{
  error('');const config=await fetch('./network-config.json').then(r=>{if(!r.ok)throw Error('Room service is unavailable. Solo skirmish remains available.');return r.json()});
  if(!config.rooms||!config.signaling)throw Error('The multiplayer service is offline. Solo skirmish remains available.');
  const content=await fingerprint();const url=new URL(config.rooms,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  roomSocket=new WebSocket(url);roomSocket.onopen=()=>roomSocket.send(JSON.stringify({action,code,name:identity.name,guest:identity.guest,content,runtime:config.runtime}));
  roomSocket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.error){error(msg.error);roomSocket.close();roomSocket=null;return;}roomState=msg;view('room');$('roomTitle').textContent=msg.code;$('roomStatus').textContent=`${msg.players.length}/2 commanders connected to the room service`;$('players').replaceChildren(...msg.players.map(p=>{const li=document.createElement('li');const name=document.createElement('strong');name.textContent=p.name;const state=document.createElement('span');state.textContent=p.host?'Host':'Guest';li.append(name,state);return li}));$('compatibility').textContent=msg.compatible?'Runtime and content fingerprints match.':'Waiting for a second compatible installation.';$('roomLaunch').disabled=!msg.compatible;};
  roomSocket.onerror=()=>error('Could not connect to the room service. Check its URL and restart the service.');roomSocket.onclose=()=>{if(roomState)$('roomStatus').textContent='Room connection closed. Leave and reconnect before starting another game.';};
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
    $('sound').oninput();
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
    $('gameStatus').textContent=state?.network?.ready?`Match running · frame ${state.network.logicFrame}${state.network.crcMismatch?' · DESYNC: exit and report diagnostics':''}`:`${slots.filter(s=>s.human).length}/2 engine players · ${slots.filter(s=>s.human&&s.accepted).length} ready`;
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
restore();
