// Public room UI and signaling/transport components; not a full internet match.
const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const report={checks:[],scope:'Public GitHub Pages and approved temporary Cloudflare endpoint; two tabs on one PC; actual host installation'};let context;
 try{
  context=await chromium.launchPersistentContext(path.resolve('.local/hosted-acceptance-v2'),{channel:'chrome',headless:true});const host=context.pages()[0];await host.goto('https://mustafamarroun-glitch.github.io/zero-hour-web/',{waitUntil:'domcontentloaded',timeout:120000});await host.locator('#lobby').waitFor({state:'visible',timeout:90000});await host.locator('#createRoom').click();await host.locator('#room').waitFor({state:'visible',timeout:90000});const code=await host.locator('#roomTitle').textContent();report.checks.push('Actual published Create room control sends a full installation fingerprint over secure WSS and receives a private room');
  const guest=await context.newPage();await guest.goto('https://mustafamarroun-glitch.github.io/zero-hour-web/',{waitUntil:'domcontentloaded',timeout:120000});await guest.waitForFunction(()=>typeof document.getElementById('nameForm')?.onsubmit==='function',null,{timeout:90000});
  const pages=[host,guest];await Promise.all(pages.map((page,index)=>page.evaluate(async([code,index])=>{
   const {createWebRtcUdpEndpoint}=await import(new URL('./harness/webrtc-udp-endpoint.mjs',location.href).href);const config=await fetch('./network-config.json').then(r=>r.json());window.probeReceived=[];window.probeEndpoint=createWebRtcUdpEndpoint({room:'transport-probe-'+code,peerId:crypto.randomUUID(),displayName:'Transport'+index,relayUrls:[config.signaling],iceServers:config.iceServers||[],onDatagram:d=>probeReceived.push([...d.bytes])});await probeEndpoint.connect(30000);
  },[code,index])));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>probeEndpoint.snapshot().openPeers===1,null,{timeout:60000})));
  await Promise.all(pages.map(p=>p.evaluate(()=>probeEndpoint.sendDatagram({bytes:new Uint8Array([7,42,99]),ip:0xffffffff,port:8088,sourcePort:8088}))));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>probeReceived.some(v=>JSON.stringify(v)==='[7,42,99]'),null,{timeout:30000})));
  report.transport=await Promise.all(pages.map(p=>p.evaluate(()=>probeEndpoint.snapshot())));report.checks.push('Both published WebRTC endpoint modules discover through the approved public Nostr service and exchange exact datagram bytes in both directions');
  await Promise.all(pages.map(p=>p.evaluate(()=>probeEndpoint.close())));await host.locator('#leaveRoom').click();report.status='passed components; separate-device gameplay remains pending';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}finally{if(context)await context.close();await fs.writeFile('.local/public-network-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks},null,2));}
})();
