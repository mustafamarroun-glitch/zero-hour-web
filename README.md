# Zero Hour Web

Standalone Generals Zero Hour browser interface using the real New Shoes threaded engine. This is a separate project, repository and browser origin. Online-Games is a read-only technical reference and remains untouched.

## Start

Install Node.js 22 or newer, then run `npm ci` and `npm start`. Open **http://localhost:8093/**. Keep this exact origin and browser profile to retain imported archives and saves. The standalone room and signaling endpoints run on the same local server. Ctrl+C stops only this project.

Enter a 2–12 character commander name, select the original installation's Data folder, and wait for validation and browser-local installation. The inspected combined English profile requires 17 real archives. Import reads your files; it never uploads or modifies the installation. The folder-input fallback works without `showDirectoryPicker`. ZIP exports must be extracted before importing.

The game opens directly into skirmish options. The website name is passed into engine initialization and the native skirmish field. Guest IDs are generated independently of display names. Names are not authenticated accounts. Browser storage must be enabled; private profiles are unsuitable for persistent large installations.

## Verification and release

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for completed checks and remaining acceptance gates, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime/network boundaries, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS publication and service setup.

Run `npm run check`, then `npm run package`. Only `release/site` is the hosting package. `public/source` supplies corresponding source. `.local` and `output` are private evidence, disposable test profiles and local assets; do not publish them.

## Provenance

Upstream: New Shoes revision `3ccaa0e9af66889be183ca910851e881d47d437c`, GPLv3 with additional terms. Exact imported runtime hashes and original/published source hashes are recorded in `docs/foundation-manifest.json`. Browser engine/build source is retained as two checksum-verifiable parts, excluding seven unused Windows DLL/compiler binaries. No browser source was removed. Standalone modifications are generated into a separate source ZIP. Engine rebuild instructions and dependency overrides are retained in `Dockerfile` and `build/`; a fresh rebuild is unverified.

No retail archives, unrelated games, old Git history, account credentials, browser installations, caches or saves were copied from Online-Games. Runtime-imported general helper modules remain because the engine bridge depends on them; the old desktop and transfer service configuration are absent. The font is Rajdhani under SIL OFL; third-party runtime notices remain in `public/harness/vendor`.
