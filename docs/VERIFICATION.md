# Independent acceptance record

Updated 2026-10-04. The source project's earlier results are context only; the following checks concern Zero Hour Web.

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
- The subsequent original movement order was accepted but the worker did not move within 120 seconds. Sustained synchronization has NOT passed. Later launches also intermittently failed to finish native lobby entry; diagnostics and recovery work remain ongoing.
- Headerless static hosting at `/zero-hour-web/` passed service-worker isolation, SharedArrayBuffer availability, relative module loading and commander restoration in a fresh Chrome profile.
- The dedicated OPFS directory and storage-key namespace passed a shared-origin preservation check: another product's directory remains intact, its keys are hidden from this product, and scoped clearing preserves its original value.
- Upstream source ZIP contents were inspected. Seven unused Windows DLL/compiler binaries were excluded from the public source copy; 7,527 source entries and original notices remain. Checks verify published source hashes, runtime hashes and ZIP entry boundaries.

Initial failures were corrected: the loading overlay's author CSS overrode `hidden`; native menu activation raced transitions; the verifier initially checked the wrong gameplay-state field and raced iframe navigation. These are recorded separately from engine failures.

Private evidence is under `.local/*verification.json` and `output/playwright/`. These files and gameplay captures are excluded from Git and hosting.

## Remaining gates

Sustained synchronized multiplayer, real Mac graphics, hardware-renderer gameplay, separate-network completion, a completed solo match, audible playback, full-size ZIP migration and public HTTPS gameplay remain pending until specifically recorded below. A menu, room list, fixture or checksum is not gameplay proof.

The current browser automation uses headless Windows Chrome with explicit SwiftShader. This establishes Windows engine functionality with software rendering; it does not verify an RTX hardware path, audible playback, macOS or two physical computers.

A separate default-renderer run failed to reach the host's native LAN lobby. This is a navigation failure, not proof of a specific GPU rendering defect. No macOS device is available in this environment; the earlier Mac corruption report cannot be reproduced or resolved here without actual Mac diagnostics. Compiler rebuild instructions are provided, but a fresh Docker engine rebuild has not been run for this release.

## Separate-device acceptance

Use matching compatible archives on both computers. Import independently on the deployed HTTPS origin. On Windows Chrome and Mac Chrome, record exact browser version, macOS version, GPU and hardware-acceleration state. First run Alpine Assault solo against one Easy Army, select/move a worker, and complete a building. Capture a local diagnostic download while the actual battlefield is visible. If Mac renders black/white or corrupted geometry, repeat with Compatibility mode and then Shader effects and preserve both reports/captures.

After both solo gates pass: use different internet networks, create a room, share its invite, verify distinct names in the native player list, choose opposing factions/teams and distinct colors, select Alpine Assault, ready both players, and start as host. Each player moves a unit and builds a structure while the other observes. Complete a normal match, verify the same winner and absence of CRC mismatch, and record reconnect/disconnect behavior. This is the final internet gate; two local profiles are only preliminary evidence.
