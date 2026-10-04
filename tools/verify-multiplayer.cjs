const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');
runBrowserTest(async()=>{
 const software=process.env.ZH_RENDERER!=='hardware';
 const report={checks:[],errors:[],rendererRequested:software?'SwiftShader':'Default Windows Chrome hardware path',scope:'Two local Windows Chrome browser profiles on one PC; real archives and engine instances. Does not establish two computers or different networks.'};
 const contexts=[],clients=[];let timer;
 const wait=async(label,fn,predicate,timeout=120000)=>{const end=Date.now()+timeout;let v;while(Date.now()<end){v=await fn();if(predicate(v))return v;await new Promise(r=>setTimeout(r,500));}await fs.writeFile('.local/multiplayer-last-state.json',JSON.stringify(v,null,2));throw Error(label+' timed out');};
 const rpc=(client,command,payload={})=>client.game.evaluate(([c,p])=>window.CnCPort.rpc(c,p),[command,payload]);
 const state=async client=>(await rpc(client,'realEngineLanState')).lan;
 try{
  timer=setInterval(()=>console.log('MULTIPLAYER',report.stage),20000);
  for(const [profile,name]of [['acceptance-browser','FieldTest'],['guest-browser','FieldGuest']]){
   report.stage=`Preparing ${name}`;
   const context=await launchTestContext(chromium,path.resolve('.local/'+profile),{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:software?['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']:[]},{reuseProfile:profile==='acceptance-browser'?(process.env.ZH_HOST_PROFILE||null):(process.env.ZH_GUEST_PROFILE||null)});contexts.push(context);const page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log(name,m.text().slice(0,180))});await page.goto(process.env.ZH_SITE_URL||'http://localhost:8093/');await page.waitForTimeout(1000);
   if(await page.locator('#entry').isVisible()){await page.locator('#name').fill(name);await page.locator('#nameForm button').click();}
   if(await page.locator('#setup').isVisible()){await page.locator('#folderInput').setInputFiles('C:\\Program Files (x86)\\DODI-Repacks\\Generals Zero Hour\\Data');await page.locator('#lobby').waitFor({state:'visible',timeout:240000});}
   clients.push({page,name});
  }
  const [host,guest]=clients;report.stage='Create real website room';await host.page.locator('#createRoom').click();await host.page.locator('#room').waitFor({state:'visible',timeout:180000});report.code=await host.page.locator('#roomTitle').textContent();
  await guest.page.locator('#roomCode').fill(report.code);await guest.page.locator('#joinForm button').click();await guest.page.locator('#room').waitFor({state:'visible',timeout:180000});await host.page.locator('#roomLaunch').waitFor({state:'visible'});await wait('Compatible room',()=>host.page.locator('#roomLaunch').isEnabled(),v=>v===true,30000);report.checks.push('Two actual installations pass full content SHA-256 and version checks in a private room');
  report.stage='Booting host/guest engine';
  for(const client of clients){await client.page.locator('#roomLaunch').click();await client.page.waitForFunction(()=>{const w=document.getElementById('gameFrame').contentWindow;return !!w?.CnCPort?.rpc&&w.document.getElementById('loading')?.hidden===true},null,{timeout:180000});client.game=client.page.frames().find(f=>f.url().includes('game.html'));await client.page.mouse.move(700,450);await rpc(client,'postMessage',{message:0x200,lParam:(320<<16)|400,point:{x:400,y:320}});}
  report.stage='Native peer discovery and join';
  const states=await wait('Native two-player lobby',()=>Promise.all(clients.map(state)),states=>states.every(s=>s.game?.numPlayers===2),120000);report.lobbies=states;
  const names=states[0].game.slots.filter(s=>s.human).map(s=>s.name).sort();if(JSON.stringify(names)!==JSON.stringify(['FieldGuest','FieldTest']))throw Error('Website names do not match native human player list: '+JSON.stringify(names));report.checks.push('Distinct website identities are present in the actual native two-player game');
  report.transport=await Promise.all(clients.map(c=>rpc(c,'browserWebRtcEndpointState')));report.maps=await rpc(host,'mapCacheProbe');await fs.writeFile('.local/multiplayer-maps.json',JSON.stringify(report.maps,null,2));
  const mapKey=report.maps.probe.officialMultiplayerMaps.find(m=>m.key.includes('alpine assault')).key;
  await host.page.locator('#gameMap').selectOption(mapKey);
  await wait('Selected map synchronized',()=>Promise.all(clients.map(state)),s=>s.every(s=>s.game.map.toLowerCase()===mapKey.toLowerCase()),30000);
  report.ui=await Promise.all(clients.map(c=>rpc(c,'agentUiSnapshot')));
  const selectSetting=async(c,kind,slot,choose)=>{const control=c.page.locator(`select[data-engine-name="LanGameOptionsMenu.wnd:ComboBox${kind}${slot}"]`);await control.waitFor({state:'visible',timeout:45000});const options=await control.locator('option').evaluateAll(options=>options.map(o=>({value:o.value,text:o.textContent})));const option=choose(options);if(!option)throw Error('No native option for '+kind+JSON.stringify(options));await control.selectOption(option.value);return option;};
  report.factionOptions=await selectSetting(host,'PlayerTemplate',0,o=>o.find(o=>/^GLA$/i.test(o.text)));
  await selectSetting(guest,'PlayerTemplate',1,o=>o.find(o=>/^USA$/i.test(o.text)));
  await selectSetting(host,'Color',0,o=>o[1]);await selectSetting(guest,'Color',1,o=>o[2]);
  await selectSetting(host,'Team',0,o=>o[1]);await selectSetting(guest,'Team',1,o=>o[2]);
  report.configured=await wait('Original settings synchronize',()=>Promise.all(clients.map(state)),s=>s.every(s=>s.game.slots[0].playerTemplate?.present&&s.game.slots[1].playerTemplate?.present&&s.game.slots[0].color!==s.game.slots[1].color&&s.game.slots[0].color>=0&&s.game.slots[1].color>=0&&s.game.slots[0].teamNumber!==s.game.slots[1].teamNumber),45000);
  report.checks.push('Website map, faction, color and team controls update the actual synchronized native settings');
  await wait('Identical final slot configuration',()=>Promise.all(clients.map(state)),s=>{
   const config=game=>JSON.stringify(game.slots.map(v=>[v.slot,v.name,v.color,v.teamNumber,v.playerTemplate?.name]));return config(s[0].game)===config(s[1].game);
  },45000);
  await new Promise(r=>setTimeout(r,2000));
  for(const c of [guest,host])await c.page.locator('#gameReady').click();
  await wait('Native ready state',()=>Promise.all(clients.map(state)),s=>s.every(s=>s.game.slots.filter(v=>v.human).every(v=>v.accepted&&v.hasMap)),45000);report.checks.push('Original ready and map availability synchronize on both engines');
  report.stage='Starting synchronized match';await host.page.locator('#gameStart').click();
  await wait('Both actual Network instances',()=>Promise.all(clients.map(state)),s=>s.every(s=>s.network?.ready),45000);
  await wait('Active synchronized gameplay',()=>Promise.all(clients.map(c=>rpc(c,'agentWorldSnapshot'))),s=>s.every(s=>s.result?.game?.mode==='lan'&&s.result?.game?.playable&&s.result?.objects?.length>1),240000);
  report.checks.push('Two original LAN engine instances loaded real match terrain over WebRTC; sustained simulation checked separately');
  report.startNetworks=await Promise.all(clients.map(state));
  report.graphics=await Promise.all(clients.map(c=>rpc(c,'threadedStatus')));
  await wait('Active simulation and settled viewport',()=>Promise.all(clients.map(c=>rpc(c,'realEngineFrame',{frames:1}))),s=>s.every(s=>s.frame?.clientState?.gameplay?.logicFrame>10&&s.frame?.clientState?.controlBarWindows?.parent?.y<720),120000);
  report.stage='Replicated unit movement';
  const draws=(await rpc(host,'queryDrawables')).drawables;const worker=draws.drawables.find(o=>o.localOwned&&o.kindOf?.dozer);
  if(!worker)throw Error('Host builder absent from real multiplayer');
  const world=(await rpc(host,'agentWorldSnapshot')).result;const builder=world.objects.find(o=>o.owner===world.localPlayerIndex&&/Worker|Dozer/.test(o.template));
  const canvasBox=await host.game.locator('#viewport').boundingBox();
  const click=async(x,y,button='left')=>host.page.mouse.click(canvasBox.x+x*canvasBox.width/1280,canvasBox.y+y*canvasBox.height/720,{button});
  for(const offset of [-12,-20,0]){await click(worker.screenPos.x,worker.screenPos.y+offset);await new Promise(r=>setTimeout(r,1000));report.selection=await rpc(host,'querySelection');if(report.selection.result?.selected?.some(o=>o.id===worker.id))break;}
  if(!report.selection.result?.selected?.some(o=>o.id===worker.id))throw Error('Mouse did not select the real multiplayer builder');
  await click(worker.screenPos.x+70,worker.screenPos.y+60,'right');report.moveOrder={source:'Actual native mouse right-click',objectId:worker.id};
  report.replicatedMove=await wait('Replicated worker displacement',()=>Promise.all(clients.map(c=>rpc(c,'queryDrawables'))),s=>{
   const objects=s.map(v=>v.drawables.allDrawables.find(o=>o.id===worker.id));return objects.every(Boolean)&&Math.hypot(objects[0].worldPos.x-worker.worldPos.x,objects[0].worldPos.y-worker.worldPos.y)>30&&Math.hypot(objects[0].worldPos.x-objects[1].worldPos.x,objects[0].worldPos.y-objects[1].worldPos.y)<5;
  },120000);
  report.checks.push('An original host movement order displaced a real worker and replicated its position on the guest engine');
  report.stage='Synchronization observation';report.samples=[];
  for(let i=0;i<12;i++){const s=await Promise.all(clients.map(state));report.samples.push(s);if(s.some(v=>v.network.crcMismatch))throw Error('CRC mismatch detected');await new Promise(r=>setTimeout(r,2500));}
  report.checks.push('30-second two-profile network observation without engine CRC mismatch');
  for(const [i,c]of clients.entries()){const shot=await rpc(c,'screenshot');if(shot.screenshot?.dataUrl)await fs.writeFile(`output/playwright/multiplayer-${i?'guest':'host'}.png`,Buffer.from(shot.screenshot.dataUrl.split(',')[1],'base64'));}
  report.status='passed preliminary local startup; full match and separate networks pending';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;report.failureStates=await Promise.all(clients.filter(c=>c.game).map(async c=>({name:c.name,url:c.game.url(),siteStatus:await c.page.locator('#gameStatus').textContent(),engineStatus:await c.game.locator('#status').textContent(),lan:await state(c),transport:await rpc(c,'browserWebRtcEndpointState'),frame:await rpc(c,'realEngineFrame',{frames:1})})));for(const c of clients.filter(c=>c.game)){const shot=await rpc(c,'screenshot');if(shot.screenshot?.dataUrl)await fs.writeFile(`output/playwright/multiplayer-${c.name}.png`,Buffer.from(shot.screenshot.dataUrl.split(',')[1],'base64'));}}
 finally{clearInterval(timer);await fs.writeFile('.local/multiplayer-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks,errors:report.errors},null,2));for(const c of contexts)await c.close();}
});
