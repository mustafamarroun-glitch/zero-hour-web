# Version 3.0: replay recorder and profiling

Zero Hour Web 3.0.0 includes the rebuilt browser engine `3ccaa0e9-compiled-combined-v6-rf1`. Replay recording flushes commands once per logic frame instead of after each command. Native builds retain their original flushing behavior. Serialized command bytes, CRC arguments and file-close behavior are preserved.

Settings now offers **Performance diagnosis → Detailed engine profiling**. The engine confirms the selected state. Profiling is off at each launch, and local diagnostic downloads retain up to 60 recent active-game samples even after pausing. No telemetry endpoint is added.

Local Windows in-app browser acceptance passed a six-player Hostile Dawn skirmish, builder construction, native save/load, and short replay playback through the results screen. Final replay diagnostics showed no CRC mismatch, engine error, exception or graphics context loss. Real recorder-method tests matched baseline and optimized serialized bytes; 20 ordinary commands made 21 explicit baseline flushes versus one optimized flush. All six profiling tests and release artifact/source checks passed.

The retained new flush measurements peaked at 6.505 ms; the earlier report showed recorder update stalls up to 276.94 ms. Different scenarios and sparse retained samples prevent a controlled speedup or sustained-FPS claim. Map initialization, save/load transitions and rendering can still stall. Longer completed combat, Mac performance and separate-device multiplayer remain unverified for this rebuild.

Original runtime hashes and published replacement hashes are retained in `docs/foundation-manifest.json`. `docs/engine-build-manifest.json` pins the source, patch and Emscripten image. See `docs/ENGINE-REBUILD.md` for reproduction and restore instructions. The exact patch and build tools are included in the downloadable corresponding-source ZIP alongside the unchanged upstream source parts.

Version 3.0 preserves the existing storage namespace, imported player-owned assets, settings and saves. Version 2.3 streaming features remain available; the Yuri engine is unchanged. GitHub Pages publishes only the packaged static website; multiplayer and hosted streaming still require their existing separate services. Do not mix the original and rebuilt Zero Hour runtime in one room.

Before release preparation, all tracked and untracked source files were copied and SHA-256 verified under `.local/backup/pre-v3-<UTC timestamp>/`, with a verified Git bundle. Earlier native artifacts are also preserved under `.local/backup/replay-engine-20261008T095647Z/`. These private restore points and diagnostic reports are excluded from publication.
