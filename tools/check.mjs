import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {syncLaunchers} from './sync-launchers.mjs';
await syncLaunchers({check:true});
let count=0;const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())await walk(p);else files.push(p)}}
await walk('public');await walk('tools');
for(const file of files){
 if(/\.(big|bik|mix|sav|rep|exe|dll)$/i.test(file))throw Error(`Retail or executable file in publication: ${file}`);
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
const decoder=JSON.parse(await readFile('docs/archive-decoder-manifest.json','utf8'));
for(const item of decoder.files){const bytes=await readFile(item.path);if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Changed pinned archive decoder/source: ${item.path}`)}
for(const item of manifest.files.filter(f=>/dist-threaded-release|source\/NewShoes/.test(f.path))){const b=await readFile(resolve('public',item.path));if(createHash('sha256').update(b).digest('hex')!==(item.publishedSha256||item.sha256))throw Error(`Changed verified artifact ${item.path}`)}
function checkZip(bytes){const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));if(end<0)throw Error('Invalid source ZIP');let offset=bytes.readUInt32LE(end+16);const count=bytes.readUInt16LE(end+10);for(let i=0;i<count;i++){if(bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid source central directory');const length=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+46,offset+46+length).toString();if(/\.(big|bik|mix|sav|rep|exe|dll)$/i.test(name)||/(?:^|\/)(?:\.local|node_modules|output|\.env)(?:\/|$)/i.test(name))throw Error(`Excluded source entry ${name}`);offset+=46+length+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32);}}
const upstream=Buffer.concat(await Promise.all(['01','02'].map(part=>readFile(`public/source/NewShoes-source.zip.part${part}`))));checkZip(upstream);
for(const name of manifest.sourceArchive.excludedNativeMedia||[])if(upstream.includes(Buffer.from(name)))throw Error(`Excluded native source media ${name}`);
const standalone=await readFile('public/source/zero-hour-web-source.zip').catch(()=>null);if(standalone)checkZip(standalone);
for(const folder of ['engine','relay']){
 const yuri=JSON.parse(await readFile(`public/yuri/${folder}/provenance.json`,'utf8'));
 for(const artifact of yuri.artifacts){if(!artifact.path.startsWith('public/yuri/')&&artifact.path!=='tools/yuri-relay/relay.cjs')throw Error('Unsafe Yuri artifact path');const bytes=await readFile(artifact.path);if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw Error(`Changed Yuri runtime/source artifact: ${artifact.path}`);}
}
for(const source of ['public/yuri/engine/RA2-VM-source.zip','public/yuri/relay/Yuri-relay-source.zip'])checkZip(await readFile(source));
console.log(`Checked ${count} scripts, local module imports, publication boundaries and engine/source checksums.`);
