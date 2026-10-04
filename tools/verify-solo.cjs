const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const report={checks:[],errors:[],missing:[],scope:'Windows Chrome, headless software renderer, retained fresh standalone profile, actual installed retail archives'};
 const ctx=await chromium.launchPersistentContext(path.resolve('.local/acceptance-browser'),{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const page=ctx.pages()[0]||await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()===404)report.missing.push(r.url())});
 const timer=setInterval(()=>console.log('SOLO',report.stage),20000);
 let game;
 const rpc=(command,payload={})=>game.evaluate(([command,payload])=>window.CnCPort.rpc(command,payload),[command,payload]);
 const capture=async name=>{const s=await rpc('screenshot');if(s.screenshot?.dataUrl)await fs.writeFile(`output/playwright/${name}.png`,Buffer.from(s.screenshot.dataUrl.split(',')[1],'base64'));};
 const wait=async(label,fn,predicate,timeout=45000)=>{const deadline=Date.now()+timeout;let v;while(Date.now()<deadline){v=await fn();if(predicate(v))return v;await new Promise(r=>setTimeout(r,300));}await fs.writeFile('.local/solo-last-state.json',JSON.stringify(v,null,2));throw Error(`${label} did not become ready. See solo-last-state.json`)};
 const click=async name=>{await wait(name,()=>rpc('queryWindowByName',{name}),v=>v.result?.clickable===true);const r=await rpc('clickWindowByName',{name});if(!r.ok)throw Error('Click failed '+name);};
 try{
  report.browser=await ctx.browser().version();await page.goto('http://localhost:8093/');await page.locator('#lobby').waitFor({state:'visible'});await page.locator('#solo').click();await page.waitForFunction(()=>{const w=document.getElementById('gameFrame').contentWindow;return !!w?.CnCPort?.rpc&&w.document.getElementById('loading')?.hidden===true},null,{timeout:120000});game=page.frames().find(f=>f.url().includes('game.html'));
  report.stage='Menu reveal';await page.mouse.move(800,420);await rpc('postMessage',{message:0x200,lParam:(320<<16)|400,point:{x:400,y:320}});
  await wait('Skirmish options',()=>rpc('queryWindowByName',{name:'SkirmishGameOptionsMenu.wnd:ButtonStart'}),r=>r.result?.clickable===true);
  await wait('Commander name',()=>rpc('queryWindowByName',{name:'SkirmishGameOptionsMenu.wnd:TextEntryPlayerName'}),r=>r.result?.entryText==='FieldTest');report.checks.push('Website commander name appears in the actual native skirmish field');report.stage='Skirmish settings';report.settings=(await rpc('realEngineFrame',{frames:1})).frame?.clientState;
  await fs.writeFile('.local/skirmish-settings.json',JSON.stringify(report.settings,null,2));await capture('skirmish-settings');
  const map=await rpc('realEngineSetSkirmishMap',{mapName:'maps/alpine assault/alpine assault.map'});report.map=map;
  const template=await rpc('realEngineSetSkirmishLocalTemplate',{templateName:'FactionGLA'});report.template=template;
  const dump=await rpc('realEngineDumpWindows');await fs.writeFile('.local/skirmish-windows.json',JSON.stringify(dump,null,2));
  const startName='SkirmishGameOptionsMenu.wnd:ButtonStart';await click(startName);
  report.stage='Loading real battlefield';
  const active=await wait('Skirmish gameplay',()=>rpc('realEngineFrame',{frames:1}),r=>r.frame?.clientState?.gameplay?.inGame===true&&r.frame?.clientState?.gameplay?.objectCount>0&&!r.frame?.clientState?.gameplay?.loadingMap,120000);
  report.active=active.frame?.clientState;await fs.writeFile('.local/solo-active.json',JSON.stringify(active,null,2));await capture('solo-battlefield');report.checks.push('Visible real skirmish battlefield');
  report.world=await rpc('agentWorldSnapshot',{includeCapabilities:true,detail:'tactical'});
  report.hud=await rpc('agentHudSnapshot');
  report.drawables=await rpc('queryDrawables');
  report.ui=await rpc('agentUiSnapshot');
  await fs.writeFile('.local/solo-control-state.json',JSON.stringify({world:report.world,hud:report.hud,drawables:report.drawables,ui:report.ui},null,2));
  if(report.world.result.players.find(p=>p.local)?.name!=='FieldTest')throw Error('Commander name did not reach actual in-game player list');
  report.checks.push('Actual in-game human player is named FieldTest');
  report.stage='Selecting and moving a worker';
  await wait('Settled gameplay viewport',()=>rpc('realEngineFrame',{frames:1}),r=>r.frame?.clientState?.controlBarWindows?.parent?.y<720,90000);
  report.drawables=await rpc('queryDrawables');
  const worker=report.drawables.drawables.drawables.find(o=>o.localOwned&&o.kindOf?.dozer&&o.onScreen);
  if(!worker)throw Error('No on-screen builder found');
  const canvas=game.locator('#viewport');const box=await canvas.boundingBox();
  const mouse=async(x,y,button='left')=>{await page.mouse.click(box.x+x*box.width/1280,box.y+y*box.height/720,{button});};
  for(const offset of [-12,-20,0]){await mouse(worker.screenPos.x,worker.screenPos.y+offset);await new Promise(r=>setTimeout(r,1000));report.selection=await rpc('querySelection');if(report.selection.result?.selected?.some(o=>o.id===worker.id))break;}
  if(!report.selection.result?.selected?.some(o=>o.id===worker.id))throw Error('Mouse did not select the intended builder');
  await mouse(worker.screenPos.x+70,worker.screenPos.y+60,'right');
  report.moved=await wait('Worker displacement',()=>rpc('queryDrawables'),r=>{const o=r.drawables?.drawables?.find(o=>o.id===worker.id);return o&&Math.hypot(o.worldPos.x-worker.worldPos.x,o.worldPos.y-worker.worldPos.y)>20},45000);
  report.checks.push('Real mouse selection and right-click movement displaced the builder by more than 20 world units');
  report.stage='Constructing a barracks';
  const world=(await rpc('agentWorldSnapshot',{includeCapabilities:true})).result;
  const builder=world.objects.find(o=>world.templates[o.template]?.categories?.includes('builder')&&o.owner===world.localPlayerIndex);
  const command=(world.commandSets[world.objectCapabilities[builder.id].commandSet]||[]).find(c=>c.product?.categories?.includes('barracks'));
  const result=await rpc('agentGameCommand',{sourceId:builder.id,command:command.name,hasPosition:true,x:(builder.position.x??builder.position[0])-160,y:(builder.position.y??builder.position[1])-130,angle:0});
  if(!result.ok)throw Error('Original construction command rejected: '+JSON.stringify(result.result));
  report.buildCommand=result;
  const built=await wait('Completed barracks',()=>rpc('agentWorldSnapshot'),r=>r.result?.objects.some(o=>o.template===command.product.template&&!o.status?.includes('underConstruction')&&(o.construction===-1||o.construction>=100)),300000);
  report.completedBuilding=built.result.objects.find(o=>o.template===command.product.template);
  report.checks.push('A barracks completed through the original engine construction command, spending player resources');
  await capture('solo-construction');
  report.stage='Clean exit and relaunch';await page.locator('#exitGame').click();await page.locator('#gameView').waitFor({state:'hidden',timeout:45000});await page.locator('#solo').click();await page.waitForFunction(()=>{const w=document.getElementById('gameFrame').contentWindow;return !!w?.CnCPort?.rpc&&w.document.getElementById('loading')?.hidden===true},null,{timeout:120000});report.checks.push('Clean save/shutdown and relaunch using retained installation');
  report.status='passed';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;if(game){report.failedSelection=await rpc('querySelection').catch(()=>null);await capture('solo-failure').catch(()=>{});}}
 finally{clearInterval(timer);await fs.writeFile('.local/solo-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks,errors:report.errors,missing:report.missing},null,2));await ctx.close();}
})();
