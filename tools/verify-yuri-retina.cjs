// Real runtime; DPR emulation verifies presentation work, not Mac hardware speed.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
const site=process.env.YURI_SITE_URL||'http://localhost:8093/';
runBrowserTest(async()=>{
 const report={site,checks:[],errors:[],scope:'Native Windows Chrome menu with a desktop DPR 2 viewport; no Mac speed claim'};
 const ctx=await launchTestContext(chromium,'yuri-retina',{channel:'chrome',headless:true,viewport:{width:1100,height:760},deviceScaleFactor:2,args:['--enable-unsafe-swiftshader']});
 const page=ctx.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.goto(new URL('yuri/',site).href);await page.waitForFunction(()=>crossOriginIsolated&&typeof document.getElementById('nameForm')?.onsubmit==='function'&&!document.querySelector('#nameForm button').disabled);
  const defaults=await page.evaluate(async()=>{const p=await import('../preferences.mjs');localStorage.setItem('zhweb-graphics','ps11');return {yuri:p.loadPreferences('yuri'),zero:p.loadPreferences('zero-hour'),coarse:matchMedia('(pointer: coarse)').matches}});
  assert.equal(defaults.coarse,false);assert.equal(defaults.yuri.resolution,'800x600');assert.equal(defaults.yuri.graphics,'ff');assert.equal(defaults.zero.resolution,'1280x720');assert.equal(defaults.zero.graphics,'ps11');report.checks.push('Desktop Yuri gets lighter defaults without inheriting legacy Zero Hour effects');
  await page.locator('#name').fill('RetinaTest');await page.locator('#nameForm button').click();await page.locator('#setup').waitFor({state:'visible'});
  await page.locator('#folderInput').setInputFiles(process.env.YURI_GAME_DIR||'.local/personal-game-files/Yuri-Revenge-Web-no-movies');await page.locator('#lobby').waitFor({timeout:180000});
  await page.locator('#openSettings').click();await page.locator('#resolution').selectOption('1600x900');await page.locator('#graphics').selectOption('ps11');await page.locator('#yuriLighterSettings').click();
  assert.equal(await page.locator('#resolution').inputValue(),'800x600');assert.equal(await page.locator('#scaling').inputValue(),'actual');assert.equal(await page.locator('#graphics').inputValue(),'ff');await page.locator('#closeSettings').click();await page.reload();await page.locator('#lobby').waitFor();
  await page.locator('#solo').click();await page.locator('#gameView').waitFor({state:'visible'});const native=page.frameLocator('#gameFrame').frameLocator('#runtime');
  await native.locator('#screen').waitFor({timeout:120000});await native.locator('#screen').evaluate(canvas=>new Promise((resolve,reject)=>{const end=Date.now()+120000;const timer=setInterval(()=>{if(/mainmenu/i.test(canvas.dataset.shellPage||'')){clearInterval(timer);resolve()}else if(Date.now()>end){clearInterval(timer);reject(Error('Native menu did not render'))}},250)}));
  const snapshot=()=>native.locator('#screen').evaluate(canvas=>({ratio:devicePixelRatio,buffer:[canvas.width,canvas.height],display:[canvas.clientWidth,canvas.clientHeight],url:location.href,debug:canvas.dataset.vmBatch}));
  report.after=await snapshot();assert.equal(report.after.ratio,1);assert.ok(report.after.buffer[0]<=800&&report.after.buffer[1]<=600);assert.equal(report.after.debug,undefined);report.checks.push('Saved lighter preset launches the actual native menu within 800x600 on a desktop DPR 2 screen');
  if(await page.locator('#revealToolbar').isVisible())await page.locator('#revealToolbar').click();
  const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#diagnostics').click()]);const data=JSON.parse(await fs.readFile(await file.path(),'utf8'));report.diagnostics=data.engine.state;
  assert.equal(report.diagnostics.physicalRatio,2);assert.equal(report.diagnostics.presentationRatio,1);assert.ok(report.diagnostics.renderer.includes('WebGL2'));assert.equal(typeof report.diagnostics.softwareRenderer,'boolean');assert.equal(report.diagnostics.effects,'off');assert.equal(report.diagnostics.upscale,'off');assert.ok(report.diagnostics.hardwareConcurrency>0);report.checks.push('On-demand diagnostics include actual renderer, buffers, effects and physical/presentation ratios');
  // Compare only the display ratio in the same original engine and same viewport.
  const runtime=page.frames().find(f=>f.url().includes('/yuri/runtime.html?'));const original=new URL(runtime.url());original.searchParams.delete('display-ratio');await runtime.goto(original.href);
  await native.locator('#screen').evaluate(canvas=>new Promise((resolve,reject)=>{const end=Date.now()+120000;const timer=setInterval(()=>{if(/mainmenu/i.test(canvas.dataset.shellPage||'')){clearInterval(timer);resolve()}else if(Date.now()>end){clearInterval(timer);reject(Error('Comparison menu did not render'))}},250)}));
  report.withoutCap=await snapshot();assert.equal(report.withoutCap.ratio,2);assert.deepEqual(report.after.display,report.withoutCap.display);assert.ok(report.withoutCap.buffer[0]*report.withoutCap.buffer[1]>report.after.buffer[0]*report.after.buffer[1]);report.checks.push('Identical native menu and display size use fewer backing pixels with the ratio cap');
  assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1}
 finally{await ctx.close();await fs.writeFile('.local/yuri-retina-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
});
