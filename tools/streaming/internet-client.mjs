// H.264/AAC playback through the same HTTPS host as signaling and controls.
// No WebRTC/UDP discovery is needed on this transport.
import {playbackPlan} from './stream-policy.mjs';
export async function connectInternet({video,quality='low',onMessage,onStats,onConnected,onClosed}) {
  if(!globalThis.MediaSource)throw Error('Internet playback needs Media Source Extensions. Try desktop Chrome or Safari.');
  const source=new MediaSource(),url=URL.createObjectURL(source);
  let socket,buffer,closed=false,connected=false,bytes=0,queuedBytes=0,queue=[],timer,playingHandler,targetFps=null,rtt=null;
  let previous,latest=null,catchUps=0,waiting=false,lastProgress=performance.now(),lastMediaTime=0,lastSeek=-Infinity;
  const controller=new AbortController();
  const open=new Promise((resolve,reject)=>{
    source.addEventListener('sourceopen',resolve,{once:true});
    source.addEventListener('error',()=>reject(Error('Could not open the video player.')),{once:true});
  });
  video.srcObject=null;video.src=url;video.load();
  const send=data=>{
    if(socket?.readyState!==WebSocket.OPEN)return;
    if(socket.bufferedAmount>65536){fail('Control connection is falling behind. Reconnecting…');return}
    socket.send(JSON.stringify(data));
  };
  function close(){
    if(closed)return;closed=true;clearInterval(timer);clearTimeout(timeout);controller.abort();
    if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<=65536)socket.send(JSON.stringify({type:'release'}));
    socket?.close();queue=[];queuedBytes=0;
    if(playingHandler)video.removeEventListener('playing',playingHandler);
    video.removeEventListener('waiting',onWaiting);video.removeEventListener('playing',onPlaying);
    video.pause();video.playbackRate=1;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  }
  function fail(text,retryable=true){if(closed)return;onMessage(text,true);close();onClosed({reason:text,retryable})}
  function onWaiting(){waiting=true}
  function onPlaying(){waiting=false}
  video.addEventListener('waiting',onWaiting);video.addEventListener('playing',onPlaying);
  function append(){
    if(closed||!buffer||buffer.updating)return;
    try{
      const ranges=buffer.buffered;
      if(ranges.length){
        const end=ranges.end(ranges.length-1),begin=ranges.start(0);
        const plan=playbackPlan({begin,end,currentTime:video.currentTime});
        if(plan.seek!==null&&!video.seeking&&performance.now()-lastSeek>2000){video.currentTime=plan.seek;lastSeek=performance.now();catchUps++}
        // Keep the live audio/video clock at 1x. Rate changes caused large
        // presentation drops in real Chrome even with a healthy NVENC stream.
        if(video.playbackRate!==1)video.playbackRate=1;
        if(video.currentTime-begin>5){buffer.remove(begin,video.currentTime-2);return}
      }
      if(queue.length){const chunk=queue.shift();queuedBytes-=chunk.byteLength;buffer.appendBuffer(chunk)}
    }catch{fail('Video playback stopped. Reconnecting…')}
  }
  const timeout=setTimeout(()=>fail('The host did not start video within 15 seconds. Reconnect or ask the host to restart streaming.'),15000);
  try{
    // HTTP errors are readable here; a failed WebSocket upgrade hides its status.
    const health=await fetch('/metrics',{cache:'no-store',signal:controller.signal});
    if(!health.ok){fail(health.status===401?'Private login was rejected. Reopen the invite and use the host’s login.':'The host is unavailable. Ask the host to check streaming.',health.status>=500);return {send,close}}
    const host=await health.json();
    if(host.connected){fail('A player is already connected. Ask the host to disconnect that session first.',false);return {send,close}}
    if(closed)return {send,close};
    await open;
    if(closed)return {send,close};
    const endpoint=new URL('/stream-ws',location.href);endpoint.searchParams.set('quality',quality);
    socket=new WebSocket(endpoint.href.replace(/^http/,'ws'));
    socket.binaryType='arraybuffer';
    socket.onmessage=event=>{
      if(closed)return;
      if(typeof event.data==='string'){
        try{
          const data=JSON.parse(event.data);
          if(data.type==='error'){fail('The host encoder stopped. Ask the host to check streaming.');return}
          if(data.type==='pong'&&Number.isFinite(data.id))rtt=performance.now()-data.id;
          if(data.type==='ready'){
            targetFps=data.targetFps;
            if(buffer)throw Error('The host sent duplicate video initialization');
            if(!MediaSource.isTypeSupported(data.mime)){fail('This browser cannot play H.264/AAC. Try desktop Chrome or Safari.',false);return}
            buffer=source.addSourceBuffer(data.mime);
            buffer.addEventListener('updateend',append);
            buffer.addEventListener('error',()=>fail('The video decoder stopped. Reconnect or try another browser.'));
            append();
          }
        }catch{fail('The host sent invalid video initialization. Ask the host to restart streaming.',false)}
      }else{
        bytes+=event.data.byteLength;queuedBytes+=event.data.byteLength;
        if(queuedBytes>1024*1024){fail('This connection cannot keep up with the video. Reconnecting…');return}
        queue.push(new Uint8Array(event.data));append();
      }
    };
    socket.onerror=()=>fail('Could not reach the streaming host. Check its address and password, then reconnect.');
    socket.onclose=()=>{if(!closed)fail('The host disconnected. Reconnect when its streaming server is running.')};
    playingHandler=()=>{
      if(closed||connected)return;connected=true;clearTimeout(timeout);onConnected();
      timer=setInterval(()=>{
        send({type:'ping',id:performance.now()});
        if(closed)return;
        const end=video.buffered.length?video.buffered.end(video.buffered.length-1):null;
        const counters=video.getVideoPlaybackQuality?.(),now=performance.now(),seconds=previous?(now-previous.now)/1000:0;
        const frames=counters?.totalVideoFrames,dropped=counters?.droppedVideoFrames;
        const framesInInterval=previous&&Number.isFinite(frames)&&frames>=previous.frames?frames-previous.frames:null;
        const dropsInInterval=previous&&Number.isFinite(dropped)&&dropped>=previous.dropped?dropped-previous.dropped:null;
        if(video.currentTime>lastMediaTime+.01){lastProgress=now;lastMediaTime=video.currentTime}
        const stalled=waiting&&now-lastProgress>1500;
        latest={transport:'https-websocket',quality,targetFps,rttMs:rtt,bufferMs:end===null?null:Math.max(0,end-video.currentTime)*1000,
          frames:frames??null,dropped:dropped??null,framesInInterval,dropsInInterval,intervalSeconds:seconds,
          decodedFps:seconds>0&&framesInInterval!==null&&dropsInInterval!==null?(framesInInterval-dropsInInterval)/seconds:null,
          receivedMbps:seconds>0?(bytes-previous.bytes)*8/seconds/1e6:null,bytesReceived:bytes,
          receiverVisible:!document.hidden,stalled,catchUps,width:video.videoWidth,height:video.videoHeight};
        previous={now,frames,dropped,bytes};onStats(latest);
        if(!document.hidden&&now-lastProgress>8000)fail('Video stopped advancing. Reconnecting…');
      },1000);
      video.removeEventListener('playing',playingHandler);
    };
    video.addEventListener('playing',playingHandler);
    socket.addEventListener('message',()=>video.play().catch(()=>{if(!closed&&!connected)onMessage('Click the picture to enable playback and sound.')}),{once:true});
    return {send,close,snapshot:()=>latest,connected:()=>connected&&!closed};
  }catch(error){if(closed)return {send,close};close();throw error}
}
