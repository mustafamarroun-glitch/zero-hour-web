// Configuration-only check; a tiny intercepted runtime avoids claiming gameplay.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
runBrowserTest(async()=>{
 const ctx=await launchTestContext(chromium,'yuri-relay-config',{channel:'chrome',headless:true});
 try{
  await ctx.route('**/yuri/runtime.html*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="screen"></canvas>'}));
  const page=ctx.pages()[0]||await ctx.newPage(),code='a'.repeat(24);
  const check=async expected=>{await page.goto('http://localhost:8093/yuri/play.html?session='+code);await page.waitForFunction(()=>document.getElementById('runtime').src.includes('network=1'));const url=new URL(await page.locator('#runtime').getAttribute('src'));assert.equal(url.searchParams.get('relay'),expected)};
  await check('ws://localhost:8093/yuri-'+code);
  await ctx.route('**/network-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({rooms:'wss://preview.example/rooms',yuriRelay:'wss://preview.example'})}));
  await check('wss://preview.example/yuri-'+code);
  console.log('Passed: relative local and explicit public WSS Yuri routing. Configuration only, intercepted runtime.');
 }finally{await ctx.close()}
});
