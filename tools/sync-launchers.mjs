// Zero Hour's page is the shared launcher template, rather than a second UI fork.
import {readFile,writeFile} from 'node:fs/promises';
import {PROFILES} from '../public/game-profiles.mjs';
export async function syncLaunchers({check=false}={}){
 let html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 html=html.replace('<html lang="en"','<html data-game="yuri" lang="en"')
  .replace('Play Generals Zero Hour in your browser using your own local game files.','Play Yuri’s Revenge in your browser using your own local game files.')
  .replace(/<title>Zero Hour Web ([^<]+)<\/title>/,'<title>Yuri’s Revenge · Zero Hour Web $1</title>')
  .replaceAll('src="./','src="../').replaceAll('href="./','href="../')
  .replace('<a href="../" aria-current="page">Zero Hour</a><a href="../yuri/">Yuri’s Revenge</a>','<a href="../">Zero Hour</a><a href="./" aria-current="page">Yuri’s Revenge</a>')
  .replace('Command &amp; Conquer: Generals Zero Hour, directly in your browser.','Command &amp; Conquer: Yuri’s Revenge, directly in your browser.')
  .replace('Import your compatible Generals + Zero Hour files.','Import your compatible Red Alert 2 + Yuri’s Revenge files.')
  .replace('installation’s <strong>Data folder</strong>','<strong>game folder</strong>')
  .replace('required archives and their contents','required game files and their headers')
  .replace('accept=".big,.iso,.bin,.cue"','')
  .replace('Allow roughly 2 GB of browser storage for the tested profile','Allow roughly 1 GB of browser storage for the movie-free package')
  .replace(/https:\/\/drive\.google\.com\/file\/d\/[^"\s]+/g,PROFILES.yuri.download)
  .replace('Choose a format, download it, then use','Both buttons open the supplied Google Drive download. Import the downloaded ZIP or RAR using')
  .replace('download="Zero-Hour-backup.zip"',`download="${PROFILES.yuri.backup}"`)
  .replace('title="Zero Hour game"','title="Yuri’s Revenge game"')
  .replace('Right-click issues movement or attack orders.','Left-click issues movement or attack orders; right-click cancels selection.')
  .replace('Choose a builder, then use the construction panel.','Deploy your MCV, then use the construction panel.')
  .replace('Renderer changes apply on your next launch. Graphics detail is available in the game’s Options.','Yuri display, audio and scrolling changes apply on your next launch. Graphics detail is available in the game’s Options.');
 const path=new URL('../public/yuri/index.html',import.meta.url);
 if(check){if(await readFile(path,'utf8')!==html)throw Error('Yuri launcher differs from the shared template. Run node tools/sync-launchers.mjs.');}
 else await writeFile(path,html);
}
if(process.argv[1]&&new URL('file:///'+process.argv[1].replaceAll('\\','/')).pathname.endsWith('/sync-launchers.mjs'))await syncLaunchers({check:process.argv.includes('--check')});
