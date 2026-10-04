# Browser archive import

Imports stay in the browser's existing `zero-hour-web-v1` storage boundary. `.big` files and optional original `Cursors/*.ani` art are extracted into a unique private `archive-staging/extract-<uuid>` directory. Relative archive paths are metadata; actual staging filenames are flat generated IDs. The existing asset worker validates names, BIG headers and required archive contents, then installs a fresh library before switching the saved manifest. Original files are read-only. Installations without original cursor art use the browser arrow.

ZIP STORE and DEFLATE use Blob streams and native `DecompressionStream('deflate-raw')` with incremental CRC32 and exact expanded-size checks. Directory traversal, absolute paths, case-insensitive duplicate paths/game basenames, symlinks, encryption, multipart ZIPs and ZIP64 are rejected. Expanded contents are bounded to 8 GiB / 20,000 entries. Other formats/compression modes should be extracted externally and imported as a Data folder.

RAR uses node-unrar-js 2.0.2's official UnRAR decoder in a dedicated module worker. A custom `Extractor` reads input with worker-only FileReaderSync Blob slices and writes output through preallocated OPFS sync access handles. It does not buffer the complete archive or all extracted files. The decoder still needs its compression dictionary in RAM; very large dictionaries may exceed a device's memory. Cancellation terminates the dedicated worker, closes its handles, and removes staging. A named Web Lock protects active extraction roots from stale-root cleanup in another tab. Failed installation or cancellation leaves the previous installed manifest intact.

## Dependency provenance

- Adapter: https://github.com/YuJianrong/node-unrar.js at tag v2.0.2, commit `b8a26b187d03a33506af778fa8c8e0adc60b7755`.
- Published package: https://registry.npmjs.org/node-unrar-js/-/node-unrar-js-2.0.2.tgz, npm integrity `sha512-hLNmoJzqaKJnod8yiTVGe9hnlNRHotUi0CreSv/8HtfRi/3JnRC8DvsmKfeGGguRjTEulhZK6zXX5PXoVuDZ2w==`.
- `esm/js/Extractor.js` is copied as `vendor/unrar/Extractor.mjs`; `esm/js/unrar.js` is copied as `vendor/unrar/unrar.mjs`; `unrar.wasm` is unchanged. Only the filename/extensions change; the streaming adapter is project code.
- MIT adapter notice and the native UnRAR license are retained alongside the decoder. UnRAR may be used for decompression, with its restriction against recreating the RAR compression algorithm.
- Exact adapter/build source is `public/source/node-unrar-js-2.0.2-source.tar.gz`; native decoder source is `public/source/unrarsrc-6.1.7.tar.gz`, downloaded from https://www.rarlab.com/rar/unrarsrc-6.1.7.tar.gz.

To rebuild the decoder, extract the adapter source, use its documented Emscripten/TypeScript setup, place UnRAR 6.1.7 under `src/cpp/unrar`, and run its `build:release` workflow. The distributed pinned decoder was tested; a fresh decoder compiler rebuild is not claimed.

Verification: `tools/verify-v2.cjs` exercises real local ZIP/RAR installation and actual engine gameplay. `tools/verify-archive-safety.cjs` exercises malicious ZIP paths, duplicates, links, encryption, CRC failure, expanded-size bounds and exact STORE/DEFLATE extraction. Private outputs stay under `.local` and `output`.
