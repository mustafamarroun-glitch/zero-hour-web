import {parseAniCursor} from '../harness/original-cursor-assets.mjs';

export const cursorFileName=file=>(file.relativePath||file.webkitRelativePath||file.name).split(/[\\/]/).at(-1);

// The English base profile uses all 52 contexts, including movement and attacks.
export const REQUIRED_CURSOR_NAMES = (`sccattack.ani sccattack_s.ani sccattmov.ani sccattmov_s.ani scccashhack.ani sccenter.ani sccenter_s.ani sccexit.ani sccfriendly.ani sccfriendly_s.ani sccguard.ani sccheal.ani scchostile.ani scchostile2.ani scchostile3.ani scchostile_s.ani sccknifeattack.ani sccmove.ani sccmove_s.ani sccnoaction.ani sccnoaction_s.ani sccnobomb.ani sccnoentry.ani sccnoentry_s.ani sccnoknife.ani sccoutrange.ani sccplace.ani sccplacebeacon.ani sccpointer.ani sccrallypnt.ani sccrallypnt_s.ani sccremotechg.ani sccrepair.ani sccresumec.ani sccscroll0.ani sccscroll1.ani sccscroll2.ani sccscroll3.ani sccscroll4.ani sccscroll5.ani sccscroll6.ani sccscroll7.ani sccsdiuplink.ani sccselect.ani sccsell.ani sccsniper.ani sccspydrone.ani sccstop.ani scctimedchg.ani scctntattack.ani sccwaypoint.ani sccwaypoint_s.ani`).split(' ');

// Pack player-owned cursor files only. No artwork is bundled with the website.
export async function buildCursorPack(files, {signal}={}) {
  if(!files.length||files.length>128)throw Error('Select the original .ani cursor files from Data/Cursors.');
  const entries=[],names=new Set(),encoder=new TextEncoder();let total=16;
  for(const file of files){
    signal?.throwIfAborted();
    const name=cursorFileName(file);
    if(!/^[a-z0-9_ -]+\.ani$/i.test(name)||names.has(name.toLowerCase()))throw Error(`Invalid or duplicate cursor file: ${name}`);
    if(file.size<12||file.size>512*1024)throw Error(`${name}: unsupported cursor file size.`);
    const bytes=new Uint8Array(await file.arrayBuffer());
    parseAniCursor(bytes,name);
    const path=encoder.encode(`Data\\Cursors\\${name}`);
    total+=9+path.length+bytes.length;
    if(total>8*1024*1024)throw Error('Cursor artwork exceeds the 8 MB limit.');
    names.add(name.toLowerCase());entries.push({bytes,path});
  }
  const missing=REQUIRED_CURSOR_NAMES.filter(name=>!names.has(name));
  if(missing.length)throw Error(`Original cursor artwork is incomplete (${missing.length} missing). Include all 52 .ani files from Data/Cursors. Missing: ${missing.slice(0,5).join(', ')}`);
  const pack=new Uint8Array(total),view=new DataView(pack.buffer);
  pack.set([0x42,0x49,0x47,0x46]);view.setUint32(4,total,true);view.setUint32(8,entries.length);
  let directory=16,payload=16+entries.reduce((n,e)=>n+9+e.path.length,0);
  for(const {bytes,path} of entries){view.setUint32(directory,payload);view.setUint32(directory+4,bytes.length);pack.set(path,directory+8);pack.set(bytes,payload);directory+=9+path.length;payload+=bytes.length;}
  return {bytes:pack,entryCount:entries.length};
}
