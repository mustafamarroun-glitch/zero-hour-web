# Independent acceptance record

Updated 2026-10-04. The source project's earlier results are context only; the following checks concern Zero Hour Web.

## Version 2.0 acceptance

- Version 1's exact working source/build snapshot passed every restored ZIP entry CRC and SHA-256; its Git bundle verified. `v1.0.0` preserves the committed baseline, and `VERSION_2.md` identifies the private snapshot and restore instructions.
- Dark mode defaults on and both theme choices restore after reload. Setup/settings were inspected at 1440 × 900 and 390 × 844 with no horizontal overflow. The supplied ZIP/RAR Drive URLs are present; Drive sharing/download access was not independently established.
- Actual local 1,093,310,765-byte ZIP and 857,593,023-byte RAR5 packages were extracted in Chrome, scanned and installed as 17 validated game archives. The solid RAR uses a 512 MB dictionary. Optional original cursor ANI files from the full packages are retained; an archive-only backup uses a system cursor fallback.
- RAR cancellation and a damaged ZIP retained the previous installation and allowed retry. Temporary extraction cleanup passed, including stale-root cleanup after a restart. Success is shown after staging cleanup completes.
- ZIP safety checks rejected traversal/absolute paths, duplicate game basenames, links, encryption, bad CRC and excessive expanded size. Nested STORE/DEFLATE fixtures extracted exact contents. Checks are in `tools/verify-archive-safety.cjs`.
- The RAR-imported game booted the actual original-engine Alpine Assault skirmish with the default Intel D3D11 hardware renderer. All four game edges moved the real camera; left/right tests crossed into outside-canvas letterboxing. Edge scrolling can be disabled.
- F8 reveals/hides the toolbar. A live shell resize to 1024 × 768 and a live match resize to 1600 × 900 reached the engine's display size. Original mouse selection and right-click movement worked after resize; the builder displaced by more than 20 world units.
- Fullscreen and Alt + Enter exit passed. Active-match exit displayed confirmation, flushed/shut down, and returned to the lobby.
- The final Version 2 gameplay run had no page errors or missing resources. Evidence is `.local/version-2-verification.json`; early verifier failures involved collapsed details, camera-scrolled-out builders and toggling an already visible toolbar. These were corrected in the verifier. A missing optional upstream cursor-art request was corrected with a system-cursor fallback.
- Headerless subpath hosting, service-worker isolation, SharedArrayBuffer, commander restoration and preservation of another product's storage passed again for Version 2. The existing storage namespace remains unchanged.
- The two-profile multiplayer regression passed: matching real installations, native host/guest discovery, synchronized map/faction/color/team/ready controls, real LAN terrain over WebRTC, replicated native mouse movement, and a 30-second observation without CRC mismatch. The toolbar stays visible in the native room setup and collapses during the match. This remains local preliminary multiplayer evidence, not a completed internet match.
- The release packager prepared 84 site files (38.1 MB) and corresponding interface source. Script/module and pinned runtime/source/decoder checksum checks passed. Private browser profiles, retail game data and backup evidence are excluded from hosting.

The tests use headless Windows Chrome on one PC. The remaining physical-device, Mac, audible playback, complete-match, internet-network and fresh compiler gates below still apply. Drive link contents were not downloaded by the app during these tests; the local packages were used.

## Completed so far

- Fresh disposable Windows browser profile imported the real combined English installation using the folder fallback; 17 archives, approximately 1.62 GiB, stayed in OPFS.
- Commander name and installed library restored after reload at the separate localhost:8093 origin.
- Windows Chrome 154.0.8037.98 initialized the actual unmodified compiled pthread engine and captured worker-rendered native graphics.
- The website name `FieldTest` appeared in the actual native skirmish field after the native text-entry bridge was added.
- Alpine Assault loaded with a GLA base, a worker and an Easy Army opponent. The engine's actual human-player list reports `FieldTest`.
- Mouse selection verified the exact worker object, then a right-click order displaced it by more than 20 world units.
- The original construction command spent 500 resources and completed a GLA barracks (construction -1, no under-construction status).
- Clean engine shutdown, save flushing and relaunch restored the same installation. The complete solo verifier passed without page errors or missing resources.
- Two actual local Chrome installations matched complete archive SHA-256 fingerprints. Real WebRTC channels discovered/joined the native LAN game with `FieldTest` and `FieldGuest`.
- Website map, faction, color, team, ready and start controls reached original native callbacks and synchronized between the two engines. Both loaded real LAN battlefields.
- Native mouse selection and right-click movement passed in a real two-player LAN match. The same host worker displaced and appeared at matching positions on the guest engine (within 5 world units between asynchronous observations). Both simulations continued for a 30-second observation without CRC mismatch. This is preliminary local gameplay proof, not a completed internet match.
- Earlier movement failures came from issuing a diagnostic order at frame zero and treating position arrays as coordinate objects. The verifier now waits for advancing simulation and a settled viewport and uses actual native mouse input. Native menu reveal also consumes distinct input positions in separate frames.
- The published HTTPS GitHub Pages site passed actual 17-archive import, isolation, commander restoration, native skirmish/name, mouse movement, completed barracks and clean exit/relaunch, without page errors or missing resources.
- Default Windows Chrome also passed the complete solo flow. The actual engine worker reports `ANGLE (Intel, Intel(R) Graphics (0x0000A7AB) Direct3D11 vs_5_0 ps_5_0, D3D11)`; this run did not force SwiftShader.
- Backup cancellation returned control without an incomplete download. The full 1,738,014,782-byte ZIP downloaded locally; all 17 entries pass CRC validation and match original SHA-256 hashes byte-for-byte. Extraction and import on a second physical device are not established by this comparison.
- The actual published Create room control sent the installed content fingerprint over secure WSS. Two published endpoint modules discovered through the approved Cloudflare Nostr service and exchanged exact datagram bytes in both directions. This verifies public service components separately from full engine gameplay on different networks.
- Headerless static hosting at `/zero-hour-web/` passed service-worker isolation, SharedArrayBuffer availability, relative module loading and commander restoration in a fresh Chrome profile.
- The dedicated OPFS directory and storage-key namespace passed a shared-origin preservation check: another product's directory remains intact, its keys are hidden from this product, and scoped clearing preserves its original value.
- Upstream source ZIP contents were inspected. Seven unused Windows DLL/compiler binaries and 75 unused native/editor and upstream website images were excluded from the public copy; 7,452 source entries, original notices and six generic library placeholder/gradient textures remain. Only upstream website packaging tools reference removed brand filenames; the standalone threaded-engine build does not use those packaging tools. Checks verify published source hashes, runtime hashes and ZIP entry boundaries.

Initial failures were corrected: the loading overlay's author CSS overrode `hidden`; native menu activation raced transitions; the verifier initially checked the wrong gameplay-state field and raced iframe navigation. These are recorded separately from engine failures.

Private evidence is under `.local/*verification.json` and `output/playwright/`. These files and gameplay captures are excluded from Git and hosting.

## Remaining gates

Real Mac graphics, a completed multiplayer match on separate computers/networks, longer multiplayer reliability, a completed solo match, audible playback, second-device ZIP extraction/import and a fresh compiler rebuild remain pending. A menu, room list, fixture or checksum is not gameplay proof.

Browser automation used headless Windows Chrome with explicit SwiftShader for public solo and local multiplayer, and the default Intel D3D11 hardware renderer for a separate complete solo run. Audible playback, macOS and two physical computers are unverified.

An earlier default-renderer LAN run failed during native menu entry before the menu reveal fix; the later default-renderer solo run passed. No macOS device is available in this environment; the earlier Mac corruption report cannot be reproduced or resolved here without actual Mac diagnostics. Compiler rebuild instructions are provided, but a fresh Docker engine rebuild has not been run for this release.

## Separate-device acceptance

Use matching compatible archives on both computers. Import independently on the deployed HTTPS origin. On Windows Chrome and Mac Chrome, record exact browser version, macOS version, GPU and hardware-acceleration state. First run Alpine Assault solo against one Easy Army, select/move a worker, and complete a building. Capture a local diagnostic download while the actual battlefield is visible. If Mac renders black/white or corrupted geometry, repeat with Compatibility mode and then Shader effects and preserve both reports/captures.

After both solo gates pass:

1. Put the computers on different internet networks. Keep this PC's approved temporary service/tunnel running. Open https://mustafamarroun-glitch.github.io/zero-hour-web/ on both computers and restore/import matching files under distinct commander names.
2. Host creates a room and shares its invite. Guest joins. Verify both names and matching fingerprints, then both click Enter game room and wait for `2/2 engine players`.
3. Select Alpine Assault, opposing factions/teams and different colors. Wait for the final settings to match on both engines. Guest clicks Ready, then host clicks Ready; if changing a setting resets readiness, ready again. Host starts only when both original players report accepted and map availability.
4. Wait for actual terrain and an advancing frame counter. Each player selects/moves a worker and completes a building while the other observes. Download diagnostics on both clients during active gameplay.
5. Complete a normal match. Verify both report the same winner and no CRC mismatch; record disconnect/reconnect behavior. A reconnect may require leaving the room and starting a new match; mid-match resume is not verified.

This is the final internet acceptance gate. The current same-PC tests do not establish NAT traversal on different networks, a TURN fallback, Mac graphics or full-match reliability.
