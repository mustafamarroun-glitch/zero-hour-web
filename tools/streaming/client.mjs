import {rate, hostSnapshot, readMarker, buildReport} from './report.mjs';
import {connectInternet} from './internet-client.mjs';
import {autoQuality,QUALITY_LABELS,videoPoint} from './stream-policy.mjs';
const video=document.querySelector('#stream'),stage=document.querySelector('#stage'),status=document.querySelector('#status'),stats=document.querySelector('#stats');
const connect=document.querySelector('#connect'),disconnect=document.querySelector('#disconnect'),fullscreen=document.querySelector('#fullscreen'),welcome=document.querySelector('#welcome');
const reportButton=document.querySelector('#report'),reportStatus=document.querySelector('#report-status');
let pc,channel,timer,previous,presented=0,frameCallback,sessionId,sessionStart,recording,pendingProbe;
let measurement=Promise.resolve();
let visibilityEpoch=0;
let internetConnection,connectionAttempt=0;
let reconnectTimer,stableTimer,retries=0,effectiveQuality='low',autoState={},changingQuality=false;
let pendingMove,moveFrame,dragging=false;
const transport=document.querySelector('#transport');
const internetQuality=document.querySelector('#internetQuality');
const utilities=document.querySelector('#utilities'),toggleTools=document.querySelector('#toggleTools'),controlStatus=document.querySelector('#controlStatus');
const volume=document.querySelector('#volume'),mute=document.querySelector('#mute');
const preferenceKey='zero-hour-web-stream-v1';
let preferences={quality:'auto',volume:75,muted:false};
try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(saved&&['auto','low','balanced','fast'].includes(saved.quality))preferences.quality=saved.quality;if(Number.isFinite(saved?.volume))preferences.volume=Math.max(0,Math.min(100,saved.volume));preferences.muted=saved?.muted===true}catch{}
function savePreferences(){try{localStorage.setItem(preferenceKey,JSON.stringify(preferences))}catch{}}
if(internetQuality)internetQuality.value=preferences.quality;
const requestedTransport=new URL(location.href).searchParams.get('transport');
if(transport){transport.value=['lan','internet'].includes(requestedTransport)?requestedTransport:/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)?'lan':'internet';}
function qualityVisibility(){if(internetQuality)internetQuality.closest('label').hidden=transport?.value!=='internet'}
qualityVisibility();transport?.addEventListener('change',qualityVisibility);
const finite=value=>Number.isFinite(value)?value:null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
const probeCanvas=document.createElement('canvas');probeCanvas.width=48;probeCanvas.height=48;
const probeContext=probeCanvas.getContext('2d',{willReadFrequently:true});
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
function active(){return pc?.connectionState==='connected'||internetConnection?.connected?.()===true}
function send(data){if(internetConnection)internetConnection.send(data);else if(channel?.readyState==='open'){if(channel.bufferedAmount>65536){channel.close();channel=null;connectionLost({reason:'Control connection fell behind.',retryable:false});return}channel.send(JSON.stringify(data))}}
function flushMove(){if(moveFrame)cancelAnimationFrame(moveFrame);moveFrame=null;if(pendingMove){const move=pendingMove;pendingMove=null;send(move)}}
function release(){if(moveFrame)cancelAnimationFrame(moveFrame);pendingMove=null;moveFrame=null;dragging=false;send({type:'release'});if(controlStatus)controlStatus.textContent='Click the picture to take control.'}
function point(event){return videoPoint(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,event.clientX,event.clientY)}
video.addEventListener('pointermove',event=>{const p=point(event);if(!p||(!p.inside&&!dragging))return;pendingMove={type:'move',x:p.x,y:p.y};if(!moveFrame)moveFrame=requestAnimationFrame(flushMove)});
video.addEventListener('pointerdown',event=>{video.play().catch(()=>{});const p=point(event);if(!p?.inside||!active())return;event.preventDefault();video.focus();setTools(false);video.setPointerCapture(event.pointerId);dragging=true;pendingMove={type:'move',x:p.x,y:p.y};flushMove();send({type:'button',button:event.button,down:true})});
video.addEventListener('pointerup',event=>{event.preventDefault();flushMove();send({type:'button',button:event.button,down:false});dragging=event.buttons!==0});
video.addEventListener('pointercancel',release);video.addEventListener('contextmenu',event=>event.preventDefault());
video.addEventListener('wheel',event=>{if(!active()||!point(event)?.inside)return;event.preventDefault();flushMove();send({type:'wheel',delta:event.deltaY})},{passive:false});
for(const type of ['keydown','keyup'])video.addEventListener(type,event=>{
  if(event.code==='F8'||(event.altKey&&event.code==='Enter')){event.preventDefault();if(type==='keydown'&&!event.repeat){if(event.code==='F8')toggleTools?.click();else toggleFullscreen()}return}
  if(event.code==='Escape'&&document.fullscreenElement){release();return}event.preventDefault();if(!event.repeat){flushMove();send({type:'key',code:event.code,down:type==='keydown'})}
});
video.addEventListener('focus',()=>{if(active()&&controlStatus)controlStatus.textContent='Keyboard and mouse control active. F8 shows stream tools.'});
video.addEventListener('blur',release);window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{
  visibilityEpoch++;
  if(document.hidden){
    autoState.good=autoState.bad=0;
    release();if(recording)recording.hidden=true;
    finishProbe({status:'unavailable',latencyMs:null,reason:'Receiver tab became hidden'});
  }
});
async function toggleFullscreen(){release();try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();video.focus()}catch{message('Full screen is unavailable. Use the browser’s full-screen control.',true)}}
fullscreen.addEventListener('click',toggleFullscreen);
document.addEventListener('fullscreenchange',()=>{release();fullscreen.textContent=document.fullscreenElement?'Leave full screen':'Full screen';video.focus()});
function setTools(open){if(!utilities||!toggleTools)return;utilities.hidden=!open;toggleTools.setAttribute('aria-expanded',String(open));toggleTools.textContent=open?'Hide tools · F8':'Stream tools · F8'}
toggleTools?.addEventListener('click',()=>{release();setTools(utilities.hidden)});
function syncAudio(){video.volume=preferences.volume/100;video.muted=preferences.muted;if(volume)volume.value=preferences.volume;if(mute){mute.textContent=preferences.muted?'Unmute':'Mute';mute.setAttribute('aria-pressed',String(preferences.muted))}}
syncAudio();volume?.addEventListener('input',()=>{preferences.volume=Number(volume.value);syncAudio();savePreferences()});mute?.addEventListener('click',()=>{preferences.muted=!preferences.muted;syncAudio();savePreferences()});
function finishProbe(result){
  if(!pendingProbe)return;
  const probe=pendingProbe;pendingProbe=null;clearTimeout(probe.timeout);
  try{send({type:'diagnostic-clear'})}catch{}probe.resolve(result);
}
function countFrames(){if(video.requestVideoFrameCallback)frameCallback=video.requestVideoFrameCallback((now,metadata)=>{
  presented=metadata.presentedFrames;
  if(pendingProbe&&!document.hidden){
    try{
      probeContext.drawImage(video,0,0,48,48,0,0,48,48);
      if(readMarker(probeContext.getImageData(0,0,48,48).data)===pendingProbe.nonce){
        finishProbe({status:'measured',latencyMs:performance.now()-pendingProbe.started,
          atMs:performance.now()-sessionStart});
      }
    }catch{finishProbe({status:'unavailable',latencyMs:null,reason:'Video pixel readback unavailable'})}
  }
  countFrames();
})}
function probeLatency(host){
  let reason;
  if(internetConnection)reason='HTTPS transport does not support a copied-video marker; RTT is not input latency';
  else if(!host?.diagnosticProbe)reason='Host does not advertise video-marker-v1';
  else if(!video.requestVideoFrameCallback)reason='Video frame callbacks unavailable';
  else if(!probeContext)reason='Canvas readback unavailable';
  else if(document.hidden)reason='Receiver tab is hidden';
  else if(channel?.readyState!=='open')reason='Input channel unavailable';
  if(reason)return Promise.resolve({status:'unavailable',latencyMs:null,reason});
  return new Promise(resolve=>{
    const nonce=crypto.getRandomValues(new Uint16Array(1))[0]||1;
    pendingProbe={nonce,resolve,started:performance.now(),timeout:setTimeout(()=>finishProbe({
      status:'unavailable',latencyMs:null,reason:'Marker was not detected within 2 seconds'
    }),2000)};
    try{send({type:'diagnostic-probe',nonce})}catch{finishProbe({status:'unavailable',latencyMs:null,reason:'Input send failed'})}
  });
}
function measure(){
  const result=measurement.then(takeMeasurement);measurement=result.catch(()=>{});return result;
}
async function takeMeasurement(){
  if(internetConnection)return takeInternetMeasurement();
  const connection=pc;
  if(!connection)return;
  const report=await connection.getStats();let inbound,pair,selectedPairId;
  report.forEach(value=>{if(value.type==='transport'&&value.selectedCandidatePairId)selectedPairId=value.selectedCandidatePairId});
  report.forEach(value=>{
    if(value.type==='inbound-rtp'&&(value.kind??value.mediaType)==='video')inbound=value;
    if(value.type==='candidate-pair'&&(selectedPairId?value.id===selectedPairId:value.state==='succeeded'&&value.nominated))pair=value;
  });
  const observed=performance.now(),frames=presented;let server=null,hostError=null;
  try{
    const response=await fetch('/metrics',{cache:'no-store',signal:AbortSignal.timeout(1500)});
    if(!response.ok)throw Error('Host metrics unavailable');
    server=hostSnapshot(await response.json());
  }catch{hostError='Host metrics unavailable or timed out'}
  if(pc!==connection)return;
  const atMs=observed-sessionStart,seconds=previous?(observed-previous.observed)/1000:0;
  const hostSeconds=server&&previous?.server?(server.sampleTimeMs-previous.server.sampleTimeMs)/1000:0;
  const decodeSeconds=previous&&inbound?(inbound.timestamp-previous.timestamp)/1000:0;
  const sample={timestamp:new Date().toISOString(),atMs,intervalSeconds:seconds,
    receiverVisible:!document.hidden,connectionState:connection.connectionState,
    decodedFps:rate(inbound?.framesDecoded,previous?.framesDecoded,decodeSeconds),
    displayedFps:video.requestVideoFrameCallback&&!document.hidden&&previous?.visible&&previous.visibilityEpoch===visibilityEpoch
      ?rate(frames,previous?.presented,seconds):null,
    rttMs:finite(pair?.currentRoundTripTime*1000),
    framesDecoded:finite(inbound?.framesDecoded),framesDropped:finite(inbound?.framesDropped),
    bytesReceived:finite(inbound?.bytesReceived),packetsLost:finite(inbound?.packetsLost),
    jitterMs:finite(inbound?.jitter*1000),width:finite(inbound?.frameWidth),height:finite(inbound?.frameHeight),
    decoderImplementation:typeof inbound?.decoderImplementation==='string'?inbound.decoderImplementation.slice(0,120):null,
    powerEfficientDecoder:typeof inbound?.powerEfficientDecoder==='boolean'?inbound.powerEfficientDecoder:null,
    hostCaptureFps:rate(server?.capturedFrames,previous?.server?.capturedFrames,hostSeconds),
    hostEncodeFps:rate(server?.encoding?.encodedFrames,previous?.server?.encoding?.encodedFrames,hostSeconds),
    server,hostError,receiverError:inbound?null:'Inbound video stats unavailable'};
  previous={observed,timestamp:inbound?.timestamp,framesDecoded:inbound?.framesDecoded,presented:frames,visible:!document.hidden,visibilityEpoch,server};
  const fmt=value=>value===null?'—':value.toFixed(1);
  stats.textContent=`${fmt(sample.decodedFps)} decoded FPS · ${fmt(sample.displayedFps)} displayed FPS · RTT ${sample.rttMs===null?'—':Math.round(sample.rttMs)+' ms'} · ${server?.encoding.encoder??'unavailable'}`;
  if(server?.encoding.error)message('GPU encoder stopped. Disconnect and check the host logs.',true);
  window.ZeroHourStreamDiagnostics={scope:'Video playback and network RTT; RTT is not input-to-picture latency',...sample};
  return sample;
}
async function takeInternetMeasurement(){
  const connection=internetConnection;if(!connection?.connected?.())return;
  const current=connection.snapshot()||{rttMs:null,bufferMs:video.buffered.length?Math.max(0,video.buffered.end(video.buffered.length-1)-video.currentTime)*1000:null,
    receivedMbps:null,bytesReceived:null,dropsInInterval:null,width:video.videoWidth,height:video.videoHeight,targetFps:null,catchUps:0,stalled:false};
  const observed=performance.now(),counters=video.getVideoPlaybackQuality?.();
  const decoded=Number.isFinite(counters?.totalVideoFrames)&&Number.isFinite(counters?.droppedVideoFrames)?counters.totalVideoFrames-counters.droppedVideoFrames:null;
  const seconds=previous?(observed-previous.observed)/1000:0;
  let server=null,hostError=null;
  try{const response=await fetch('/metrics',{cache:'no-store',signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error();const raw=await response.json();server=hostSnapshot({connected:raw.connected,sampleTimeMs:raw.sampleTimeMs,...raw.internet,encoding:{encoder:raw.internet?.encoder,encodedFrames:raw.internet?.encodedFrames,error:raw.internet?.error}})}catch{hostError='Host metrics unavailable or timed out'}
  if(connection!==internetConnection)return;
  const sample={timestamp:new Date().toISOString(),atMs:observed-sessionStart,intervalSeconds:seconds,receiverVisible:!document.hidden,connectionState:'connected',
    decodedFps:rate(decoded,previous?.framesDecoded,seconds),
    displayedFps:video.requestVideoFrameCallback&&!document.hidden&&previous?.visible&&previous.visibilityEpoch===visibilityEpoch?rate(presented,previous.presented,seconds):null,
    framesDecoded:decoded,framesDropped:finite(counters?.droppedVideoFrames),bytesReceived:current.bytesReceived,
    rttMs:current.rttMs,bufferMs:current.bufferMs,receivedMbps:current.receivedMbps,dropsInInterval:current.dropsInInterval,
    width:current.width,height:current.height,quality:effectiveQuality,targetFps:current.targetFps,catchUps:current.catchUps,stalled:current.stalled,
    hostCaptureFps:null,hostEncodeFps:server&&previous?.server?rate(server.encoding.encodedFrames,previous.server.encoding.encodedFrames,(server.sampleTimeMs-previous.server.sampleTimeMs)/1000):null,
    server,hostError,receiverError:decoded===null?'Video frame counters unavailable':null};
  previous={observed,framesDecoded:decoded,presented,visible:!document.hidden,visibilityEpoch,server};
  return sample;
}
reportButton.addEventListener('click',async()=>{
  if(recording||!active())return;
  release();clearInterval(timer);reportButton.disabled=true;reportButton.textContent='Recording…';
  if(internetQuality)internetQuality.disabled=true;
  autoState.good=autoState.bad=0;
  const task={cancelled:false};recording=task;
  const startedAt=new Date().toISOString(),started=performance.now(),samples=[],probes=[];
  const capturedSession=sessionId;
  reportStatus.textContent=internetConnection?'Recording playback for 10 seconds. Keep this tab visible and continue playing. Quality changes are paused; HTTPS input delay is unavailable.':'Recording for 10 seconds. Keep this tab visible and continue playing. Brief corner markers measure the stream path.';
  try{
    await measurement;previous=null;if(task.cancelled)return;
    const baseline=await measure();if(baseline)samples.push(baseline);
    for(let second=1;second<=10&&!task.cancelled;second++){
      await pause(started+second*1000-performance.now());if(task.cancelled)break;
      const sample=await measure();if(task.cancelled)break;if(sample)samples.push(sample);
      if([1,4,7].includes(second))probes.push(probeLatency(sample?.server));
    }
    const measuredProbes=await Promise.all(probes);
    if(task.cancelled)return;
    if(!samples.some(sample=>sample.decodedFps!==null))throw Error('No usable video FPS samples. Reconnect and try again.');
    const report=buildReport({sessionId:capturedSession,startedAt,samples,probes:measuredProbes,
      browser:{userAgent:navigator.userAgent,videoFrameCallbacks:Boolean(video.requestVideoFrameCallback)},
      interrupted:task.hidden||samples.some(sample=>!sample.receiverVisible||sample.connectionState!=='connected'),transport:internetConnection?'https-websocket':'webrtc'});
    const filename=`zero-hour-stream-${startedAt.replace(/[:.]/g,'-')}.json`;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    reportStatus.textContent=`Report download requested: ${filename}. Check this device’s downloads. ${report.inputToVisibleResponse.status==='measured'?'Stream marker latency measured.':'Input delay unavailable; see the report for the reason.'} Nothing was uploaded.`;
  }catch(error){reportStatus.textContent=`Report could not be saved: ${error.message}`}
  finally{
    if(recording===task)recording=null;
    reportButton.textContent='Save diagnostic report';reportButton.disabled=!active();
    if(internetQuality)internetQuality.disabled=false;
    if(pc&&sessionId===capturedSession)timer=setInterval(()=>measure().catch(()=>{}),2000);
  }
});
async function stop(notify=true){
  connectionAttempt++;changingQuality=false;clearTimeout(reconnectTimer);clearTimeout(stableTimer);release();internetConnection?.close();internetConnection=null;if(transport)transport.disabled=false;if(internetQuality)internetQuality.disabled=false;
  if(recording){recording.cancelled=true;reportStatus.textContent='Report cancelled because the stream disconnected. Reconnect and collect a fresh report.'}
  finishProbe({status:'unavailable',latencyMs:null,reason:'Stream disconnected'});
  release();clearInterval(timer);if(frameCallback!==undefined&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameCallback);
  const old=pc;pc=null;channel=null;old?.close();video.srcObject=null;previous=null;presented=0;
  delete window.ZeroHourStreamDiagnostics;stats.textContent='Playback statistics appear after connection.';
  connect.disabled=false;disconnect.disabled=true;fullscreen.disabled=true;reportButton.disabled=true;welcome.hidden=false;
  if(notify&&old)try{await fetch('/disconnect',{method:'POST'})}catch{}
}
disconnect.addEventListener('click',async()=>{retries=0;await stop();message('Disconnected. Your game session remains open on the laptop.')});
async function connectionLost({reason='Connection lost.',retryable=true}={}){
  const wasInternet=transport?.value==='internet';
  await stop(false);
  if(!retryable||retries>=3){message(`${reason} ${retryable?'Reconnect when the host is ready.':''}`,true);return}
  if(wasInternet&&internetQuality?.value==='auto'){effectiveQuality='low';autoState={retryAfter:performance.now()+90000}}
  const delay=[1500,3000,6000][retries++],attempt=connectionAttempt;
  message(`${reason} Retrying ${retries}/3…`,true);disconnect.disabled=false;
  reconnectTimer=setTimeout(()=>{if(attempt===connectionAttempt)startConnection(true)},delay);
}
function connectedMessage(text){clearTimeout(stableTimer);const attempt=connectionAttempt;stableTimer=setTimeout(()=>{if(attempt===connectionAttempt&&active())retries=0},15000);message(text);if(controlStatus)controlStatus.textContent='Click the picture to take control.'}
async function changeQuality(next){
  if(changingQuality||recording||!internetConnection)return;
  effectiveQuality=next;
  await stop(false);changingQuality=true;message(`Switching to ${QUALITY_LABELS[next]}. Your game remains open.`);disconnect.disabled=false;
  const attempt=connectionAttempt;
  reconnectTimer=setTimeout(()=>{if(attempt===connectionAttempt)startConnection(true);changingQuality=false},750);
}
internetQuality?.addEventListener('change',()=>{preferences.quality=internetQuality.value;savePreferences();autoState={};const next=preferences.quality==='auto'?'low':preferences.quality;if(internetConnection)changeQuality(next);else effectiveQuality=next});
connect.addEventListener('click',()=>{retries=0;autoState={};effectiveQuality=internetQuality?.value==='auto'?'low':internetQuality?.value||'low';startConnection()});
async function startConnection(recovery=false){
  clearTimeout(reconnectTimer);if(pc||internetConnection)await stop(false);
  connect.disabled=true;message('Connecting to your game session…');
  const attempt=++connectionAttempt;if(transport)transport.disabled=true;
  sessionId=crypto.randomUUID();sessionStart=performance.now();previous=null;presented=0;
  try{
    if(transport?.value==='internet'){
      const connection=await connectInternet({video,quality:effectiveQuality,onMessage:(text,error)=>{if(attempt===connectionAttempt)message(text,error)},
        onConnected:()=>{if(attempt!==connectionAttempt)return;welcome.hidden=true;disconnect.disabled=false;fullscreen.disabled=false;reportButton.disabled=Boolean(recording);connectedMessage('Connected through HTTPS. Click the picture to control your game.');countFrames()},
        onStats:sample=>{if(attempt!==connectionAttempt)return;stats.textContent=`${QUALITY_LABELS[effectiveQuality]} · ${sample.decodedFps===null?'—':sample.decodedFps.toFixed(1)} FPS · buffer ${sample.bufferMs===null?'—':Math.round(sample.bufferMs)+' ms'} · ${sample.receivedMbps===null?'—':sample.receivedMbps.toFixed(2)} Mbps`;window.ZeroHourStreamDiagnostics=sample;
          if(internetQuality?.value==='auto'&&!recording){const next=autoQuality(effectiveQuality,sample,autoState,performance.now());if(next)changeQuality(next)}},
        onClosed:failure=>{if(attempt===connectionAttempt)connectionLost(failure)} });
      if(attempt!==connectionAttempt){connection.close();return}internetConnection=connection;disconnect.disabled=false;
      reportStatus.textContent='Save a 10-second playback report during a match. HTTPS reports buffer, FPS and network RTT; input-to-picture latency is unavailable.';
      return;
    }
    pc=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});channel=pc.createDataChannel('input',{ordered:true});
    channel.onopen=()=>{if(attempt!==connectionAttempt)return;connectedMessage('Connected. Click the picture to control your game.');disconnect.disabled=false;fullscreen.disabled=false;reportButton.disabled=Boolean(recording);video.focus()};
    pc.ontrack=event=>{if(attempt!==connectionAttempt)return;if(!video.srcObject)video.srcObject=new MediaStream();video.srcObject.addTrack(event.track);video.play().catch(()=>message('Click the picture to enable sound.'));welcome.hidden=true};
    const localPeer=pc;
    pc.onconnectionstatechange=()=>{if(attempt!==connectionAttempt)return;if(['failed','disconnected'].includes(localPeer.connectionState))connectionLost({reason:'Wi-Fi stream connection lost.',retryable:false})};
    const screen=pc.addTransceiver('video',{direction:'recvonly'});
    const h264=RTCRtpReceiver.getCapabilities('video').codecs.filter(codec=>codec.mimeType.toLowerCase()==='video/h264');
    if(!h264.length)throw new Error('This browser does not support H.264 WebRTC playback. Try Safari or Chrome.');
    screen.setCodecPreferences(h264);pc.addTransceiver('audio',{direction:'recvonly'});
    await pc.setLocalDescription(await pc.createOffer());
    if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Local connection discovery timed out')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc?.iceGatheringState==='complete'){clearTimeout(timeout);resolve()}})});
    const response=await fetch('/offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:pc.localDescription.sdp,type:pc.localDescription.type})});
    if(!response.ok)throw new Error(await response.text());
    const answer=await response.json();if(attempt!==connectionAttempt)return;
    await localPeer.setRemoteDescription(answer);if(attempt!==connectionAttempt)return;countFrames();timer=setInterval(()=>measure().catch(()=>{}),2000);
    setTimeout(()=>{if(attempt===connectionAttempt&&pc?.connectionState!=='connected'&&pc)connectionLost({reason:'No Wi-Fi video. Check the host firewall and that both devices use the same Wi-Fi.',retryable:false})},20000);
  }catch(error){if(attempt!==connectionAttempt)return;if(recovery)await connectionLost({reason:'Could not reconnect to the host.'});else{await stop(false);message(`Could not connect: ${error.message}`,true)}}
}
window.addEventListener('pagehide',()=>{release();internetConnection?.close();if(pc)navigator.sendBeacon('/disconnect',new Blob([],{type:'text/plain'}));pc?.close()});
