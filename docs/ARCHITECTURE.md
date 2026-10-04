# Runtime and product boundaries

The root page owns identity, importer, installed-library recovery, private room membership, local ZIP export and game utilities. A same-origin iframe owns each engine lifetime. Clean exit stops the paced engine loop, flushes saves, disconnects peers, shuts down the worker and removes the iframe. Relaunch creates a fresh runtime and remounts the retained local archives.

Archive validation and OPFS storage reuse the inspected combined-English importer. The current profile is intentionally narrow: sentinel paths, archive bounds and complete content are checked. Matching filenames alone are insufficient. Multiplayer fingerprints hash every byte of every mounted archive with SHA-256 and combine hashes in name order. Fingerprints are session-cached by immutable installed-library root. No retail bytes leave the browser.

The root page never mounts retail files on a server. Source downloads contain engine/build source only. New origin storage is independent of Winchester OS. Migration is explicit: export ZIP there, extract it locally, import here.

The compiled engine renders D3D8 through WebGL2 on an OffscreenCanvas in a pthread worker. SharedArrayBuffer requires HTTPS/localhost and cross-origin isolation. Keyboard and pointer input use the retained bridge. Audio uses Web Audio on the window side; the utility slider changes original mixer gains. Compatibility mode uses the ff renderer; shader effects uses ps11. These settings do not establish Mac support.

## Multiplayer

`tools/server.mjs` provides two distinct endpoints. `/rooms` manages temporary two-player membership, display-name collision errors, host ownership and engine/content compatibility. `/nostr` handles Trystero's encrypted WebRTC signaling. Engine datagrams use WebRTC channels, virtual IPs and the original LAN network protocol. Room codes isolate the discovery room; the internal guest UUID is the transport identity.

Room-service presence is separate from native-engine peers. Entering a room launches real engine instances, enters Multiplayer → Anonymous/LAN, hosts or discovers/joins the native match, and exposes original ready/start/map commands. Native faction, color, team and slot controls synchronize through LAN. The website must never describe a room roster as proof of an active game.

The server is an experimental development service bound to loopback by default, with origin restrictions, message limits and bounded ephemeral signal storage. Public deployment requires explicit allowed HTTPS origins and WSS service URLs. No old transfer relay or TURN credentials are reused. Direct WebRTC and signaling must be verified separately. TURN may be configured with `ICE_SERVERS`; no relay service is assumed or provisioned. WebSocket game-datagram fallback is not yet implemented or validated; the upstream legacy WebSocket probe endpoint is insufficient evidence for threaded multiplayer.

## Build provenance

`tools/extract-foundation.mjs` records the allowlisted dependency closure and original SHA-256 values. The standalone asset manager resolves its worker with `import.meta.url`; commander identity and direct menu navigation live in the new game adapter. Engine JS/WASM/worker artifacts are unmodified. Rebuild the original engine in Linux to preserve case-sensitive files and symlinks. The corresponding-source ZIP contains this project's exact public harness, interface, tools, build overrides and documentation.
