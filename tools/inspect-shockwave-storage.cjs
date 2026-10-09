const {chromium}=require('playwright'),fs=require('node:fs/promises');
const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
runBrowserTest(async()=>{
 const context=await launchTestContext(chromium,'shockwave-storage',{channel:'chrome',headless:true});
 try{
  const page=context.pages()[0];await page.goto('http://localhost:8093/shockwave/');await page.waitForFunction(()=>window.ShockwaveAssetLibrary);
  const report=await page.evaluate(async()=>({installation:window.ShockwaveAssetLibrary.installedLibrary(),inventory:await window.ShockwaveAssetLibrary.managedStorageInventory(),error:window.ShockwaveAssetLibrary.lastValidationError,quota:await navigator.storage.estimate()}));
  await fs.writeFile('.local/shockwave/test-storage-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify({root:report.installation?.root,inventory:report.inventory,error:report.error,quota:report.quota},null,2));
 }finally{await context.close()}
});
