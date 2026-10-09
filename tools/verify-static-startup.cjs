// Replay a static host's header-free first navigation using the actual local UI.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
runBrowserTest(async()=>{
 const results=[];
 for(const routePath of ['yuri/','shockwave/','zero-hour.html']){
  const ctx=await launchTestContext(chromium,'static-startup',{channel:'chrome',headless:true}),events=[];
  try{
   await ctx.exposeFunction('recordStartupState',value=>events.push(value));
   await ctx.addInitScript(()=>{
    window.recordStartupState({event:'document',isolated:crossOriginIsolated,url:location.href});
    const observer=new MutationObserver(()=>{const button=document.querySelector('#nameForm button');if(button&&!button.disabled)window.recordStartupState({event:'ready',isolated:crossOriginIsolated,url:location.href})});
    observer.observe(document,{subtree:true,attributes:true,attributeFilter:['disabled']});
   });
   const url='http://localhost:8093/'+routePath;
   await ctx.route(url,async route=>{
    const response=await route.fetch(),headers={...response.headers()};
    delete headers['cross-origin-opener-policy'];delete headers['cross-origin-embedder-policy'];delete headers['cross-origin-resource-policy'];
    await route.fulfill({response,headers});
   },{times:1});
   const page=ctx.pages()[0];await page.goto(url);
   await page.waitForFunction(()=>crossOriginIsolated&&typeof document.getElementById('nameForm')?.onsubmit==='function'&&!document.querySelector('#nameForm button').disabled);
   await page.locator('#name').fill('StartupTest');await page.locator('#nameForm button').click();await page.locator('#setup').waitFor();
   assert.equal(await page.locator('#commander').textContent(),'StartupTest');assert.ok(events.some(value=>value.event==='document'&&!value.isolated),'The first navigation actually lacks isolation');assert.ok(events.some(value=>value.event==='ready'));assert.ok(events.filter(value=>value.event==='ready').every(value=>value.isolated),'No form is enabled in the document awaiting replacement');
   results.push({routePath,events,status:'passed'});
  }finally{await ctx.close()}
 }
 await fs.writeFile('.local/static-startup-verification.json',JSON.stringify(results,null,2));console.log('Passed: all three launchers defer forms until the static-host isolation reload completes and preserve the submitted commander.');
});
