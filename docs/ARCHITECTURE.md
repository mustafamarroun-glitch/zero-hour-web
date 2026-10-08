# Runtime and product boundaries

Both launchers use `public/app.mjs`, `style.css`, preferences, archive extraction and recovery controls. `public/index.html` is the canonical template; `tools/sync-launchers.mjs` generates `/yuri/index.html` with game-specific copy and links. `game-profiles.mjs` selects runtime, download and storage adapters. The checker rejects generated-page drift and packaging regenerates it.

Yuri uses the separate RA2 VM runtime, an atomic IndexedDB file library and an independent WebSocket relay on `/yuri-<internal relay code>`. The shared `/rooms` service distinguishes game/runtime/content, exposes eight-character invite codes and assigns Yuri a separate 96-bit relay code. See [YURI.md](YURI.md) for implementation and verification limits. The Zero Hour architecture below remains its own engine/network path.

The root page owns identity, importer, installed-library recovery, private room membership, local ZIP export and game utilities. A same-origin iframe owns each engine lifetime. Clean exit stops the paced engine loop, flushes saves, disconnects peers, shuts down the worker and removes the iframe. Relaunch creates a fresh runtime and remounts the retained local archives.

Archive validation and OPFS storage reuse the inspected combined-English importer. The current profile is intentionally narrow: sentinel paths, archive bounds and complete content are checked. Matching filenames alone are insufficient. Multiplayer fingerprints hash every byte of every mounted archive with SHA-256 and combine hashes in name order. Fingerprints are session-cached by immutable installed-library root. No retail bytes leave the browser.

The root page never mounts retail files on a server. Source downloads contain engine/build source only. Localhost:8093 is a separate development origin. GitHub Pages repository subpaths on one account share an origin; this site therefore namespaces every local/session-storage key and every OPFS entry beneath `zero-hour-web-v1`. The scope adapter runs in the page, game iframe, importer worker, engine realm and I/O worker. It never discovers or adopts unscoped Winchester OS libraries. Migration is explicit: export ZIP there, extract it locally, import here. Browser quota and clearing all origin data still affect both Pages projects; use a separate browser profile or custom hostname when independent origin-level storage is needed.

The compiled engine renders D3D8 through WebGL2 on an OffscreenCanvas in a pthread worker. SharedArrayBuffer requires HTTPS/localhost and cross-origin isolation. Keyboard and pointer input use the retained bridge. Audio uses Web Audio on the window side; the utility slider changes original mixer gains. Compatibility mode uses the ff renderer; shader effects uses ps11. These settings do not establish Mac support.

## Multiplayer

`tools/server.mjs` provides two distinct endpoints. `/rooms` manages temporary two-player membership, display-name collision errors, host ownership and engine/content compatibility. `/nostr` handles Trystero's encrypted WebRTC signaling. Engine datagrams use WebRTC channels, virtual IPs and the original LAN network protocol. Room codes isolate the discovery room; the internal guest UUID is the transport identity.

Room-service presence is separate from native-engine peers. Entering a room launches real engine instances, enters Multiplayer → Anonymous/LAN, hosts or discovers/joins the native match, and exposes original ready/start/map commands. Native faction, color, team and slot controls synchronize through LAN. The website must never describe a room roster as proof of an active game.

The server is an experimental development service bound to loopback by default, with origin restrictions, message limits and bounded ephemeral signal storage. Public deployment requires explicit allowed HTTPS origins and WSS service URLs. No old transfer relay or TURN credentials are reused. Direct WebRTC and signaling must be verified separately. TURN may be configured with `ICE_SERVERS`; no relay service is assumed or provisioned. WebSocket game-datagram fallback is not yet implemented or validated; the upstream legacy WebSocket probe endpoint is insufficient evidence for threaded multiplayer.

## Build provenance

`tools/extract-foundation.mjs` records the allowlisted dependency closure and original SHA-256 values. The standalone asset manager resolves its worker with `import.meta.url`; commander identity and direct menu navigation live in the new game adapter. The Zero Hour engine is rebuilt with the browser replay flush patch in `tools/engine/replay-frame-flush.patch`; original and published artifact hashes remain recorded separately. See `ENGINE-REBUILD.md` and `engine-build-manifest.json` for source, compiler and build provenance. Linux extraction preserves case-sensitive files and symlinks. The corresponding-source ZIP contains this project's exact public harness, interface, tools, build overrides and documentation.
