// Landing and game-entry regression checks. No retail files or engine launch.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=path.resolve(process.env.SITE_ROOT||'public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/zero-hour-web/'))throw Error('Outside fixture');
  let file=path.resolve(root,'.'+url.pathname.slice('/zero-hour-web'.length));
  if(file!==root&&!file.startsWith(root+path.sep))throw Error('Outside fixture');
  if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
  const type={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const checks=[],errors=[];
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  await fs.mkdir('.impeccable/review',{recursive:true});
  for(const base of [process.env.ZH_SITE_URL||'http://localhost:8093/',`http://localhost:${server.address().port}/zero-hour-web/`]){
   const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
   try{
    await page.goto(base);await page.getByRole('heading',{name:'Choose your battlefield.'}).waitFor();
    assert.equal(await page.locator('#nameForm').count(),0);
    assert.equal(await page.locator('iframe').count(),0);
    assert.ok(!requests.some(url=>/\/(app\.mjs|isolation\.mjs)|\.wasm(?:\?|$)/.test(url)),'Landing loads no game modules');
    await page.evaluate(()=>{
     localStorage.setItem('zero-hour-web-v1:zhweb-identity-v1',JSON.stringify({name:'LandingTest',guest:'landing-test'}));
     localStorage.setItem('zero-hour-web-v1:zhweb-settings-v2',JSON.stringify({dark:true,resolution:'1600x900',music:17}));
     localStorage.setItem('unrelated-site-data','preserved');
    });
    await page.reload();await page.getByRole('heading',{name:'Choose your battlefield.'}).waitFor();
    assert.equal(await page.locator('#nameForm').count(),0,'Saved identity still opens landing');
    await page.locator('#landingTheme').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('zero-hour-web-v1:zhweb-settings-v2')).resolution),'1600x900');
    await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.locator('#landingTheme').click();
    // Malformed settings must not make theme changes impossible to save.
    await page.evaluate(()=>localStorage.setItem('zero-hour-web-v1:zhweb-settings-v2','broken json'));
    await page.reload();await page.locator('#landingTheme').click();await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.evaluate(()=>localStorage.setItem('zero-hour-web-v1:zhweb-settings-v2',JSON.stringify({dark:true,resolution:'1600x900',music:17})));
    await page.reload();
    const anotherTab=await context.newPage();await anotherTab.goto(base);
    await page.locator('#landingTheme').click();await anotherTab.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await anotherTab.close();await page.locator('#landingTheme').click();
    await page.goto(base+'?keyboard=1');await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'games');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Play ZeroHour');
    await page.goto(base);
    for(const width of [1440,1024,850,768,390,320]){
     await page.setViewportSize({width,height:900});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No overflow at '+width);
     const smallTargets=await page.locator('header a,header button,footer a').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent.trim()));
     assert.deepEqual(smallTargets,[],'44px navigation targets at '+width);
     if(width===1440||width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.impeccable/review/landing-'+(width===1440?'desktop':'mobile')+'.png',fullPage:true});}
    }
    await page.setViewportSize({width:320,height:900});
    await page.evaluate(()=>{const sizes=[...document.querySelectorAll('body *')].map(element=>[element,parseFloat(getComputedStyle(element).fontSize)]);for(const [element,size] of sizes)element.style.fontSize=(size*2)+'px';});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Text at 200% reflows at 320px');
    await page.reload();await page.setViewportSize({width:1440,height:900});await page.locator('#landingTheme').click();
    await page.screenshot({path:'.impeccable/review/landing-light-desktop.png',fullPage:true});
    await page.getByRole('link',{name:'Play ZeroHour',exact:true}).click();await page.locator('#setup').waitFor({timeout:45000});
    assert.ok(page.url().endsWith('/zero-hour.html'));assert.equal(await page.locator('#commander').textContent(),'LandingTest');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.locator('#resolution').inputValue(),'1600x900');assert.equal(await page.locator('#music').inputValue(),'17');
    await page.locator('.wordmark').click();await page.getByRole('heading',{name:'Choose your battlefield.'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-site-data')),'preserved');
    for(const [label,route] of [['Play Yuri’s Revenge','yuri/'],['Play ShockWave','shockwave/']]){
     await page.getByRole('link',{name:label,exact:true}).click();
     await page.waitForFunction(()=>typeof document.getElementById('nameForm')?.onsubmit==='function');
     if(await page.locator('#entry').isVisible()){await page.locator('#name').fill('LandingTest');await page.locator('#nameForm button').click();}
     await page.locator('#setup').waitFor({timeout:45000});
     assert.ok(page.url().endsWith(route));assert.equal(await page.locator('.game-selector [aria-current="page"]').count(),1);
     assert.equal(await page.locator('.game-selector a').filter({hasText:/^ZeroHour$/}).getAttribute('href'),'../zero-hour.html');
     await page.locator('.wordmark').click();await page.getByRole('heading',{name:'Choose your battlefield.'}).waitFor();
    }
    await page.getByRole('link',{name:'Stream game',exact:true}).click();assert.ok(page.url().includes('/stream/'));
    assert.equal(await page.locator('.game-selector a').filter({hasText:/^ZeroHour$/}).getAttribute('href'),'../zero-hour.html');
    await page.locator('.wordmark').click();await page.getByRole('heading',{name:'Choose your battlefield.'}).waitFor();
    await context.clearCookies();await page.evaluate(()=>localStorage.removeItem('zero-hour-web-v1:zhweb-identity-v1'));
    await page.goto(base+'?room=ABC123&keep=yes#invite');await page.locator('#nameForm').waitFor({timeout:45000});
    const invite=new URL(page.url());assert.ok(invite.pathname.endsWith('/zero-hour.html'));assert.equal(invite.search,'?room=ABC123&keep=yes');assert.equal(invite.hash,'#invite');
    checks.push({base,status:'passed',checks:'Landing for returning users; no game modules; four entry routes; responsive 320–1440; 200% text; 44px targets; keyboard skip link; malformed settings recovery; cross-tab themes; no-JS landing; preferences and legacy invites; headerless repository subpath'});
   }finally{await context.close();}
  }
  const noJS=await browser.newContext({javaScriptEnabled:false});const staticPage=await noJS.newPage();await staticPage.goto(process.env.ZH_SITE_URL||'http://localhost:8093/');
  assert.equal(await staticPage.locator('#landingTheme').isVisible(),false,'No dead theme control without JavaScript');
  assert.equal(await staticPage.getByRole('link',{name:'Play ZeroHour',exact:true}).isVisible(),true);await noJS.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,errors},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
