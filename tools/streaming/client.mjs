const video=document.querySelector('#stream'),stage=document.querySelector('#stage'),status=document.querySelector('#status'),stats=document.querySelector('#stats');
const connect=document.querySelector('#connect'),disconnect=document.querySelector('#disconnect'),fullscreen=document.querySelector('#fullscreen'),welcome=document.querySelector('#welcome');
let pc,channel,timer,previous,presented=0,previousPresented=0,frameCallback;
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
function send(data){if(channel?.readyState==='open')channel.send(JSON.stringify(data))}
function release(){send({type:'release'})}
function point(event){const r=video.getBoundingClientRect(),width=video.videoWidth||1280,height=video.videoHeight||720,scale=Math.min(r.width/width,r.height/height),left=r.left+(r.width-width*scale)/2,top=r.top+(r.height-height*scale)/2;return {x:Math.round((event.clientX-left)/scale),y:Math.round((event.clientY-top)/scale)}}
video.addEventListener('pointermove',event=>send({type:'move',...point(event)}));
video.addEventListener('pointerdown',event=>{event.preventDefault();video.focus();video.setPointerCapture(event.pointerId);send({type:'move',...point(event)});send({type:'button',button:event.button,down:true})});
video.addEventListener('pointerup',event=>{event.preventDefault();send({type:'button',button:event.button,down:false})});
video.addEventListener('pointercancel',release);video.addEventListener('contextmenu',event=>event.preventDefault());
video.addEventListener('wheel',event=>{event.preventDefault();send({type:'wheel',delta:event.deltaY})},{passive:false});
for(const type of ['keydown','keyup'])video.addEventListener(type,event=>{if(event.code==='Escape'&&document.fullscreenElement){release();return}event.preventDefault();if(!event.repeat)send({type:'key',code:event.code,down:type==='keydown'})});
video.addEventListener('blur',release);window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
fullscreen.addEventListener('click',async()=>{try{await stage.requestFullscreen();video.focus()}catch(error){message(`Full screen unavailable: ${error.message}`,true)}});
function countFrames(){if(video.requestVideoFrameCallback)frameCallback=video.requestVideoFrameCallback((now,metadata)=>{presented=metadata.presentedFrames;countFrames()})}
async function measure(){
  if(!pc)return;
  const report=await pc.getStats();let inbound,rtt;
  report.forEach(value=>{if(value.type==='inbound-rtp'&&value.kind==='video')inbound=value;if(value.type==='candidate-pair'&&value.state==='succeeded'&&value.nominated)rtt=value.currentRoundTripTime});
  if(!inbound)return;
  if(previous){const seconds=(inbound.timestamp-previous.timestamp)/1000,decode=(inbound.framesDecoded-previous.framesDecoded)/seconds,display=(presented-previousPresented)/seconds;let server;
    try{server=await(await fetch('/metrics')).json()}catch{}
    const encoder=server?.encoding?.encoder??'unavailable';
    stats.textContent=`${decode.toFixed(1)} decoded FPS · ${video.requestVideoFrameCallback?display.toFixed(1):'—'} displayed FPS · RTT ${rtt===undefined?'—':Math.round(rtt*1000)+' ms'} · ${encoder}`;
    if(server?.encoding?.error)message(`GPU encoder stopped: ${server.encoding.error}. Disconnect and check the host logs.`,true);
    window.ZeroHourStreamDiagnostics={scope:'Video playback and network RTT; RTT is not input-to-picture latency',timestamp:new Date().toISOString(),decodedFps:decode,displayedFps:video.requestVideoFrameCallback?display:null,rttMs:rtt===undefined?null:rtt*1000,decoderImplementation:inbound.decoderImplementation??null,powerEfficientDecoder:inbound.powerEfficientDecoder??null,framesDropped:inbound.framesDropped,server};
  }previous=inbound;previousPresented=presented;
}
async function stop(notify=true){
  release();clearInterval(timer);if(frameCallback!==undefined&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(frameCallback);
  const old=pc;pc=null;channel=null;old?.close();video.srcObject=null;previous=null;previousPresented=0;presented=0;
  connect.disabled=false;disconnect.disabled=true;fullscreen.disabled=true;welcome.hidden=false;
  if(notify)try{await fetch('/disconnect',{method:'POST'})}catch{}
}
disconnect.addEventListener('click',async()=>{await stop();message('Disconnected. Your game session remains open on the laptop.')});
connect.addEventListener('click',async()=>{
  connect.disabled=true;message('Connecting to your game session…');
  try{
    pc=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});channel=pc.createDataChannel('input',{ordered:true});
    channel.onopen=()=>{message('Connected. Click the picture to control your game.');disconnect.disabled=false;fullscreen.disabled=false;video.focus()};
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
  }catch(error){await stop(false);message(`Could not connect: ${error.message}`,true)}
});
window.addEventListener('pagehide',()=>{release();if(pc)navigator.sendBeacon('/disconnect',new Blob([],{type:'text/plain'}));pc?.close()});
