import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {syncLaunchers} from './sync-launchers.mjs';
import {syncYuriPlayer} from './sync-yuri-player.mjs';
import {PROFILES} from '../public/game-profiles.mjs';
import {SHOCKWAVE_ARCHIVES,SHOCKWAVE_VERSION,SHOCKWAVE_RUNTIME} from '../public/shockwave/package.mjs';
await syncLaunchers({check:true});
await syncYuriPlayer({check:true});
const shockwaveManifest=JSON.parse(await readFile('public/shockwave/manifest.json','utf8'));
const modInventory=shockwaveManifest.archives.map(({name,bytes,sha256})=>({name,bytes,sha256}));
if(JSON.stringify(modInventory)!==JSON.stringify(SHOCKWAVE_ARCHIVES)
  ||shockwaveManifest.version!==SHOCKWAVE_VERSION||PROFILES.shockwave.version!==SHOCKWAVE_VERSION
  ||PROFILES.shockwave.runtime!==SHOCKWAVE_RUNTIME)throw Error('ShockWave archive or runtime profile mismatch');
const packageVersion=JSON.parse(await readFile('package.json','utf8')).version;
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
if(lock.version!==packageVersion||lock.packages[''].version!==packageVersion)throw Error('Package lock release version mismatch');
const siteVersion=JSON.parse(await readFile('public/version.json','utf8')).version;
const preferencesSource=await readFile('public/preferences.mjs','utf8');
const interfaceVersion=preferencesSource.match(/export const VERSION=['"](\d+\.\d+\.\d+)['"]/u)?.[1];
if(siteVersion!==packageVersion||interfaceVersion!==packageVersion)throw Error(`Release version mismatch: package=${packageVersion}, site=${siteVersion}, interface=${interfaceVersion}`);
const interfacePages=['public/index.html','public/zero-hour/index.html','public/yuri/index.html','public/shockwave/index.html','public/stream/index.html'];
for(const page of interfacePages){
 const html=await readFile(page,'utf8');
 const chrome=[...html.matchAll(/<(?:header|footer)\b[^>]*>([\s\S]*?)<\/(?:header|footer)>/g)].map(match=>match[1]).join(' ');
 const labels=[...chrome.matchAll(/(?:Version\s+|WEB\s*·\s*)(\d+\.\d+(?:\.\d+)?)/g)].map(match=>match[1]);
 if(!labels.length||labels.some(version=>version!==packageVersion))throw Error('Visible release version mismatch: '+page+' ('+labels.join(', ')+')');
 const titleVersion=html.match(/<title>[^<]*ZeroHour Web (\d+\.\d+\.\d+)<\/title>/)?.[1];
 if(titleVersion&&titleVersion!==packageVersion)throw Error('Page title release version mismatch: '+page);
}
// Resolve HTML references beneath a repository subpath, as GitHub Pages does.
// Checking modules alone misses broken navigation, stylesheets and script tags.
const siteBase=new URL('https://site-check.invalid/zero-hour-web/'),publicRoot=resolve('public');
let linkCount=0;
for(const page of [...interfacePages,'public/zero-hour.html','public/legal.html','public/source/index.html','public/shockwave/setup.html']){
 const html=await readFile(page,'utf8'),pageURL=new URL(page.slice('public/'.length),siteBase);
 for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)){
  const reference=match[1].replaceAll('&amp;','&');
  if(reference.startsWith('#')){
   if(reference.length>1&&!html.includes(`id="${decodeURIComponent(reference.slice(1))}"`))throw Error(`Missing anchor ${page}: ${reference}`);
   continue;
  }
  const url=new URL(reference,pageURL);if(url.origin!==siteBase.origin)continue;
  if(!url.pathname.startsWith(siteBase.pathname))throw Error(`Link outside repository path ${page}: ${reference}`);
  const target=resolve(publicRoot,decodeURIComponent(url.pathname.slice(siteBase.pathname.length)));
  if(target!==publicRoot&&!target.startsWith(publicRoot+sep))throw Error(`Link outside public files ${page}: ${reference}`);
  const entry=await stat(target).catch(()=>null);
  if(!entry)throw Error(`Missing page or asset ${page}: ${reference}`);
  if(entry.isDirectory()&&(!url.pathname.endsWith('/')||!(await stat(resolve(target,'index.html')).catch(()=>null))?.isFile()))throw Error(`Invalid directory link ${page}: ${reference}`);
  linkCount++;
 }
}
let count=0;const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p)}}
await walk('public');await walk('tools');
for(const file of files){
 if(/\.(big|gib|bik|mix|sav|rep|exe|dll)$/i.test(file))throw Error(`Retail or executable file in publication: ${file}`);
 if(/\.(mjs|js|cjs)$/.test(file)){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
  const text=await readFile(file,'utf8');
  if(file.startsWith(resolve('public')+sep))for(const match of text.matchAll(/(?:from\s*|import\s*|import\(|importScripts\(|new URL\()\s*["'](\.\.?\/[^"']+)["']/g)){
   if(!/\.(mjs|js)$/.test(match[1]))continue;
   if(!(await stat(resolve(dirname(file),match[1])).catch(()=>null)))throw Error(`Missing module ${file}: ${match[1]}`);
  }
  count++;
 }
}
const manifest=JSON.parse(await readFile('docs/foundation-manifest.json','utf8'));
const engineBuild=JSON.parse(await readFile('docs/engine-build-manifest.json','utf8'));
if(engineBuild.runtime!==JSON.parse(await readFile('public/version.json','utf8')).engine)throw Error('Engine build identity mismatch');
for(const item of [...engineBuild.artifacts,engineBuild.patch]){const bytes=await readFile(item.path);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Engine build provenance mismatch: ${item.path}`)}
if(createHash('sha256').update(await readFile('tools/engine/build-replay.sh')).digest('hex')!==engineBuild.buildScriptSha256)throw Error('Engine build script changed without provenance update');
const decoder=JSON.parse(await readFile('docs/archive-decoder-manifest.json','utf8'));
for(const item of decoder.files){const bytes=await readFile(item.path);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Changed pinned archive decoder/source: ${item.path}`)}
for(const item of manifest.files.filter(f=>/dist-threaded-release|source\/NewShoes/.test(f.path))){const b=await readFile(resolve('public',item.path));if(createHash('sha256').update(b).digest('hex')!==(item.publishedSha256||item.sha256))throw Error(`Changed verified artifact ${item.path}`)}
function checkZip(bytes){const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));if(end<0)throw Error('Invalid source ZIP');let offset=bytes.readUInt32LE(end+16);const count=bytes.readUInt16LE(end+10);for(let i=0;i<count;i++){if(bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid source central directory');const length=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+46,offset+46+length).toString();if(/\.(big|gib|bik|mix|sav|rep|exe|dll)$/i.test(name)||/(?:^|\/)(?:\.local|node_modules|output|\.env)(?:\/|$)/i.test(name))throw Error(`Excluded source entry ${name}`);offset+=46+length+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32);}}
const upstream=Buffer.concat(await Promise.all(['01','02'].map(part=>readFile(`public/source/NewShoes-source.zip.part${part}`))));checkZip(upstream);
for(const name of manifest.sourceArchive.excludedNativeMedia||[])if(upstream.includes(Buffer.from(name)))throw Error(`Excluded native source media ${name}`);
const standalone=await readFile('public/source/zero-hour-web-source.zip').catch(()=>null);if(standalone)checkZip(standalone);
for(const folder of ['engine','relay']){
 const yuri=JSON.parse(await readFile(`public/yuri/${folder}/provenance.json`,'utf8'));
 for(const artifact of yuri.artifacts){if(!artifact.path.startsWith('public/yuri/')&&artifact.path!=='tools/yuri-relay/relay.cjs')throw Error('Unsafe Yuri artifact path');const bytes=await readFile(artifact.path);if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw Error(`Changed Yuri runtime/source artifact: ${artifact.path}`);}
}
for(const source of ['public/yuri/engine/RA2-VM-source.zip','public/yuri/relay/Yuri-relay-source.zip'])checkZip(await readFile(source));
console.log(`Checked ${count} scripts, ${linkCount} page links/assets, local module imports, publication boundaries and engine/source checksums.`);
