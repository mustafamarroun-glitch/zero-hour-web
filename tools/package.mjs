import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {buildFileZip} from '../public/harness/launcher-backup-zip.mjs';
import {syncLaunchers} from './sync-launchers.mjs';
import {syncYuriPlayer} from './sync-yuri-player.mjs';
await syncLaunchers();
await syncYuriPlayer();
const sourceEntries=[];
async function sources(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=resolve(dir,e.name);const name=relative(resolve('.'),file).replaceAll('\\','/');if(e.isDirectory()){if(!name.startsWith('public/dist-')&&!name.startsWith('public/source')&&e.name!=='__pycache__')await sources(file)}else if(/\.(?:m?js|cjs|html|css|md|json|txt|woff2|ya?ml|py|ps1|sh|cmd)$/.test(name)||name==='public/_headers')sourceEntries.push({name,file:new Blob([await readFile(file)])});}}
for(const directory of ['tools','public','docs','build','.github'])await sources(directory);
for(const name of ['README.md','README.txt','PLAY-WITH-A-FRIEND.md','VERSION_2.md','VERSION_2_1.md','PRODUCT.md','DESIGN.md','LICENSE.md','Dockerfile','package.json','package-lock.json','.gitignore','.gitattributes','.dockerignore','compose.streaming.yaml','compose.streaming.wsl.yaml','Enable-PrivateTurn.ps1','Start-Streaming.ps1','Start-InternetStreaming.ps1','Stop-Streaming.ps1','Test-StreamingGPU.ps1','Start Zero Hour Streaming.cmd','Start Zero Hour Internet Streaming.cmd','Stop Zero Hour Streaming.cmd','Start-Streaming.sh','Stop-Streaming.sh','Test-StreamingGPU.sh','Setup-StreamingLinux.sh'])sourceEntries.push({name,file:new Blob([await readFile(name)])});
sourceEntries.push({name:'VERSION_2_3.md',file:new Blob([await readFile('VERSION_2_3.md')])});
const zip=await buildFileZip(sourceEntries);await writeFile('public/source/zero-hour-web-source.zip',new Uint8Array(await zip.arrayBuffer()));
const output=resolve('release/site');await mkdir(output,{recursive:true});const manifest=[];
async function publish(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=resolve(dir,e.name);if(e.isDirectory())await publish(file);else{
const name=relative(resolve('public'),file).replaceAll('\\','/');if(/\.(big|bik|mix|sav|rep|exe|dll)$/i.test(name)||/winchester|san-andreas|network\.mjs/i.test(name))throw Error(`Excluded publication file ${name}`);
 const bytes=await readFile(file);const destination=resolve(output,name);await mkdir(dirname(destination),{recursive:true});await copyFile(file,destination);manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}}}
await publish('public');await writeFile('release/manifest.json',JSON.stringify({generatedAt:new Date().toISOString(),files:manifest},null,2));
console.log(`Prepared ${manifest.length} site files (${(manifest.reduce((n,f)=>n+f.bytes,0)/1024/1024).toFixed(1)} MB) and corresponding source. No retail archives, profiles or credentials.`);
