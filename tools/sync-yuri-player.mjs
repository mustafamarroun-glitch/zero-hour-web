// Project-owned entry point; inventoried runtime bytes remain untouched.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function syncYuriPlayer({check=false}={}){
 const original=await readFile(new URL('../public/yuri/engine/runtime/index.html',import.meta.url),'utf8');
 const script=original.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)?.[1];
 const css=original.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/)?.[1];
 if(!script?.startsWith('./assets/')||!css?.startsWith('./assets/'))throw Error('Unexpected pinned Yuri entry point');
 const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="./engine/runtime/"><title>Yuri’s Revenge game</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${css}"><link id="yuri-player-style" rel="stylesheet" href="../../player.css"><script src="../../runtime-bridge.js"></script><script type="module" crossorigin src="${script}"></script></head><body><div id="root"></div></body></html>
`;
 const target=new URL('../public/yuri/runtime.html',import.meta.url);
 if(check){if(await readFile(target,'utf8')!==html)throw Error('Yuri player entry is stale. Run node tools/sync-yuri-player.mjs.');}
 else await writeFile(target,html);
}
if(process.argv[1]===fileURLToPath(import.meta.url))await syncYuriPlayer({check:process.argv.includes('--check')});
