// Actual local H.264/AAC MSE decode and receiver controls. Synthetic video,
// fixture server and input trace; no host GPU, game or physical WAN acceptance.
const {chromium}=require('playwright');
const {WebSocketServer}=require('ws');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');

(async()=>{
  const root=__dirname,output=path.resolve(root,'../../.local/streaming/experience-verification');
  const shots=path.resolve(root,'../../.impeccable/review');
  await fs.mkdir(output,{recursive:true});await fs.mkdir(shots,{recursive:true});
  const media={};
  for(const [name,size] of [['low','854x480'],['balanced','1280x720']]){
    const file=path.join(output,name+'.mp4');
    execFileSync('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i',`testsrc2=size=${size}:rate=30`,
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','45','-c:v','libx264','-threads','2','-preset','ultrafast',
      '-profile:v','baseline','-pix_fmt','yuv420p','-g','30','-bf','0','-b:v','350k','-c:a','aac','-b:a','64k',
      '-movflags','empty_moov+default_base_moof','-frag_duration','100000',file],{windowsHide:true,timeout:60000});
    const bytes=await fs.readFile(file),avcc=bytes.indexOf(Buffer.from('avcC')),boxes=[];
    for(let offset=0;offset<bytes.length;){const length=bytes.readUInt32BE(offset);assert(length>=8);boxes.push({kind:bytes.subarray(offset+4,offset+8).toString(),bytes:bytes.subarray(offset,offset+length)});offset+=length}
    const fragments=[];let init=Buffer.alloc(0),pending=[];
    for(const box of boxes){if(box.kind==='ftyp'||box.kind==='moov')init=Buffer.concat([init,box.bytes]);else if(box.kind==='moof')pending=[box.bytes];else if(box.kind==='mdat'){pending.push(box.bytes);fragments.push(Buffer.concat(pending))}}
    media[name]={init,fragments,mime:`video/mp4; codecs="avc1.${bytes.subarray(avcc+5,avcc+8).toString('hex')}, mp4a.40.2"`};
  }
  let browser,page,occupied=false,metricsAvailable=true,connections=0;
  const peers=new Set(),trace=[],requests=[],errors=[];
  const server=http.createServer(async(req,res)=>{
    requests.push({path:req.url,method:req.method});
    try{
      if(req.url==='/metrics'){
        res.setHeader('Content-Type','application/json');if(!metricsAvailable){res.statusCode=503;return res.end('{}')}
        return res.end(JSON.stringify({connected:occupied||peers.size>0,sampleTimeMs:performance.now(),
          encoding:{encoder:'h264_nvenc',encodedFrames:999999}, // Stale LAN metrics must not enter HTTPS reports.
          internet:{encoder:'h264_nvenc',width:854,height:480,targetFps:30,targetBitrate:350000,password:'DO-NOT-EXPORT'},
          password:'DO-NOT-EXPORT',address:'192.168.99.99'}));
      }
      if(req.url==='/disconnect'){for(const peer of peers)peer.close();return res.end('{}')}
      const name=new URL(req.url,'http://localhost').pathname;
      const files={'/':'client.html','/client.mjs':'client.mjs','/report.mjs':'report.mjs','/stream-policy.mjs':'stream-policy.mjs','/internet-client.mjs':'internet-client.mjs','/font.woff2':'../../public/fonts/rajdhani.woff2'};
      if(!files[name]){res.statusCode=404;return res.end()}
      res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.woff2')?'font/woff2':'text/html');
      res.end(await fs.readFile(path.resolve(root,files[name])));
    }catch(error){res.statusCode=500;res.end(error.message)}
  });
  const ws=new WebSocketServer({server});
  ws.on('connection',(peer,request)=>{
    peers.add(peer);connections++;
    const quality=new URL(request.url,'http://localhost').searchParams.get('quality');
    const source=media[quality]||media.balanced;
    peer.send(JSON.stringify({type:'ready',mime:source.mime,targetFps:30}));peer.send(source.init);
    let index=0;const timer=setInterval(()=>{if(peer.readyState===1&&index<source.fragments.length)peer.send(source.fragments[index++])},100);
    peer.on('message',message=>{const data=JSON.parse(message);trace.push(data);if(data.type==='ping')peer.send(JSON.stringify({type:'pong',id:data.id}))});
    peer.on('close',()=>{clearInterval(timer);peers.delete(peer)});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/?transport=internet`;
  const evidence={scope:'Synthetic Windows Chrome H.264/AAC playback and input trace. No GPU/game/WAN/Mac performance proof.',checks:[]};
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
    assert.equal(await page.locator('#transport').inputValue(),'internet');assert.equal(await page.locator('#internetQuality').inputValue(),'auto');
    await page.screenshot({path:path.join(shots,'stream-experience-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(shots,'stream-experience-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    async function connected(){await page.waitForFunction(()=>!document.querySelector('#report').disabled&&document.querySelector('video').currentTime>.5,null,{timeout:20000})}
    await page.locator('#connect').click();await connected();
    assert.equal(await page.locator('#stream').evaluate(v=>v.videoWidth),854);
    evidence.checks.push('Invite selects Internet; Auto starts at real 480p30 decode; desktop/mobile layout');
    await page.locator('#toggleTools').click();
    await page.locator('#stream').click();await page.keyboard.press('F8');assert(await page.locator('#utilities').isVisible());
    await page.locator('#mute').click();assert(await page.locator('#stream').evaluate(v=>v.muted));
    await page.locator('#volume').fill('40');assert.equal(await page.locator('#stream').evaluate(v=>v.volume),.4);
    const rect=await page.locator('#stream').boundingBox();
    await page.mouse.move(rect.x+rect.width*.25,rect.y+rect.height*.25);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5,{steps:8});await page.mouse.up();
    await page.locator('#stream').focus();await page.keyboard.down('Control');await page.keyboard.press('1');await page.keyboard.up('Control');
    await page.locator('#disconnect').focus();await page.waitForTimeout(100);
    assert(trace.some(t=>t.type==='button'&&t.down));assert(trace.some(t=>t.type==='button'&&!t.down));
    assert(trace.some(t=>t.type==='key'&&t.code==='ControlLeft'&&t.down));assert(trace.some(t=>t.type==='key'&&t.code==='Digit1'));
    assert(trace.some(t=>t.type==='release'));assert(!trace.some(t=>t.type==='key'&&t.code==='F8'));
    if(await page.locator('#utilities').isHidden())await page.locator('#toggleTools').click();
    const downloadEvent=page.waitForEvent('download',{timeout:25000});await page.locator('#report').click();
    const download=await downloadEvent;const reportPath=path.join(output,'https-report.json');await download.saveAs(reportPath);
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    assert.equal(report.transport,'https-websocket');assert(report.summary.decodedFps.mean>0);assert(report.summary.bufferMs.count>0);
    assert.equal(report.summary.hostEncodeFps.count,0);assert.equal(report.inputToVisibleResponse.status,'unavailable');
    assert.doesNotMatch(JSON.stringify(report),/DO-NOT-EXPORT|192\.168\.99\.99/);
    assert(report.samples.every(sample=>sample.server?.encoding.encodedFrames===null));
    evidence.checks.push('Audio controls, drag/key order, blur release and local F8; HTTPS report downloads with live counters, privacy and unavailable input latency');
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
    const full=await page.locator('#stream').boundingBox(),buttonsBefore=trace.filter(t=>t.type==='button'&&t.down).length;
    await page.mouse.click(full.x+full.width/2,full.y+2);await page.waitForTimeout(100);
    assert.equal(trace.filter(t=>t.type==='button'&&t.down).length,buttonsBefore,'Letterbox click issued an order');
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
    evidence.checks.push('Fullscreen tools remain usable; letterbox clicks cannot issue orders');
    await page.locator('#internetQuality').selectOption('balanced');await connected();
    await page.waitForFunction(()=>document.querySelector('video').videoWidth===1280);
    assert.equal(await page.locator('#stream').evaluate(v=>v.volume),.4);assert(await page.locator('#stream').evaluate(v=>v.muted));
    evidence.checks.push('Manual quality briefly reconnects to 720p while retaining receiver audio preferences');
    for(const peer of peers)peer.terminate();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Retrying'));
    await connected();assert(connections>=3);
    evidence.checks.push('Network loss automatically reconnects video');
    for(const peer of peers)peer.terminate();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Retrying'));
    await page.locator('#disconnect').click();const stoppedAt=connections;await page.waitForTimeout(2200);assert.equal(connections,stoppedAt);
    assert.equal(await page.locator('#connect').isDisabled(),false);assert.equal(await page.locator('#report').isDisabled(),true);
    evidence.checks.push('Disconnect cancels pending retries and clears diagnostics');
    occupied=true;await page.locator('#connect').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('already connected'));
    assert.equal(connections,stoppedAt);assert.equal(await page.locator('#disconnect').isDisabled(),true);occupied=false;
    await page.reload();assert.equal(await page.locator('#internetQuality').inputValue(),'balanced');assert.equal(await page.locator('#stream').evaluate(v=>v.volume),.4);
    assert.equal(await page.locator('#transport').inputValue(),'internet');
    await page.locator('#connect').click();await connected();metricsAvailable=false;
    const missingEvent=page.waitForEvent('download',{timeout:25000});await page.locator('#report').click();
    const missingFile=await missingEvent;await missingFile.saveAs(path.join(output,'https-missing-metrics.json'));
    const missing=JSON.parse(await fs.readFile(path.join(output,'https-missing-metrics.json'),'utf8'));
    assert(missing.samples.every(s=>s.server===null&&s.hostError));assert(missing.summary.decodedFps.mean>0);metricsAvailable=true;
    await page.locator('#report').click();await page.waitForTimeout(500);await page.locator('#disconnect').click();
    assert((await page.locator('#report-status').textContent()).includes('cancelled'));
    await page.waitForTimeout(1500);assert.equal(await page.locator('#report').isDisabled(),true);
    evidence.checks.push('Occupied host stops retries; preferences survive reload; unavailable metrics preserve receiver report; disconnect cancels report');
    assert.deepEqual(errors,[]);assert(!requests.some(r=>r.method==='POST'&&r.path!=='/disconnect'));
    evidence.status='passed';evidence.browser=await browser.version();evidence.summary=report.summary;
    console.log(JSON.stringify(evidence,null,2));
  }catch(error){evidence.status='failed';evidence.failure=error.stack;evidence.errors=errors;evidence.receiver=await page?.locator('#status').textContent().catch(()=>null);await page?.screenshot({path:path.join(shots,'stream-experience-failure.png'),fullPage:true}).catch(()=>{});console.error(JSON.stringify(evidence,null,2));process.exitCode=1}
  finally{await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(evidence,null,2));await browser?.close();for(const peer of peers)peer.terminate();await new Promise(resolve=>ws.close(resolve));await new Promise(resolve=>server.close(resolve))}
})();
