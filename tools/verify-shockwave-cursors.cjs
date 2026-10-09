const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
runBrowserTest(async()=>{
 const report={checks:[],errors:[],scope:'Isolated Windows Chrome profile; original ANI artwork and actual ShockWave battlefield.'};
 const context=await launchTestContext(chromium,'shockwave-cursors',{channel:'chrome',headless:true,viewport:{width:1440,height:900}});
 const page=context.pages()[0]||await context.newPage();let game;
 page.on('pageerror',e=>report.errors.push(e.message));
 const timer=setInterval(()=>console.log('CURSORS',report.stage),20000);
 const rpc=(c,p={})=>game.evaluate(([c,p])=>Promise.race([window.CnCPort.rpc(c,p),new Promise((_,reject)=>setTimeout(()=>reject(Error(c+' timed out')),20000))]),[c,p]);
 const wait=async(label,fn,test,timeout=180000)=>{let value;const end=Date.now()+timeout;while(Date.now()<end){value=await fn();if(test(value))return value;await page.waitForTimeout(500)}throw Error(label+' timed out: '+JSON.stringify(value).slice(0,1500))};
 const library=()=>page.evaluate(()=>({installation:window.ShockwaveAssetLibrary.installedLibrary(),summary:window.ShockwaveAssetLibrary.summary(),settings:localStorage.getItem('zhweb-settings-v2')}));
 try{
  report.stage='Restore retained installation';await page.goto('http://localhost:8093/shockwave/');await page.locator('#lobby').waitFor({state:'visible',timeout:180000});
  report.before=await library();assert.equal(report.before.installation.archives.length,28);
  report.stage='Reject malformed artwork';await page.locator('#libraryDetails summary').click();await page.locator('#replaceLibrary').click();
  await page.locator('#fileInput').setInputFiles({name:'SCCPointer.ani',mimeType:'application/octet-stream',buffer:Buffer.alloc(12)});
  await page.locator('#error').waitFor({state:'visible'});assert.equal((await library()).installation.root,report.before.installation.root);
  report.checks.push('Invalid cursor file rejected without replacing the installation');
  const folder=path.resolve('.local/shockwave/player-files/Data/Cursors');
  const files=(await fs.readdir(folder)).filter(n=>/\.ani$/i.test(n)).map(n=>path.join(folder,n));assert.equal(files.length,52);
  report.stage='Cursor-only import';await page.locator('#fileInput').setInputFiles(files);await page.locator('#lobby').waitFor({state:'visible',timeout:180000});
  report.after=await library();assert.equal(report.after.summary.originalCursors,true);assert.equal(report.after.installation.cursorAsset.entryCount,52);
  assert.equal(report.after.installation.root,report.before.installation.root);assert.deepEqual(report.after.installation.archives,report.before.installation.archives);
  assert.equal(report.after.installation.shockwave.contentHash,report.before.installation.shockwave.contentHash);assert.equal(report.after.settings,report.before.settings);
  report.checks.push('52 animations added in place; archive paths, multiplayer content identity and settings unchanged');
  report.stage='Native engine cursor and save persistence';await page.locator('#solo').click();
  await page.waitForFunction(()=>document.getElementById('gameFrame').contentWindow?.document.getElementById('loading')?.hidden===true,null,{timeout:240000});
  game=page.frames().find(f=>f.url().includes('/harness/game.html'));report.saves=await rpc('listSaves');assert.ok(report.saves.files.some(f=>f.size>1000));
  await wait('Skirmish options',()=>rpc('queryWindowByName',{name:'SkirmishGameOptionsMenu.wnd:ButtonStart'}),v=>v.result?.clickable);
  await rpc('realEngineSetSkirmishLocalTemplate',{templateName:'FactionChinaSpecialWeaponsGeneral'});
  const maps=await rpc('mapCacheProbe'),map=maps.probe.officialMultiplayerMaps.find(m=>/alpine/i.test(m.key));assert.ok(map);
  await rpc('realEngineSetSkirmishMap',{mapName:map.key});await rpc('clickWindowByName',{name:'SkirmishGameOptionsMenu.wnd:ButtonStart'});
  report.stage='Battlefield cursor';await wait('Battlefield',()=>rpc('realEngineFrame',{frames:1}),v=>v.frame?.clientState?.gameplay?.inGame&&!v.frame.clientState.gameplay.loadingMap&&v.frame.clientState.gameplay.objectCount>0);
  const canvas=game.locator('#viewport'),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);
  report.cursor=await wait('Original animated cursor',()=>game.evaluate(()=>({cursor:window.CnCPort.state.browserCursor,input:window.CnCPort.state.browserInput,css:document.querySelector('#viewport').style.cursor})),v=>v.cursor?.source==='game_ani_cursor_css'&&v.css.startsWith('url('),30000);
  assert.equal(report.cursor.cursor.assetSource,'browser_library_cursor_pack');assert.equal(report.cursor.cursor.cursorFile,report.cursor.input.cursorFile);
  if(report.cursor.cursor.frameCount>1)await wait('Cursor animation advances',()=>game.evaluate(()=>window.CnCPort.state.browserCursor),v=>v.cursorFile===report.cursor.cursor.cursorFile&&v.frame!==report.cursor.cursor.frame,10000);
  report.checks.push('Real ShockWave battlefield uses original ANI animation with the engine cursor filename and hotspot; native save remains mounted');
  await game.locator('#viewport').press('F8');if(!await page.locator('#exitGame').isVisible())await page.locator('#revealToolbar').click();await page.locator('#exitGame').click();if(await page.locator('#confirmAction').isVisible())await page.locator('#confirmProceed').click();await page.locator('#gameView').waitFor({state:'hidden',timeout:60000});
  await page.reload();await page.locator('#lobby').waitFor({state:'visible',timeout:180000});assert.equal((await library()).summary.originalCursors,true);
  assert.equal(report.errors.length,0);report.checks.push('Original artwork persists after clean exit and reload');report.status='passed';
 }catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;report.siteError=await page.locator('#error').textContent().catch(()=>null);report.cursor=game?await game.evaluate(()=>({cursor:window.CnCPort.state.browserCursor,input:window.CnCPort.state.browserInput})).catch(()=>null):null;}
 finally{clearInterval(timer);await fs.writeFile('.local/shockwave/cursor-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,failure:report.failure,cursor:report.cursor},null,2));await context.close()}
});
