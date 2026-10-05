# Zero Hour Web

Generals Zero Hour browser interface using New Shoes, with Yuri’s Revenge available through its separate RA2 VM runtime. This is a separate project and repository. Online-Games is a read-only technical reference and remains untouched. GitHub Pages repositories on the same account share a browser origin; this product uses its own storage namespaces for identity, imports, engine preferences and saves.

## Yuri’s Revenge

Choose **Yuri’s Revenge** in the header, or open `/yuri/`. Use the same commander → import → installed-library flow as Zero Hour. Choose or drop one ZIP/RAR, choose a complete game folder, or select its files. Import happens locally, with progress, cancellation and safe replacement. It requires the original `gamemd.exe`; `gamemd-spawn.exe` is not a substitute. Launch restores the installed files without a second picker. Use **Single Player → Skirmish** in the original game. Save before **Exit to website**. Recovery provides verification, ZIP backup, replacement and confirmed removal while retaining commander, preferences and stored saves.

For multiplayer, create a room and copy its invite, or join a friend’s eight-character room code. Each player imports matching files and uses **Network** in Yuri. The Node server supplies the shared room service and independent RA2 VM relay; static hosting requires those services deployed behind WSS. Native Yuri manages match readiness and start. Both Yuri download buttons open the supplied Google Drive location; the site does not automatically fetch the files. See [docs/YURI.md](docs/YURI.md) for provenance, hosting and verification limits.

## Start

For a plain-text player guide covering setup, controls, multiplayer and backups, see [README.txt](README.txt).

Install Node.js 22 or newer, then run `npm ci` and `npm start`. Open **http://localhost:8093/**. Keep this exact origin and browser profile to retain imported archives and saves. The standalone room and signaling endpoints run on the same local server. Ctrl+C stops only this project.

Version **2.1.0** fixes browser-game removal and the native Exit Game button, adds leftover-file cleanup, copyable diagnostics and safe update controls, and protects actual-size display proportions. It defaults to dark mode and remembers theme/settings choices. Enter a 2–12 character commander name, choose one ZIP/RAR or the original installation's Data folder, and wait for extraction, validation and browser-local installation. The inspected combined English profile requires 17 real archives. Import reads your files; it never uploads or modifies the installation. The folder-input fallback works without `showDirectoryPicker`. ZIP backups can be imported directly. See [VERSION_2_1.md](VERSION_2_1.md) for this release and [VERSION_2.md](VERSION_2.md) for the earlier scope and Version 1 restore point.

The game opens directly into skirmish options. The website name is passed into engine initialization and the native skirmish field. Guest IDs are generated independently of display names. Names are not authenticated accounts. Browser storage must be enabled; private profiles are unsuitable for persistent large installations.

This site keeps its library separate from other products and retains its Version 1 namespace when upgrading to Version 2. Import again or choose a local ZIP backup to move libraries between products. Browser-wide clearing of this GitHub Pages origin removes every product's data, so back up each library first. A separate browser profile or dedicated hostname provides stronger separation of quota and site-wide clearing.

During play, the toolbar hides automatically. **F8** reveals/hides it; **Alt + Enter** toggles fullscreen. Settings controls actual engine resolution, aspect-preserving display size, edge scrolling, music/effects, the renderer for next launch, and optional performance information. Installed files & recovery offers validation, storage/persistence information, backup, replacement and removal. A running match prompts before a clean exit. The supplied Get ZIP / Get RAR buttons open Google Drive; the browser importer does not fetch or upload their contents.

Use **Remove installed game** to remove this browser's installation while keeping your commander, settings and stored saves. **Clean leftover game files** in recovery or Settings removes unused import/launch folders and preserves the installed game. Close other game tabs before cleaning. Both native and website exit controls return to the launcher; if shutdown stalls, Force close warns about unconfirmed saves. Settings also offers copy/download diagnostics and a manual version check. Apply an update after leaving the game and room and finishing file operations.

## Verification and release

For one independent friend session streamed from this laptop to a Mac on the
same Wi-Fi, see [docs/STREAMING.md](docs/STREAMING.md). The project now has a
Windows Docker/WSL path using the NVIDIA D3D12 renderer and NVENC, plus an
isolated remote-input desktop and WebRTC client. Local GPU rendering and
encoding passed capability probes, and the capture-to-encoder stages held a
60 FPS target for ten seconds. A real Zero Hour match, Mac playback and
end-to-end sustained 60 FPS streaming are still unverified.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for completed checks and remaining acceptance gates, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime/network boundaries, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS publication and service setup.

Run `npm run check`, then `npm run package`. Only `release/site` is the hosting package. `public/source` supplies corresponding source. `.local` and `output` are private evidence, disposable test profiles and local assets; do not publish them.

## Provenance

Upstream: New Shoes revision `3ccaa0e9af66889be183ca910851e881d47d437c`, GPLv3 with additional terms. Exact imported runtime hashes and original/published source hashes are recorded in `docs/foundation-manifest.json`. Browser engine/build source is retained as two checksum-verifiable parts, excluding seven unused Windows DLL/compiler binaries and 75 unused native/editor and upstream website image resources. The six generic library placeholder/gradient textures remain; no browser source was removed. Standalone modifications are generated into a separate source ZIP. Engine rebuild instructions and dependency overrides are retained in `Dockerfile` and `build/`; a fresh rebuild is unverified.

No retail archives, unrelated games, old Git history, account credentials, browser installations, caches or saves were copied from Online-Games. Runtime-imported general helper modules remain because the engine bridge depends on them; the old desktop and transfer service configuration are absent. The font is Rajdhani under SIL OFL; third-party runtime notices remain in `public/harness/vendor`.
