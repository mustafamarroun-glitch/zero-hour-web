# Browser replay recorder rebuild

The browser engine flushes recorded commands once at the end of each logic frame, rather than after every command. The native build retains its original behavior. Recording format, CRC arguments and close-on-clear behavior are unchanged. Optional profiling markers separate serialization and frame flushing. `CNC_WEB_REPLAY_FLUSH_BASELINE=1` restores per-command flushing for comparison builds.

`engine-build-manifest.json` pins source, patch, compiler image and artifacts. The upstream source archive is unchanged; concatenate the two published parts. Extract and build on Linux to preserve case-sensitive paths and symlinks. No retail assets are needed for compilation.

From the project root in PowerShell, prepare a build directory and concatenate the source:

```powershell
New-Item -ItemType Directory -Force .local/engine-replay-build
$parts = 'public/source/NewShoes-source.zip.part01','public/source/NewShoes-source.zip.part02'
$stream = [IO.File]::Create((Join-Path $PWD '.local/engine-replay-build/source.zip'))
try { foreach ($part in $parts) { $bytes = [IO.File]::ReadAllBytes((Join-Path $PWD $part)); $stream.Write($bytes,0,$bytes.Length) } } finally { $stream.Dispose() }
docker run --name zero-hour-replay-build --cpus 4 --memory 6g --mount "type=bind,source=$PWD/tools/engine,target=/tools,readonly" --mount "type=bind,source=$PWD/.local/engine-replay-build,target=/workspace" emscripten/emsdk:3.1.6@sha256:978d9e7febf9a186e8ce6954e3e9b8e717e7c670832b38c51b22b7f600dd1111 bash /tools/build-replay.sh optimized
```

Outputs appear in `.local/engine-replay-build/dist-optimized`. A baseline build uses `baseline` as the script argument. Run `python3 /tools/test-replay-flush.py /work/source/NewShoes-main/GeneralsMD/Code/GameEngine/Source/Common/Recorder.cpp /workspace/recorder-fixture-tests` inside the build container to compare real recorder methods and serialized bytes.

Install all three runtime artifacts together. Update the runtime identity in game profiles, network configuration and server/streaming health consumers; mixed builds must not join the same room. Preserve original foundation hashes, record published hashes, regenerate the corresponding-source ZIP with `npm run package`, then run `npm run check`. Packaging creates a local release directory; it does not publish the website.

The fixture verifies bytes and flush counts for commands, clear-game and empty frames. It does not establish an FPS gain or full replay compatibility. Validate a real skirmish, save/load and replay in the browser and collect active-game profiling before drawing performance conclusions.

Local restore point before installation: `.local/backup/replay-engine-20261008T095647Z/manifest.json`. Each listed original file is copied under that directory and SHA-256 verified. Close the game before restoring those exact files together, then restart the preview server. Keep player files and browser storage intact.
