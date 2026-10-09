import { Sha256, validateBigReader } from '../harness/mod-package-format.mjs';

export const SHOCKWAVE_VERSION = '1.201';
export const SHOCKWAVE_RUNTIME = '3ccaa0e9-compiled-combined-v6-rf1-shockwave-1.201-v1';
// Filled from the supplied official installer; these are hashes, never game data.
export const SHOCKWAVE_ARCHIVES = Object.freeze([
  {
    "name": "0Shwpatch.big",
    "bytes": 631247,
    "sha256": "f633324e257fa5cd60a44bc200ddfc3f04c66e05acb8ea62fd19486a98e9e034"
  },
  {
    "name": "Shw2DArt.big",
    "bytes": 70945824,
    "sha256": "994494915b28196ca3c70f3f82ecbf88834ebda30fa5e9a00bbd409ca2b65f15"
  },
  {
    "name": "Shw_Challenge.big",
    "bytes": 4753903,
    "sha256": "26700bdae61be8954eeaf7af1d6aa542eedf8ad14d4f2711967e479be11f4dd0"
  },
  {
    "name": "Shw_ini.big",
    "bytes": 25549672,
    "sha256": "46dab5fe59a8713f1b3e73b544d883432442a585a10062473c24141de64d96e2"
  },
  {
    "name": "Shw_maps.big",
    "bytes": 31714721,
    "sha256": "3183505212f61810e099963ec59c1ee1317d1640acfea62329cd878dd7036e58"
  },
  {
    "name": "Shw_scripts.big",
    "bytes": 3030411,
    "sha256": "d5926738a8498840f749a8eef0f22c3286c7f06059b7ab48a95ddb2adaaa8382"
  },
  {
    "name": "Shw_wnd.big",
    "bytes": 8459568,
    "sha256": "26ef0eeac6a323d2df7b1a26acc2d8fd187f31e01f276773dc05699df030c643"
  },
  {
    "name": "ShwAudio.big",
    "bytes": 102786141,
    "sha256": "8b077bdc40c8e1446f56378077f997914c9d7e5768617e4772de310a8cc478de"
  },
  {
    "name": "ShwTextures.big",
    "bytes": 67030214,
    "sha256": "d8021f85d32578fa04be2e3af5b3a44e1ea9ebd48a58c2560e9ad4a263e21415"
  },
  {
    "name": "ShwVoice.big",
    "bytes": 77145052,
    "sha256": "db30c03a885c0bf53315e7da224f4b449c13a1d05c26271ed3b19c1ed7321bbd"
  },
  {
    "name": "ShwW3D.big",
    "bytes": 123908460,
    "sha256": "b652c0bd948beef6673b4b64932c88a5c6eb30fccbd14b0d8db73b7809fbbc3e"
  }
]);

export function selectShockwaveFiles(files) {
  const selected = new Map();
  for (const file of files) {
    const path = file.relativePath || file.webkitRelativePath || file.name;
    const name = path.split(/[\\/]/).at(-1).replace(/\.gib$/i, '.big').replace(/^!+/, '');
    const spec = SHOCKWAVE_ARCHIVES.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (!spec) continue;
    if (selected.has(spec.name)) throw Error(`Multiple copies of ${spec.name}. Choose one ShockWave installation.`);
    selected.set(spec.name, file);
  }
  const missing = SHOCKWAVE_ARCHIVES.filter(spec => !selected.has(spec.name));
  if (missing.length) throw Error(`ShockWave ${SHOCKWAVE_VERSION} files are missing: ${missing.map(spec => spec.name).join(', ')}. Import a prepared folder containing the Zero Hour base files and ShockWave archives. The installer EXE cannot run in the browser.`);
  return SHOCKWAVE_ARCHIVES.map(spec => ({ spec, file: selected.get(spec.name) }));
}

export async function hashFile(file, { signal, onChunk = () => {} } = {}) {
  const hash = new Sha256();
  for await (const chunk of file.stream()) {
    signal?.throwIfAborted(); hash.update(chunk); await onChunk(chunk);
  }
  return hash.digestHex();
}

export async function validateShockwaveFile(file, spec, options = {}) {
  if (file.size !== spec.bytes) throw Error(`${spec.name}: expected the official ${SHOCKWAVE_VERSION} archive (${spec.bytes} bytes).`);
  const result = await validateBigReader({ size: file.size, read: async (start, length) => new Uint8Array(await file.slice(start, start + length).arrayBuffer()) }, spec.name);
  const digest = await hashFile(file, options);
  if (digest !== spec.sha256) throw Error(`${spec.name}: checksum differs from ShockWave ${SHOCKWAVE_VERSION}. Use the complete official package.`);
  return result;
}
