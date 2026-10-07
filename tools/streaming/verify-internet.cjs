// Tests the real host's NVENC/MSE transport. A public URL exercises the tunnel,
// but the receiver remains on this PC; this is not separate-network acceptance.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {WebSocket}=require('ws');

(async()=>{
  const password=(await fs.readFile('.local/streaming/password','utf8')).trim();
  const remote=process.env.ZH_STREAM_TEST_URL||'https://127.0.0.1:3002';
  const origin=new URL(remote).origin,errors=[],frames=[];
  const output=path.resolve('.local/streaming/internet-verification');
  const shots=path.resolve('.impeccable/review');
  await fs.mkdir(output,{recursive:true});await fs.mkdir(shots,{recursive:true});
  let browser,server,page;
  const evidence={status:'failed',transport:'https-websocket',publicTunnel:!origin.includes('127.0.0.1'),
    scope:'Same-PC receiver through local or public HTTPS; physical remote gameplay and latency unverified'};
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({ignoreHTTPSErrors:true,httpCredentials:{username:'saddam',password},viewport:{width:1366,height:900}});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{const Native=MediaSource;globalThis.MediaSource=class extends Native{constructor(){super();globalThis.verificationMediaSource=this}}});
    page.on('websocket',socket=>socket.on('framereceived',event=>{if(frames.length<24)frames.push(typeof event.payload==='string'?event.payload:{bytes:event.payload.length})}));
    const unauthenticated=await browser.newContext({ignoreHTTPSErrors:true});
    assert.equal((await unauthenticated.request.get(origin+'/')).status(),401);
    await unauthenticated.close();
    assert.equal((await context.request.post(origin+'/disconnect',{headers:{Origin:'https://untrusted.example'}})).status(),403);
    // The WebSocket upgrade also enforces authentication and same-origin.
    async function denied(headers,expected){
      await new Promise((resolve,reject)=>{
        const ws=new WebSocket(origin.replace('https:','wss:')+'/stream-ws',{rejectUnauthorized:false,headers,handshakeTimeout:5000});
        ws.on('unexpected-response',(req,res)=>{res.resume();req.destroy();try{assert.equal(res.statusCode,expected);resolve()}catch(error){reject(error)}});
        ws.on('open',()=>{ws.close();reject(Error('Unauthorized WebSocket unexpectedly opened'))});ws.on('error',reject);
      });
    }
    await denied({Origin:origin},401);
    await denied({Origin:'https://untrusted.example',Authorization:'Basic '+Buffer.from('saddam:'+password).toString('base64')},403);
    await page.goto(origin+'/',{waitUntil:'networkidle'});
    await page.locator('#transport').selectOption('internet');
    await page.locator('#connect').click();
    await page.locator('#stream').click();
    await page.waitForTimeout(3000);
    evidence.media=await page.evaluate(()=>{const v=document.querySelector('#stream'),s=globalThis.verificationMediaSource;return {time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.message,duration:Number.isFinite(v.duration)?v.duration:null,buffers:[...(s?.sourceBuffers??[])].map(b=>({updating:b.updating,ranges:Array.from({length:b.buffered.length},(_,i)=>[b.buffered.start(i),b.buffered.end(i)])}))}});
    await page.waitForFunction(()=>{const v=document.querySelector('#stream');return v.readyState>=3&&v.currentTime>.5&&document.querySelector('#status').textContent.startsWith('Connected through HTTPS')},null,{timeout:20000});
    const first=await page.locator('#stream').evaluate(v=>({time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames}));
    await page.waitForTimeout(4000);
    const last=await page.locator('#stream').evaluate(v=>({time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,width:v.videoWidth,height:v.videoHeight}));
    assert(last.time>first.time+2);assert(last.frames>first.frames+30);assert.equal(last.width,1280);assert.equal(last.height,720);
    assert.equal((await context.request.get(origin+'/stream-ws',{headers:{Origin:origin}})).status(),409);
    const rect=await page.locator('#stream').boundingBox();
    const scale=Math.min(rect.width/1280,rect.height/720);
    await page.mouse.move(rect.x+(rect.width-1280*scale)/2+320*scale,rect.y+(rect.height-720*scale)/2+180*scale);
    await page.waitForTimeout(500);
    const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
    const pointer=JSON.parse(execFileSync(docker,['compose','--project-name','zero-hour-streaming','--env-file','.local/streaming/compose.env','--file','compose.streaming.wsl.yaml','exec','-T','--user','1000','friend','python3','-c',"import json; from Xlib import display; p=display.Display(':99').screen().root.query_pointer(); print(json.dumps([p.root_x,p.root_y]))"],{encoding:'utf8',timeout:5000,windowsHide:true}));
    assert(Math.abs(pointer[0]-320)<=1&&Math.abs(pointer[1]-180)<=1,'Remote pointer did not reach the isolated X11 display');
    await page.screenshot({path:path.join(shots,evidence.publicTunnel?'stream-public-receiver.png':'stream-local-receiver.png'),fullPage:true});
    await page.locator('#disconnect').click();
    await page.waitForTimeout(1000);await page.locator('#connect').click();await page.locator('#stream').click();
    await page.waitForFunction(()=>document.querySelector('#stream').currentTime>.5&&document.querySelector('#status').textContent.startsWith('Connected through HTTPS'),null,{timeout:20000});
    await page.locator('#disconnect').click();
    evidence.playback={observedSeconds:last.time-first.time,decodedFrames:last.frames-first.frames,width:last.width,height:last.height};
    evidence.checks=['unauthenticated HTTP/WS rejected','cross-origin POST/WS rejected','real GPU stream decoded','remote pointer reached isolated X11 display','second player rejected','disconnect/reconnect'];
    if(!evidence.publicTunnel){
      server=spawn(process.execPath,['tools/server.mjs'],{env:{...process.env,PORT:'8100'},windowsHide:true});
      await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
      const ui=await browser.newContext({viewport:{width:1366,height:900}});
      const website=await ui.newPage();website.on('pageerror',error=>errors.push(error.message));
      await website.goto('http://127.0.0.1:8100/');await website.getByRole('link',{name:'Stream game',exact:true}).click();
      assert(await website.getByRole('heading',{name:'Connect to a host'}).isVisible());
      await website.locator('#streamAddress').fill('javascript:alert(1)');await website.getByRole('button',{name:'Open stream'}).click();
      assert(await website.locator('#streamError').isVisible());
      await website.goto('http://127.0.0.1:8100/stream/?host=https%3A%2F%2Fexample.trycloudflare.com');
      assert.equal(await website.locator('#streamAddress').inputValue(),'https://example.trycloudflare.com');
      await website.screenshot({path:path.join(shots,'stream-desktop.png'),fullPage:true});
      await website.setViewportSize({width:390,height:844});
      assert(await website.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await website.screenshot({path:path.join(shots,'stream-mobile.png'),fullPage:true});
      evidence.checks.push('website navigation','invalid invite error','invite prefill','390px responsive layout');
      await ui.close();
    }
    assert.deepEqual(errors,[]);evidence.status='passed';console.log(JSON.stringify(evidence,null,2));
  }catch(error){evidence.failure=error.message;evidence.errors=errors;evidence.frames=frames;evidence.receiver=await page?.evaluate(()=>{const v=document.querySelector('#stream');return {status:document.querySelector('#status')?.textContent,time:v?.currentTime,ready:v?.readyState,error:v?.error?.message}}).catch(()=>null);await page?.screenshot({path:path.join(shots,'stream-internet-failure.png'),fullPage:true}).catch(()=>{});console.error(JSON.stringify(evidence,null,2));process.exitCode=1}
  finally{server?.kill();await browser?.close();await fs.writeFile(path.join(output,evidence.publicTunnel?'public.json':'local.json'),JSON.stringify(evidence,null,2))}
})();
