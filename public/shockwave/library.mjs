import '../harness/storage-scope.js';
import { assetLibrary as base } from '../harness/launcher-asset-manager.mjs';
import { createModContext, saveModLibrary, saveActiveModContext, normalizeInstalledMod, activeModMountPlan } from '../harness/mod-context.mjs';
import { modContentHash } from '../harness/mod-package-format.mjs';
import { createOriginalCursorManifest, ORIGINAL_CURSOR_PACK_NAME } from '../harness/original-cursor-assets.mjs';
import {buildCursorPack} from './cursor-pack.mjs';
import { SHOCKWAVE_ARCHIVES, SHOCKWAVE_VERSION, selectShockwaveFiles, validateShockwaveFile } from './package.mjs';

const KEY = 'zeroh-installed-library.combined.v6';
let sources;
let cursorUpdate;
let preparedMods = [];
const fileAt = async path => {
  const parts = path.split('/'), name = parts.pop(); let directory = await navigator.storage.getDirectory();
  for (const part of parts) directory = await directory.getDirectoryHandle(part);
  return (await directory.getFileHandle(name)).getFile();
};
const modFrom = installation => {
  const mod = normalizeInstalledMod(installation?.shockwave);
  if (!mod || mod.contentHash !== modContentHash(mod.archives) || mod.version !== SHOCKWAVE_VERSION || mod.archives.length !== SHOCKWAVE_ARCHIVES.length) return null;
  if (mod.archives.some((archive, index) => archive.name !== SHOCKWAVE_ARCHIVES[index].name
    || archive.size !== SHOCKWAVE_ARCHIVES[index].bytes || archive.sha256 !== SHOCKWAVE_ARCHIVES[index].sha256 || !archive.enabled)) return null;
  return mod;
};
const summary = () => {
  const original = base.summary(), mod = modFrom(base.installedLibrary());
  const bytes = (original.totalBytes || original.bytes || base.installedLibrary()?.totalBytes || 0) + (mod?.archives.reduce((n, item) => n + item.size, 0) || 0);
  return { ...original, ready: original.ready && Boolean(mod), installed: Boolean(mod), totalBytes: bytes, formattedBytes: `${(bytes / 1024 ** 3).toFixed(2)} GB`, shockwave: mod ? { version: mod.version, archiveCount: mod.archives.length, contentHash: mod.contentHash } : null };
};

const overrides = {
  summary,
  installedLibrary() {
    const installation = base.installedLibrary(), mod = modFrom(installation);
    return mod ? { ...installation, archives: [...installation.archives, ...mod.archives.map(item => ({ ...item, bytes: item.size }))] } : null;
  },
  async scan(files, options = {}) {
    sources = null;cursorUpdate=null;
    if(files.length&&files.every(file=>/\.ani$/i.test(file.name))){
      if(!modFrom(base.installedLibrary()))throw Error('Install ShockWave before adding cursor artwork.');
      options.onProgress?.({phase:'Checking cursor artwork'});
      const pack=await buildCursorPack(files,options);
      // Validate all embedded frames, not just the ANI container headers.
      const library=createOriginalCursorManifest(pack.bytes);library.dispose();
      cursorUpdate=pack;
      return {ok:true,cursorOnly:true,cursorCount:pack.entryCount};
    }
    const selected = selectShockwaveFiles(files);
    for (const { file, spec } of selected) {
      options.signal?.throwIfAborted();
      options.onProgress?.({ phase: 'Validating ShockWave', detail: spec.name });
      await validateShockwaveFile(file, spec, options);
    }
    const result = await base.scan(files, options);
    if (result.ok) sources = selected;
    return result;
  },
  async prepare(mode, progress = () => {}, { signal } = {}) {
    if(mode==='install'&&cursorUpdate){
      const pack=cursorUpdate;
      return base.withLibraryMutation(async()=>{
        signal?.throwIfAborted();const installation=base.installedLibrary();
        if(!modFrom(installation))throw Error('The ShockWave installation changed. Retry adding cursors.');
        let directory=await navigator.storage.getDirectory();
        for(const part of installation.root.split('/'))directory=await directory.getDirectoryHandle(part);
        const oldBytes=installation.cursorAsset?new Uint8Array(await(await fileAt(installation.cursorAsset.opfsPath)).arrayBuffer()):null;
        const handle=await directory.getFileHandle(ORIGINAL_CURSOR_PACK_NAME,{create:true});
        const writer=await handle.createWritable();let written=false;
        try{
          progress({phase:'Saving original game cursors'});await writer.write(pack.bytes);signal?.throwIfAborted();await writer.close();written=true;
          const cursorAsset={name:ORIGINAL_CURSOR_PACK_NAME,bytes:pack.bytes.length,entryCount:pack.entryCount,opfsPath:`${installation.root}/${ORIGINAL_CURSOR_PACK_NAME}`};
          localStorage.setItem(KEY,JSON.stringify({...installation,cursorAsset,totalBytes:installation.totalBytes-(installation.cursorAsset?.bytes||0)+cursorAsset.bytes}));
          cursorUpdate=null;base.setPreparedCursorAsset(cursorAsset);base.lastValidationError=null;
          return {cursorOnly:true};
        }catch(error){
          if(!written){await writer.abort().catch(()=>{});if(!oldBytes)await directory.removeEntry(ORIGINAL_CURSOR_PACK_NAME).catch(()=>{});}
          else if(oldBytes){const rollback=await handle.createWritable();await rollback.write(oldBytes);await rollback.close();}
          else await directory.removeEntry(ORIGINAL_CURSOR_PACK_NAME);
          throw error;
        }
      });
    }
    if (mode !== 'install' || !sources) throw Error('Choose the complete ShockWave installation before importing.');
    const result = await base.withLibraryMutation(async () => {
      const previous = base.installedLibrary();
      const id = `mod-${crypto.randomUUID()}`, modRoot = `cnc-mods/${id}`;
      const installRoot = `cnc-library/install-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle('cnc-mods', { create: true });
      const directory = await (await parent.getDirectoryHandle(id, { create: true })).getDirectoryHandle('archives', { create: true });
      let committed = false;
      try {
        const archives = []; let completed = 0;
        const total = sources.reduce((n, item) => n + item.file.size, 0);
        for (const { spec, file } of sources) {
          signal?.throwIfAborted();
          const writer = await (await directory.getFileHandle(spec.name, { create: true })).createWritable();
          try {
            await validateShockwaveFile(file, spec, { signal, onChunk: async chunk => {
              await writer.write(chunk); completed += chunk.length;
              progress({ phase: 'Saving ShockWave', detail: spec.name, completedBytes: completed, totalBytes: total });
            } });
            await writer.close();
          } catch (error) { await writer.abort().catch(() => {}); throw error; }
          archives.push({ name: spec.name, opfsPath: `${modRoot}/archives/${spec.name}`, size: spec.bytes, sha256: spec.sha256, enabled: true });
        }
        const mod = normalizeInstalledMod({ id, name: 'ShockWave', version: SHOCKWAVE_VERSION, sourceName: 'ShockWaveV1201', contentHash: modContentHash(archives), archives, installedAt: new Date().toISOString() });
        if (!mod) throw Error('ShockWave manifest could not be validated.');
        const result = await base.request('prepare', { mode: 'install', installRoot, includeVideos: false }, progress);
        signal?.throwIfAborted();
        const installed = result.installed;
        if (!installed?.archives?.length) throw Error('Base game installation did not complete.');
        const manifest = { version: 6, game: 'zeroHour', root: installRoot, preparedAt: Date.now(), includeVideos: false,
          archives: installed.archives, videos: [], cursorAsset: installed.cursorAsset || null, shockwave: mod,
          totalBytes: [...installed.archives, ...(installed.cursorAsset ? [installed.cursorAsset] : [])].reduce((n, file) => n + file.bytes, 0) };
        // One commit publishes the base and mod together. No old files are removed before it succeeds.
        localStorage.setItem(KEY, JSON.stringify(manifest)); committed = true; base.lastValidationError = null;
        if (previous?.root) await base.deleteManagedStorageUnlocked(previous.root).catch(() => {});
        const previousMod = modFrom(previous);
        if (previousMod) await parent.removeEntry(previousMod.id, { recursive: true }).catch(() => {});
        sources = null;
        const persistent = await navigator.storage.persist?.().catch(() => false);
        return { ...result, warning: persistent ? null : { message: 'Installed. Persistent storage was not granted; keep your local package as a backup.' } };
      } finally {
        if (!committed) {
          await parent.removeEntry(id, { recursive: true }).catch(() => {});
          await base.request('discard', { path: installRoot }).catch(() => {});
        }
      }
    });
    await overrides.archivesForLaunch();
    return result;
  },
  async verifyInstalledLibrary() {
    const installation = await base.verifyInstalledLibrary();
    if (!installation) return null;
    try {
      const mod = modFrom(installation); if (!mod) throw Error('ShockWave manifest is missing or invalid.');
      for (const archive of mod.archives) await validateShockwaveFile(await fileAt(archive.opfsPath), SHOCKWAVE_ARCHIVES.find(item => item.name === archive.name));
      return overrides.installedLibrary();
    } catch (error) { base.lastValidationError = `ShockWave files could not be verified: ${error.message} Your files were kept. Retry or import a replacement.`; return null; }
  },
  async archivesForLaunch() {
    await base.archivesForLaunch();
    const mod = modFrom(base.installedLibrary()); if (!mod) throw Error('Install the complete ShockWave package first.');
    saveModLibrary(localStorage, { schema: 1, mods: [mod] });
    const context = await createModContext([mod]); saveActiveModContext(localStorage, context);
    preparedMods = activeModMountPlan(context);
    return base.preparedArchives;
  },
  async filesForBackup() {
    const installation = base.installedLibrary(), mod = modFrom(installation);
    if (!mod) throw Error('ShockWave is not installed.');
    const files = [...installation.archives.map(item => ({ name: item.name, path: item.opfsPath })), ...mod.archives.map(item => ({ name: item.name, path: item.opfsPath }))];
    return Promise.all(files.map(async item => ({ name: item.name, file: await fileAt(item.path) })));
  },
  async removeInstalledLibrary() {
    const mod = modFrom(base.installedLibrary());
    const result = await base.removeInstalledLibrary();
    if (mod) await (await (await navigator.storage.getDirectory()).getDirectoryHandle('cnc-mods')).removeEntry(mod.id, { recursive: true });
    saveModLibrary(localStorage, { schema: 1, mods: [] }); preparedMods = [];
    return result;
  },
};
export const assetLibrary = new Proxy(base, {
  get(target, key) {
    if (key === 'preparedMods') return preparedMods;
    const value = key in overrides ? overrides[key] : target[key];
    return typeof value === 'function' ? value.bind(key in overrides ? overrides : target) : value;
  },
  set(target, key, value) { target[key] = value; return true; },
});
window.ShockwaveAssetLibrary = assetLibrary;
