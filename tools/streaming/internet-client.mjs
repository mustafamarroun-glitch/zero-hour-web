// H.264/AAC playback through the same HTTPS host as signaling and controls.
// No WebRTC/UDP discovery is needed on this transport.
export async function connectInternet({video,quality='low',onMessage,onStats,onConnected,onClosed}) {
  if(!globalThis.MediaSource)throw Error('Internet playback needs Media Source Extensions. Try desktop Chrome or Safari.');
  const source=new MediaSource(),url=URL.createObjectURL(source);
  let socket,buffer,closed=false,connected=false,bytes=0,queuedBytes=0,queue=[],timer,playingHandler,targetFps=null,start=performance.now(),rtt=null;
  const open=new Promise((resolve,reject)=>{
    source.addEventListener('sourceopen',resolve,{once:true});
    source.addEventListener('error',()=>reject(Error('Could not open the video player.')),{once:true});
  });
  video.srcObject=null;video.src=url;video.load();
  const send=data=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data))};
  function close(){
    if(closed)return;closed=true;clearInterval(timer);clearTimeout(timeout);
    send({type:'release'});socket?.close();queue=[];queuedBytes=0;
    if(playingHandler)video.removeEventListener('playing',playingHandler);
    video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  }
  function fail(text){onMessage(text,true);close();onClosed()}
  function append(){
    if(closed||!buffer||buffer.updating)return;
    try{
      const ranges=buffer.buffered;
      if(ranges.length){
        const end=ranges.end(ranges.length-1),begin=ranges.start(0);
        if(end-video.currentTime>1.2||video.currentTime<begin)video.currentTime=Math.max(begin,end-.25);
        if(video.currentTime-begin>5){buffer.remove(begin,video.currentTime-2);return}
      }
      if(queue.length){const chunk=queue.shift();queuedBytes-=chunk.byteLength;buffer.appendBuffer(chunk)}
    }catch(error){fail(`Video playback stopped: ${error.message}. Reconnect.`)}
  }
  const timeout=setTimeout(()=>fail('The host did not start video within 15 seconds. Reconnect or ask the host to restart streaming.'),15000);
  try{
    await open;
    const endpoint=new URL('/stream-ws',location.href);endpoint.searchParams.set('quality',quality);
    socket=new WebSocket(endpoint.href.replace(/^http/,'ws'));
    socket.binaryType='arraybuffer';
    socket.onmessage=event=>{
      if(closed)return;
      if(typeof event.data==='string'){
        try{
          const data=JSON.parse(event.data);
          if(data.type==='error'){fail(data.message);return}
          if(data.type==='pong'&&Number.isFinite(data.id))rtt=performance.now()-data.id;
          if(data.type==='ready'){
            targetFps=data.targetFps;
            if(buffer)throw Error('The host sent duplicate video initialization');
            if(!MediaSource.isTypeSupported(data.mime))throw Error('This browser cannot play the host’s H.264/AAC stream. Try Chrome or Safari.');
            buffer=source.addSourceBuffer(data.mime);
            buffer.addEventListener('updateend',append);
            buffer.addEventListener('error',()=>fail('The video decoder stopped. Reconnect or try another browser.'));
            append();
          }
        }catch(error){fail(error.message)}
      }else{
        bytes+=event.data.byteLength;queuedBytes+=event.data.byteLength;
        if(queuedBytes>4*1024*1024){fail('This connection cannot keep up with the video. Reconnect on a faster connection.');return}
        queue.push(new Uint8Array(event.data));append();
      }
    };
    socket.onerror=()=>fail('Could not reach the streaming host. Check its address and password, then reconnect.');
    socket.onclose=()=>{if(!closed)fail('The host disconnected. Reconnect when its streaming server is running.')};
    playingHandler=()=>{
      if(closed||connected)return;connected=true;clearTimeout(timeout);onConnected();
      timer=setInterval(()=>{
        send({type:'ping',id:performance.now()});
        const end=video.buffered.length?video.buffered.end(video.buffered.length-1):null;
        const quality=video.getVideoPlaybackQuality?.();
        onStats({transport:'https-websocket',targetFps,rttMs:rtt,bufferMs:end===null?null:Math.max(0,end-video.currentTime)*1000,
          frames:quality?.totalVideoFrames??null,dropped:quality?.droppedVideoFrames??null,
          receivedMbps:bytes*8/(performance.now()-start)/1000});
      },1000);
      video.removeEventListener('playing',playingHandler);
    };
    video.addEventListener('playing',playingHandler);
    socket.addEventListener('message',()=>video.play().catch(()=>{if(!closed&&!connected)onMessage('Click the picture to enable playback and sound.')}),{once:true});
    return {send,close};
  }catch(error){close();throw error}
}
