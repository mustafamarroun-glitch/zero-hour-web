const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
runBrowserTest(async()=>{
 await fs.mkdir('.local',{recursive:true});await fs.mkdir('output/playwright',{recursive:true});
 const report={started:new Date().toISOString(),checks:[],errors:[],network:[],scope:'Fresh Windows browser profile; real user-owned archives; no source-project browser storage'};
 const context=await launchTestContext(chromium,path.resolve('.local/acceptance-browser'),{channel:'chrome',headless:true,viewport:{width:1440,height:900},args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('requestfailed',r=>report.network.push({url:r.url(),error:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text().slice(0,300))});
 const timer=setInterval(async()=>console.log('STAGE',report.stage,await page.frameLocator('#gameFrame').locator('#status').textContent({timeout:500}).catch(()=>'')),20000);
 try{
  report.browser=await context.browser().version();report.userAgent=await page.evaluate(()=>navigator.userAgent);
  await page.goto('http://localhost:8093/');
  report.stage='Commander entry';
  if(await page.locator('#entry').isVisible()){await page.locator('#name').fill('FieldTest');await page.locator('#nameForm button').click();}
  await page.waitForTimeout(1500);
  if(await page.locator('#setup').isVisible()){
   report.stage='Real folder import';await page.locator('#folderInput').setInputFiles('C:\\Program Files (x86)\\DODI-Repacks\\Generals Zero Hour\\Data');
   await page.locator('#lobby').waitFor({state:'visible',timeout:240000});report.checks.push('Real folder fallback imports validated combined archives into OPFS');
  }
  await page.screenshot({path:'output/playwright/lobby-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/lobby-mobile.png'});await page.setViewportSize({width:1440,height:900});
  report.library=await page.evaluate(()=>window.ZeroHAssetLibrary.summary());
  await page.reload();await page.locator('#lobby').waitFor({state:'visible',timeout:30000});report.checks.push('Username and installed library restore after reload');
  report.stage='Engine boot';await page.locator('#solo').click();
  await page.waitForFunction(()=>{const w=document.getElementById('gameFrame').contentWindow;return !!w?.CnCPort?.rpc&&w.document.getElementById('loading')?.hidden===true},null,{timeout:180000});
  const game=page.frames().find(f=>f.url().includes('/harness/game.html'));
  report.init=await game.evaluate(()=>window.CnCPort.rpc('threadedStatus'));
  report.checks.push('Actual compiled threaded engine initialized');
  report.stage='Native menu inspection';
  await page.waitForTimeout(2000);
  report.menu=await game.evaluate(()=>window.CnCPort.rpc('realEngineFrame',{frames:1}));
  await fs.writeFile('.local/menu-state.json',JSON.stringify(report.menu,null,2));
  const shot=await game.evaluate(()=>window.CnCPort.rpc('screenshot'));
  if(shot.screenshot?.dataUrl){await fs.writeFile('output/playwright/native-menu.png',Buffer.from(shot.screenshot.dataUrl.split(',')[1],'base64'));report.checks.push('Worker-rendered native graphics captured');}
  report.status='foundation boot passed; gameplay checks continue separately';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}
 finally{clearInterval(timer);await fs.writeFile('.local/browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks,errors:report.errors,network:report.network},null,2));await context.close();}
});
