import '../isolation.mjs';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search), validCode=code=>/^[a-f0-9]{24}$/i.test(code);
let session,returnFocus;
const fail=message=>{$('error').textContent=message;$('error').hidden=!message};
if(validCode(query.get('session')||'')){$('sessionCode').value=query.get('session');$('status').textContent='Your friend’s session is ready to join. Select Join session below.';}
if(query.get('relay'))$('relayAddress').value=query.get('relay');
function relayFor(code){
  const input=$('relayAddress').value.trim();
  if(!input)return location.host+'/yuri-'+code;
  const url=new URL(/^[a-z]+:\/\//i.test(input)?input:'https://'+input);
  if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Enter the relay host and optional port, for example relay.example.com:15176.');
  return url.host+'/yuri-'+code;
}
function openGame(code){
  fail('');
  const url=new URL('./engine/runtime/',location.href);
  if(code){url.searchParams.set('network','1');url.searchParams.set('relay',relayFor(code));}
  session=code;
  returnFocus=document.activeElement;
  document.querySelector('header').inert=true;document.querySelector('footer').inert=true;
  $('launcher').hidden=true;$('game').hidden=false;document.body.classList.add('yuri-playing');
  $('sessionLabel').textContent=code?'Session '+code:'Solo';$('copyInvite').hidden=!code;
  $('gameNotice').textContent=code?'Import matching files, then use Network in the original game. Save before exiting.':'Select your local game folder or archive. Save inside the game before exiting.';
  $('yuriFrame').src=url.href;
  $('yuriFrame').focus();
}
$('solo').onclick=()=>openGame();
$('createSession').onclick=()=>{const code=[...crypto.getRandomValues(new Uint8Array(12))].map(v=>v.toString(16).padStart(2,'0')).join('');try{openGame(code)}catch(e){fail(e.message)}};
$('joinSession').onsubmit=e=>{e.preventDefault();const code=$('sessionCode').value.trim().toLowerCase();if(!validCode(code)){fail('Enter the complete 24-character session code from your friend.');return;}try{openGame(code)}catch(e){fail(e.message)}};
$('copyInvite').onclick=async()=>{const url=new URL('./',location.href);url.searchParams.set('session',session);if($('relayAddress').value.trim())url.searchParams.set('relay',$('relayAddress').value.trim());try{await navigator.clipboard.writeText(url.href);$('gameNotice').textContent='Invite copied. Your friend opens it and selects Join session.';}catch{$('gameNotice').textContent='Copy this invite: '+url.href;}};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen()}catch{$('gameNotice').textContent='Fullscreen is unavailable. You can keep playing in this window.';}};
$('closeGame').onclick=()=>$('exitDialog').showModal();$('cancelExit').onclick=()=>$('exitDialog').close();
$('confirmExit').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});$('yuriFrame').removeAttribute('src');$('exitDialog').close();$('game').hidden=true;$('launcher').hidden=false;document.body.classList.remove('yuri-playing');document.querySelector('header').inert=false;document.querySelector('footer').inert=false;session=undefined;returnFocus?.focus();};
