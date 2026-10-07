import {rate, hostSnapshot, readMarker, buildReport} from './report.mjs';
import {connectInternet} from './internet-client.mjs';
const video=document.querySelector('#stream'),stage=document.querySelector('#stage'),status=document.querySelector('#status'),stats=document.querySelector('#stats');
const connect=document.querySelector('#connect'),disconnect=document.querySelector('#disconnect'),fullscreen=document.querySelector('#fullscreen'),welcome=document.querySelector('#welcome');
const reportButton=document.querySelector('#report'),reportStatus=document.querySelector('#report-status');
let pc,channel,timer,previous,presented=0,frameCallback,sessionId,sessionStart,recording,pendingProbe;
let measurement=Promise.resolve();
let visibilityEpoch=0;
let internetConnection,connectionAttempt=0;
const transport=document.querySelector('#transport');
const internetQuality=document.querySelector('#internetQuality');
if(transport){transport.value=/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)?'lan':'internet';}
function qualityVisibility(){if(internetQuality)internetQuality.closest('label').hidden=transport?.value!=='internet'}
qualityVisibility();transport?.addEventListener('change',qualityVisibility);
const finite=value=>Number.isFinite(value)?value:null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
const probeCanvas=document.createElement('canvas');probeCanvas.width=48;probeCanvas.height=48;
const probeContext=probeCanvas.getContext('2d',{willReadFrequently:true});
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
function send(data){if(internetConnection)internetConnection.send(data);else if(channel?.readyState==='open')channel.send(JSON.stringify(data))}
function release(){send({type:'release'})}
function point(event){const r=video.getBoundingClientRect(),width=video.videoWidth||1280,height=video.videoHeight||720,scale=Math.min(r.width/width,r.height/height),left=r.left+(r.width-width*scale)/2,top=r.top+(r.height-height*scale)/2;return {x:Math.round((event.clientX-left)/scale),y:Math.round((event.clientY-top)/scale)}}
video.addEventListener('pointermove',event=>send({type:'move',...point(event)}));
video.addEventListener('pointerdown',event=>{event.preventDefault();video.play().catch(()=>{});video.focus();video.setPointerCapture(event.pointerId);send({type:'move',...point(event)});send({type:'button',button:event.button,down:true})});
video.addEventListener('pointerup',event=>{event.preventDefault();send({type:'button',button:event.button,down:false})});
video.addEventListener('pointercancel',release);video.addEventListener('contextmenu',event=>event.preventDefault());
video.addEventListener('wheel',event=>{event.preventDefault();send({type:'wheel',delta:event.deltaY})},{passive:false});
for(const type of ['keydown','keyup'])video.addEventListener(type,event=>{if(event.code==='Escape'&&document.fullscreenElement){release();return}event.preventDefault();if(!event.repeat)send({type:'key',code:event.code,down:type==='keydown'})});
video.addEventListener('blur',release);window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{
  visibilityEpoch++;
  if(document.hidden){
    release();if(recording)recording.hidden=true;
    finishProbe({status:'unavailable',latencyMs:null,reason:'Receiver tab became hidden'});
  }
});
fullscreen.addEventListener('click',async()=>{try{await stage.requestFullscreen();video.focus()}catch(error){message(`Full screen unavailable: ${error.message}`,true)}});
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
  if(!host?.diagnosticProbe)reason='Host does not advertise video-marker-v1';
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
reportButton.addEventListener('click',async()=>{
  if(recording||pc?.connectionState!=='connected')return;
  release();clearInterval(timer);reportButton.disabled=true;reportButton.textContent='Recording…';
  const task={cancelled:false};recording=task;
  const startedAt=new Date().toISOString(),started=performance.now(),samples=[],probes=[];
  const capturedSession=sessionId;
  reportStatus.textContent='Recording for 10 seconds. Keep this tab visible and continue playing. Brief corner markers measure the stream path.';
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
      interrupted:task.hidden||samples.some(sample=>!sample.receiverVisible||sample.connectionState!=='connected')});
    const filename=`zero-hour-stream-${startedAt.replace(/[:.]/g,'-')}.json`;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    reportStatus.textContent=`Report download requested: ${filename}. Check this device’s downloads. ${report.inputToVisibleResponse.status==='measured'?'Stream marker latency measured.':'Input delay unavailable; see the report for the reason.'} Nothing was uploaded.`;
  }catch(error){reportStatus.textContent=`Report could not be saved: ${error.message}`}
  finally{
    if(recording===task)recording=null;
    reportButton.textContent='Save diagnostic report';reportButton.disabled=pc?.connectionState!=='connected';
    if(pc&&sessionId===capturedSession)timer=setInterval(()=>measure().catch(()=>{}),2000);
  }
});
async function stop(notify=true){
  connectionAttempt++;internetConnection?.close();internetConnection=null;if(transport)transport.disabled=false;if(internetQuality)internetQuality.disabled=false;
  if(recording){recording.cancelled=true;reportStatus.textContent='Report cancelled because the stream disconnected. Reconnect and collect a fresh report.'}
  finishProbe({status:'unavailable',latencyMs:null,reason:'Stream disconnected'});
  release();clearInterval(timer);if(frameCallback!==undefined&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameCallback);
  const old=pc;pc=null;channel=null;old?.close();video.srcObject=null;previous=null;presented=0;
  delete window.ZeroHourStreamDiagnostics;stats.textContent='Playback statistics appear after connection.';
  connect.disabled=false;disconnect.disabled=true;fullscreen.disabled=true;reportButton.disabled=true;welcome.hidden=false;
  if(notify)try{await fetch('/disconnect',{method:'POST'})}catch{}
}
disconnect.addEventListener('click',async()=>{await stop();message('Disconnected. Your game session remains open on the laptop.')});
connect.addEventListener('click',async()=>{
  connect.disabled=true;message('Connecting to your game session…');
  const attempt=++connectionAttempt;if(transport)transport.disabled=true;if(internetQuality)internetQuality.disabled=true;
  try{
    if(transport?.value==='internet'){
      const connection=await connectInternet({video,quality:internetQuality?.value||'low',onMessage:message,
        onConnected:()=>{if(attempt!==connectionAttempt)return;welcome.hidden=true;disconnect.disabled=false;fullscreen.disabled=false;message('Connected through HTTPS. Click the picture to control your game.');video.focus()},
        onStats:sample=>{stats.textContent=`HTTPS · RTT ${sample.rttMs===null?'—':Math.round(sample.rttMs)+' ms'} · buffer ${sample.bufferMs===null?'—':Math.round(sample.bufferMs)+' ms'} · ${sample.receivedMbps.toFixed(1)} Mbps`;window.ZeroHourStreamDiagnostics=sample},
        onClosed:()=>{if(attempt===connectionAttempt)stop(false)} });
      if(attempt!==connectionAttempt){connection.close();return}internetConnection=connection;disconnect.disabled=false;
      reportStatus.textContent='HTTPS playback shows its buffer and network RTT. The WebRTC diagnostic report is available with Same Wi-Fi mode.';
      return;
    }
    pc=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});sessionId=crypto.randomUUID();sessionStart=performance.now();channel=pc.createDataChannel('input',{ordered:true});
    channel.onopen=()=>{message('Connected. Click the picture to control your game.');disconnect.disabled=false;fullscreen.disabled=false;reportButton.disabled=Boolean(recording);video.focus()};
    pc.ontrack=event=>{if(!video.srcObject)video.srcObject=new MediaStream();video.srcObject.addTrack(event.track);video.play().catch(()=>message('Click the picture to enable sound.'));welcome.hidden=true};
    pc.onconnectionstatechange=()=>{if(pc&&['failed','disconnected'].includes(pc.connectionState)){message('Connection lost. Reconnect, and check that both devices are on the same Wi-Fi.',true);stop()}};
    const screen=pc.addTransceiver('video',{direction:'recvonly'});
    const h264=RTCRtpReceiver.getCapabilities('video').codecs.filter(codec=>codec.mimeType.toLowerCase()==='video/h264');
    if(!h264.length)throw new Error('This browser does not support H.264 WebRTC playback. Try Safari or Chrome.');
    screen.setCodecPreferences(h264);pc.addTransceiver('audio',{direction:'recvonly'});
    await pc.setLocalDescription(await pc.createOffer());
    if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Local connection discovery timed out')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc?.iceGatheringState==='complete'){clearTimeout(timeout);resolve()}})});
    const response=await fetch('/offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:pc.localDescription.sdp,type:pc.localDescription.type})});
    if(!response.ok)throw new Error(await response.text());
    await pc.setRemoteDescription(await response.json());countFrames();timer=setInterval(()=>measure().catch(()=>{}),2000);
    setTimeout(()=>{if(pc?.connectionState!=='connected'&&pc){message('No video connection. Check the host firewall and same-Wi-Fi connection, then reconnect.',true);stop()}},20000);
  }catch(error){if(attempt!==connectionAttempt)return;await stop(false);message(`Could not connect: ${error.message}`,true)}
});
window.addEventListener('pagehide',()=>{release();internetConnection?.close();if(pc)navigator.sendBeacon('/disconnect',new Blob([],{type:'text/plain'}));pc?.close()});
