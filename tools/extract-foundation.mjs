import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'../Online-Games/.local/github-pages');
const root=resolve('.');
const seen=new Set(), records=[];
async function copy(name){
  name=name.replaceAll('\\','/');
  if(seen.has(name)) return;
  seen.add(name);
  const from=resolve(source,name);
  if(!from.startsWith(source+'\\')&&!from.startsWith(source+'/'))return;
  let bytes; try {bytes=await readFile(from)}catch{return;}
  if(/\.(big|mix|exe|dll|sav|rep|bik)$/i.test(name)||/winchester|yuri|san-andreas|device-transfer-network/.test(name))throw Error('Excluded '+name);
  const to=resolve(root,'public',name);
  await mkdir(dirname(to),{recursive:true}); await writeFile(to,bytes);
  records.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  if(/\.(m?js|json)$/.test(name)){
    for(const match of bytes.toString().matchAll(/["'`]((?:\.\.?\/)?[A-Za-z0-9_./-]+\.(?:mjs|js|json|wasm|css|png|woff2|txt))["'`]/g)){
      const dep=resolve(dirname(from),match[1]);
      await copy(relative(source,dep));
    }
  }
}
for(const name of ['harness/bridge.js','harness/engine_realm_boot.mjs','harness/engine_realm_entry.mjs','harness/launcher-asset-manager.mjs','harness/launcher-asset-worker.js','harness/launcher-backup-zip.mjs','harness/runtime-shutdown-sequence.mjs','harness/multiplayer_identity.mjs','harness/vendor/trystero-LICENSE.txt','harness/vendor/pako-LICENSE.txt','harness/vendor/seek-bzip-LICENSE.txt','harness/vendor/cicdec-LICENSE.txt','harness/vendor/noble-secp256k1-LICENSE.txt','dist-threaded-release/cnc-port.js','dist-threaded-release/cnc-port.wasm','dist-threaded-release/cnc-port.worker.js','LICENSE.md','source/NewShoes-source.zip.part01','source/NewShoes-source.zip.part02']) await copy(name);
await mkdir('docs',{recursive:true});
await writeFile('docs/foundation-manifest.json',JSON.stringify({sourceProject:'Online-Games',upstreamCommit:'3ccaa0e9af66889be183ca910851e881d47d437c',files:records},null,2));
// Worker URLs must resolve against this module, independent of the standalone page.
const manager=resolve(root,'public/harness/launcher-asset-manager.mjs');
await writeFile(manager,(await readFile(manager,'utf8')).replace('new Worker("./launcher-asset-worker.js")','new Worker(new URL("./launcher-asset-worker.js", import.meta.url))').replaceAll('Reload Project New Shoes','Reload Zero Hour Web'));
console.log(`Extracted ${records.length} engine/import dependencies; no retail data or old desktop.`);
