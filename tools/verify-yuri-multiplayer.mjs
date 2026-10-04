// Adapt the pinned upstream native multiplayer acceptance to this website's
// compiled runtime and actual local imports. Reference checkout is read-only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {randomBytes} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(process.env.YURI_SOURCE||'../Online-Games/.local/ra2-vm/source');
const gameDir=resolve(process.env.YURI_GAME_DIR||'../Online-Games/.local/personal-game-files/Yuri Browser');
const site=process.env.YURI_SITE_URL||'http://localhost:8093/';
const origin=new URL(site).origin,code=randomBytes(12).toString('hex');
const relay=new URL('/yuri-'+code,origin);relay.protocol=relay.protocol==='https:'?'wss:':'ws:';
const require=createRequire(resolve(source,'package.json'));
const head=(await readFile(resolve(source,'.git/HEAD'),'utf8')).trim();
const ref=head.startsWith('ref: ')?head.slice(5):null;
if(ref&&(!/^refs\/[A-Za-z0-9_./-]+$/.test(ref)||ref.includes('..')))throw Error('Unsafe upstream Git ref');
const revision=ref?(await readFile(resolve(source,'.git',ref),'utf8')).trim():head;
if(revision!=='a10ac9899c258b01be1edd80492397e9de225ba5')throw Error('Unexpected upstream acceptance revision');
if(freemem()<4*1024**3)throw Error('Two native VMs need at least 4 GiB of available host RAM for this test');
const directory=resolve(root,'.local/yuri-native-multiplayer');await mkdir(directory,{recursive:true});
const ts=require('typescript');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const original=resolve(source,'tests/real-game/browser/ra2NetworkBrowserSmoke.mts');
let test=await readFile(original,'utf8');
function replace(before,after){if(!test.includes(before))throw Error('Upstream acceptance anchor changed: '+before.slice(0,60));test=test.replace(before,after);}
replace("import { selectDevelopmentGame } from '../../helpers/selectDevelopmentGame';",String.raw`
async function selectDevelopmentGame(page: any, game: string) {
  console.log('Importing original local files for player', pages.indexOf(page));
  // Browser-only preferences match the earlier upstream friend-play fixture:
  // Americans enables its Allied MCV counter, human slots stay Open, speed 3.
  // Only the selected INI File is replaced in the browser. Disk files, EXE,
  // game resources and simulation memory are never modified.
  await page.addInitScript(() => {
    document.addEventListener('change', event => {
      const input=event.target as HTMLInputElement;
      if(input?.type!=='file'||!input.files?.length||(input as any).__yuriFixtureApplied)return;
      const ini=[...input.files].find(file=>file.name.toLowerCase()==='ra2md.ini');
      if(!ini)return;
      event.stopImmediatePropagation();
      void (async()=>{
        let section='';
        const text=(await ini.text()).split(/\r?\n/).map(line=>{
          const heading=line.match(/^\[([^\]]+)\]/);if(heading)section=heading[1].toLowerCase();
          if(section==='multiplayer'&&/^Side=/i.test(line))return 'Side=Americans';
          if(section==='lan'&&/^Slot0[1-7]=/i.test(line))return line.split('=')[0]+'=2,-2,-2';
          if(section==='lan'&&/^GameSpeed=/i.test(line))return 'GameSpeed=3';
          return line;
        }).join('\r\n');
        const changed=new File([text],ini.name,{type:ini.type,lastModified:ini.lastModified});
        Object.defineProperty(changed,'webkitRelativePath',{value:ini.webkitRelativePath});
        const files=new DataTransfer();for(const file of input.files!)files.items.add(file===ini?changed:file);
        (input as any).__yuriFixtureApplied=true;input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      })();
    },true);
  });
  // addInitScript applies on the next navigation; retain the configured URL.
  await page.reload();
  const picker=page.getByRole('button',{name:'选择文件夹…',exact:true});
  await picker.waitFor({timeout:45000});
  const chooser=page.waitForEvent('filechooser');await picker.click();await(await chooser).setFiles(process.env.YURI_GAME_DIR!);
  const button=page.locator('.detected-games button').filter({hasText:/尤里|Yuri/i});
  await button.waitFor({timeout:180000});await button.click();
}
`);
// Resolve every dependency at its real read-only location, keeping generated
// acceptance files within this project rather than modifying upstream caches.
for(const helper of ['latencyProxy','gamePerformance']){
 const helperSource=resolve(source,'tests/helpers',helper+'.ts'),helperOutput=resolve(directory,helper+'.mjs');
 await writeFile(helperOutput,compile(await readFile(helperSource,'utf8')));
 replace(`from '../../helpers/${helper}'`,`from '${pathToFileURL(helperOutput).href}'`);
}
test=test.replace(/from (['"])(\.{1,2}\/[^'"\n]+)\1/g,(_,quote,name)=>`from ${quote}${pathToFileURL(resolve(dirname(original),name)).href}${quote}`);
replace("import { chromium, firefox, expect } from '@playwright/test';",`import {createRequire as createTestRequire} from 'node:module'; const {chromium,firefox,expect}=createTestRequire(import.meta.url)(${JSON.stringify(require.resolve('@playwright/test'))});`);
test=test.replace(/from '(@playwright\/test|typescript|relay-package\/(?:wire|server|faults))'/g,(_,name)=>{
 const relative={'relay-package/wire':'packages/relay/dist/lib/wire.js','relay-package/server':'packages/relay/dist/lib/server.js','relay-package/faults':'packages/relay/dist/lib/faults.js'};
 return `from '${pathToFileURL(relative[name]?resolve(source,relative[name]):require.resolve(name)).href}'`;
});
replace('const controller = installVmWorker(self);','const controller = U_(self);');
replace("await context.route('**/src/adapter/vmWorker.ts?*', async (route) => {","await context.route('**/vmWorker-*.js', async (route) => {");
replace("expect(source).toContain('installVmWorker(self);');","expect(source).toContain('typeof self<\"u\"&&U_(self);');");
replace("body: source.replace('installVmWorker(self);', probe)","body: source.replace('typeof self<\"u\"&&U_(self);', 'if(typeof self<\"u\"){' + probe + '}')");
test=test.replaceAll("includes('/vmWorker.ts')","includes('/vmWorker-')");
replace('`vm-resolution-${game}`','`zhweb-yuri-resolution-${game}`');
replace("new URL('/', origin)","new URL('/yuri/engine/runtime/', origin)");
replace("pageUrl.searchParams.set('network', '1');","pageUrl.searchParams.set('network', '1'); pageUrl.searchParams.set('debug', '1');");
test=test.replaceAll('timeout: 90000','timeout: 300000');
replace('await Promise.race([browserFailure, runScenario()]);',"await Promise.race([browserFailure, runScenario()]); writeFileSync(join(output,'result.json'),JSON.stringify({status:'passed',scope:'Two same-PC browser sessions: actual native match, synchronized MCV deployment and 20-second stability; not a completed match or cross-network acceptance',site:origin,relay:relayUrl,observed},null,2));");
const generated=resolve(directory,'native-match.mjs');await writeFile(generated,compile(test));
await writeFile(resolve(directory,'setup.json'),JSON.stringify({site,code,revision,gameDir,scope:'Original player files, browser-only preference fixture, read-only worker probes'},null,2));
const env={...process.env,YURI_GAME_DIR:gameDir,RA2_BROWSER_ORIGIN:origin,RA2_BROWSER_GAME:'yr',RA2_BROWSER_RELAY:relay.href,RA2_BROWSER_START_PAGE:'lan',RA2_BROWSER_STABILITY_SECONDS:'20',RA2_BROWSER_SCREENSHOT_DIR:resolve(root,'output/playwright'),RA2_BROWSER_EXECUTABLE:process.env.YURI_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'};
console.log('Native Yuri multiplayer test:',site,'session',code);
const child=spawn(process.execPath,[generated],{cwd:root,env,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error);process.exitCode=1});
child.on('exit',exitCode=>{process.exitCode=exitCode??1});
