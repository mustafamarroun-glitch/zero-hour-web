const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');const http=require('node:http');
(async()=>{
 const report={errors:[],missing:[],scope:'Fresh Chrome profile, headerless static host, /zero-hour-web/ repository subpath'};
 const server=http.createServer(async(req,res)=>{try{let file=path.resolve('public','.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/^\/zero-hour-web/,'')));const root=path.resolve('public');if(!file.startsWith(root+path.sep)&&file!==root)throw Error('Forbidden');if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(8094,'127.0.0.1',r));let context;
 try{
  context=await chromium.launchPersistentContext(path.resolve('.local/pages-isolation-profile'),{channel:'chrome',headless:true});const page=context.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()===404)report.missing.push(r.url())});
  const initial=await page.goto('http://localhost:8094/zero-hour-web/');report.initialHeaders=initial.headers();
  await page.waitForFunction(()=>crossOriginIsolated&&navigator.serviceWorker.controller,null,{timeout:45000});await page.locator('#entry').waitFor({state:'visible'});
  report.isolation=await page.evaluate(()=>({isolated:crossOriginIsolated,sharedMemory:typeof SharedArrayBuffer==='function',scope:navigator.serviceWorker.controller.scriptURL}));
  await page.locator('#name').fill('PagesTest');await page.locator('#nameForm button').click();await page.locator('#setup').waitFor({state:'visible'});await page.reload();await page.locator('#setup').waitFor({state:'visible'});
  report.restoredName=await page.locator('#commander').textContent();if(report.restoredName!=='PagesTest'||report.errors.length||report.missing.length)throw Error('Isolation or relative loading failed');report.status='passed';
 }catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}finally{await fs.writeFile('.local/pages-isolation-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(context)await context.close();await new Promise(r=>server.close(r));}
})();
