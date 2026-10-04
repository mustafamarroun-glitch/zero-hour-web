const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
// End-to-end local recovery verification; retail output stays in ignored .local.
const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');
runBrowserTest(async()=>{
 const report={checks:[],errors:[],scope:'Actual 17-archive browser installation; private ZIP download, cancellation and byte comparison required'};let context;
 try{
  await fs.mkdir('.local/backup',{recursive:true});
  context=await launchTestContext(chromium,path.resolve('.local/acceptance-browser'),{channel:'chrome',headless:true,acceptDownloads:true});const page=context.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://localhost:8093/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof document.getElementById('nameForm')?.onsubmit==='function');if(await page.locator('#entry').isVisible()){await page.locator('#name').fill('BackupTest');await page.locator('#nameForm button').click();}if(await page.locator('#setup').isVisible()){await page.locator('#folderInput').setInputFiles('.local/packaging/Zero-Hour-Browser-English');await page.locator('#lobby').waitFor({state:'visible',timeout:240000});}await page.locator('#lobby').waitFor({state:'visible',timeout:45000});await page.locator('#lobby details summary').click();
  await page.locator('#exportLibrary').click();await page.locator('#cancelBackup').waitFor({state:'visible'});await page.locator('#cancelBackup').click();await page.waitForFunction(()=>!document.getElementById('exportLibrary').disabled);if(await page.locator('#saveZip').isVisible())throw Error('Cancelled backup produced a download');report.checks.push('Cancellation returns control without exposing an incomplete ZIP');
  await page.locator('#exportLibrary').click();await page.locator('#saveZip').waitFor({state:'visible',timeout:300000});
  const pending=page.waitForEvent('download',{timeout:45000});await page.locator('#saveZip').click();const download=await pending;await download.saveAs(path.resolve('.local/backup/Zero-Hour-backup.zip'));if(await download.failure())throw Error(await download.failure());
  report.bytes=(await fs.stat('.local/backup/Zero-Hour-backup.zip')).size;report.checks.push('Full-size local ZIP prepared and saved through the real website controls');report.status='download passed; independent byte comparison follows';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}finally{if(context)await context.close();await fs.writeFile('.local/backup-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
});
