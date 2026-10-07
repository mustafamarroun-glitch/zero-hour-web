// Real loopback H.264 WebRTC video, synthetic picture and fixture host metrics.
// This verifies diagnostics plumbing, never a match, Mac decoder or NVENC.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');

const hostFixture=String.raw`<!doctype html><canvas width="640" height="360"></canvas><script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
let peer,token=null,expires=0,frames=0,probes=0;window.fixtureTrace=[];
setInterval(()=>{
  frames++;ctx.fillStyle=frames%2?'#306540':'#406530';ctx.fillRect(0,0,640,360);
  ctx.fillStyle='#fff';ctx.font='20px sans-serif';ctx.fillText('Synthetic loopback verification',60,150);
  if(token&&performance.now()<expires){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,48,48);ctx.fillStyle='#000';ctx.fillRect(4,4,40,40);
    for(let bit=0;bit<16;bit++){
      ctx.fillStyle=(token&(1<<bit))?'#fff':'#000';ctx.fillRect(8+(bit%4)*8,8+Math.floor(bit/4)*8,8,8);
    }
  }
},1000/60);
window.answer=async offer=>{
  peer?.close();token=null;peer=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});
  peer.onconnectionstatechange=()=>window.fixtureTrace.push('connection: '+peer?.connectionState);
  peer.oniceconnectionstatechange=()=>window.fixtureTrace.push('ice: '+peer?.iceConnectionState);
  peer.onicecandidateerror=event=>window.fixtureTrace.push('candidate error: '+event.errorText);
  peer.ondatachannel=event=>{event.channel.onmessage=message=>{
    const data=JSON.parse(message.data);
    if(data.type==='diagnostic-probe'){token=data.nonce;expires=performance.now()+2000;probes++}
    if(data.type==='diagnostic-clear')token=null;
  };event.channel.onopen=()=>window.fixtureTrace.push('input open')};
  await peer.setRemoteDescription(offer);
  peer.addTrack(canvas.captureStream(60).getVideoTracks()[0]);
  await peer.setLocalDescription(await peer.createAnswer());
  window.fixtureTrace.push('answer created');
  if(peer.iceGatheringState!=='complete')await new Promise(resolve=>peer.onicegatheringstatechange=()=>{
    if(peer.iceGatheringState==='complete')resolve();
  });
  window.fixtureTrace.push({candidates:(peer.localDescription.sdp.match(/a=candidate:/g)||[]).length,
    remoteCandidates:(offer.sdp.match(/a=candidate:/g)||[]).length,
    transceivers:peer.getTransceivers().map(t=>({kind:t.receiver.track.kind,direction:t.currentDirection})),
    media:peer.localDescription.sdp.split('\r\n').filter(line=>line.startsWith('m='))});
  return {type:peer.localDescription.type,sdp:peer.localDescription.sdp};
};
window.fixtureMetrics=()=>({sampleTimeMs:performance.now(),capturedFrames:frames,captureMs:1,
  connected:peer?.connectionState==='connected',width:640,height:360,targetFps:60,targetBitrate:8000000,
  diagnosticProbe:'video-marker-v1',encoding:{encoder:'h264_nvenc',encodedFrames:frames,lastEncodeMs:2,error:null},
  outbound:{bytesSent:frames*1000,packetsSent:frames,packetsLost:0,rttMs:1},
  password:'DO-NOT-EXPORT',sdp:'DO-NOT-EXPORT',address:'192.168.99.99',turnSecret:'DO-NOT-EXPORT'});
window.stopFixture=()=>{peer?.close();peer=null};
</script>`;

(async()=>{
  const root=__dirname,output=path.resolve(root,'../../.local/streaming/report-verification');
  const shots=path.resolve(root,'../../.impeccable/review');
  await fs.mkdir(output,{recursive:true});await fs.mkdir(shots,{recursive:true});
  let host,browser,page,metricsAvailable=true;
  const requests=[],errors=[];
  const server=http.createServer(async(req,res)=>{
    try{
      requests.push({path:req.url,method:req.method});
      if(req.url==='/host-fixture'){res.setHeader('Content-Type','text/html');return res.end(hostFixture)}
      if(req.url==='/offer'){
        let body='';for await(const chunk of req)body+=chunk;
        const answer=await host.evaluate(offer=>window.answer(offer),JSON.parse(body));
        res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(answer));
      }
      if(req.url==='/disconnect'){await host.evaluate(()=>window.stopFixture());return res.end('{}')}
      if(req.url==='/metrics'){
        res.setHeader('Content-Type','application/json');
        if(!metricsAvailable){res.statusCode=503;return res.end('{}')}
        return res.end(JSON.stringify(await host.evaluate(()=>window.fixtureMetrics())));
      }
      const files={'/':'client.html','/client.mjs':'client.mjs','/report.mjs':'report.mjs','/internet-client.mjs':'internet-client.mjs',
        '/stream-policy.mjs':'stream-policy.mjs','/font.woff2':'../../public/fonts/rajdhani.woff2'};
      if(!files[req.url]){res.statusCode=404;return res.end()}
      res.setHeader('Content-Type',req.url.endsWith('.mjs')?'text/javascript':req.url.endsWith('.woff2')?'font/woff2':'text/html');
      res.end(await fs.readFile(path.resolve(root,files[req.url])));
    }catch(error){res.statusCode=500;res.end(error.message)}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const evidence={scope:'Windows Chrome only; real synthetic loopback H.264 video; fixture host metrics. No game, Mac or host NVENC acceptance.',checks:[],startedAt:new Date().toISOString()};
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    host=await context.newPage();host.on('pageerror',error=>errors.push('host fixture: '+error.message));await host.goto(url+'/host-fixture');
    await host.waitForFunction(()=>typeof window.answer==='function');
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);
    assert.equal(await page.locator('#report').isDisabled(),true);
    await page.screenshot({path:path.join(shots,'stream-report-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(shots,'stream-report-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    async function connect(target){
      await target.locator('#connect').click();await target.waitForFunction(()=>document.querySelector('#disconnect').disabled===false);
      await target.waitForFunction(()=>document.querySelector('video').readyState>=2);
    }
    async function collect(target,label){
      const download=target.waitForEvent('download',{timeout:25000});
      await target.locator('#report').click();assert.equal(await target.locator('#report').isDisabled(),true);
      const file=await download;assert.match(file.suggestedFilename(),/^zero-hour-stream-.*\.json$/);
      const destination=path.join(output,label+'.json');await file.saveAs(destination);
      const result=JSON.parse(await fs.readFile(destination,'utf8'));
      assert.equal(result.schemaVersion,1);assert.equal(result.samples.length,11);
      assert.equal(result.verification.macGameplayProven,false);
      assert.ok(result.durationSeconds>=8&&result.durationSeconds<16);
      assert.ok(result.summary.decodedFps.mean>0);
      assert.ok(result.samples.some(sample=>sample.rttMs!==null));
      assert.doesNotMatch(JSON.stringify(result),/DO-NOT-EXPORT|192\.168\.99\.99|turnSecret|"sdp"/);
      await target.waitForFunction(()=>!document.querySelector('#report').disabled);
      return result;
    }
    await connect(page);
    // Simulate a short visibility transition entirely between stats samples.
    await page.evaluate(()=>{
      window.fixtureHidden=false;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.fixtureHidden});
      for(const [delay,hidden] of [[2400,true],[2700,false]])setTimeout(()=>{
        window.fixtureHidden=hidden;document.dispatchEvent(new Event('visibilitychange'));
      },delay);
    });
    const first=await collect(page,'loopback');
    assert.equal(first.inputToVisibleResponse.status,'measured');
    assert.equal(first.inputToVisibleResponse.latencyMs.count,3);
    assert.ok(first.summary.displayedFps.mean>0);assert.ok(first.summary.hostCaptureFps.mean>0);
    assert.ok(first.summary.hostEncodeFps.mean>0);
    assert.equal(first.interrupted,true);
    assert.ok(first.summary.displayedFps.count<10);
    await page.screenshot({path:path.join(shots,'stream-report-recorded.png'),fullPage:true});
    evidence.checks.push('One click downloads JSON with live decoded/displayed FPS and WebRTC RTT; three encoded-video marker probes detected');
    evidence.checks.push('A brief simulated visibility transition between sample times marks interruption and excludes the affected display interval');
    await page.locator('#disconnect').click();
    assert.equal(await page.evaluate(()=>window.ZeroHourStreamDiagnostics),undefined);
    await connect(page);
    await page.locator('#report').click();await page.waitForTimeout(1200);await page.locator('#disconnect').click();
    await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('cancelled'));
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#report').isDisabled(),true);
    evidence.checks.push('Disconnect cancels recording and clears stale diagnostics');
    // Reconnect during cleanup, then collect with an unavailable metrics endpoint.
    await connect(page);metricsAvailable=false;
    const missing=await collect(page,'metrics-unavailable');
    assert.notEqual(missing.sessionId,first.sessionId);
    assert.equal(missing.samples[0].decodedFps,null);
    assert.ok(missing.samples.every(sample=>sample.server===null&&sample.hostError));
    assert.equal(missing.inputToVisibleResponse.status,'unavailable');
    assert.ok(missing.inputToVisibleResponse.probes.every(probe=>probe.latencyMs===null&&probe.reason));
    evidence.checks.push('Fresh reconnect counters/session ID; failed host metrics still export receiver data with unavailable probe reasons');
    await page.locator('#disconnect').click();
    metricsAvailable=true;
    const unsupported=await context.newPage();unsupported.on('pageerror',error=>errors.push(error.message));
    await unsupported.addInitScript(()=>{
      delete HTMLVideoElement.prototype.requestVideoFrameCallback;
      delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
    });
    await unsupported.goto(url);await connect(unsupported);
    const noCallback=await collect(unsupported,'callbacks-unavailable');
    assert.equal(noCallback.summary.displayedFps.count,0);
    assert.equal(noCallback.inputToVisibleResponse.latencyMs.count,0);
    assert.ok(noCallback.inputToVisibleResponse.probes.every(probe=>probe.reason==='Video frame callbacks unavailable'));
    evidence.checks.push('Missing video-frame callback API exports null displayed FPS and unavailable input latency');
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(request=>request.method!=='POST'||['/offer','/disconnect'].includes(request.path)));
    assert.equal(requests.filter(request=>request.path==='/metrics').every(request=>request.method==='GET'),true);
    evidence.checks.push('No report upload endpoint or browser exceptions; allowlisted JSON strips credential/address sentinels');
    evidence.browser=await browser.version();evidence.status='passed';
    evidence.summaries={loopback:first.summary,probe:first.inputToVisibleResponse.latencyMs};
    console.log(JSON.stringify(evidence,null,2));
  }catch(error){
    evidence.status='failed';evidence.failure=error.stack;evidence.errors=errors;
    evidence.receiver=await page?.locator('#status').textContent().catch(()=>null);
    evidence.host=await host?.evaluate(()=>({state:peer?.connectionState,ice:peer?.iceConnectionState,trace:window.fixtureTrace})).catch(()=>null);
    evidence.requests=requests;
    await page?.screenshot({path:path.join(shots,'stream-report-failure.png'),fullPage:true}).catch(()=>{});
    console.error(JSON.stringify(evidence,null,2));process.exitCode=1;
  }
  finally{
    await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(evidence,null,2));
    await browser?.close();await new Promise(resolve=>server.close(resolve));
  }
})();
