# Independent acceptance record

Updated 2026-10-07. The source project's earlier results are context only; the following checks concern Zero Hour Web.

## Version 2.3 stream experience

The Version 2.2 source/site backup under
`output/backups/Zero-Hour-Web-v2.2.0-20261007T011839Z/` passed ZIP CRC,
restored SHA-256 comparison for every entry, and complete Git-bundle verification.
Its commit is `18b2f233fbb2b6ca3220538752ed4b3189e8d58a`.
Private browser profiles/imports/saves were retained separately, not published.

Windows Chrome 154.0.8037.99 passed the synthetic H.264/AAC receiver regression:
Internet invite selection, real 480p playback, remembered audio/quality,
selection dragging and modifier/control-group input traces, focus release,
F8/fullscreen tools, ignored letterbox clicks, live quality switching,
bounded reconnect and cancellation, occupied-session handling, report download,
missing host metrics, recording cancellation and privacy filtering. Desktop and
390px layouts were inspected and their welcome/tool overlap corrected.
The synthetic WebRTC report regression also passed all three marker probes,
visibility interruption, reconnect/cancellation and unavailable-stat paths.
These fixture checks do not prove actual game behavior or GPU/Mac performance.

The actual Windows/WSL stack passed NVIDIA rendering, Chromium WebGL and the
private TURN data-channel exchange. Two-second NVENC/AAC encode/decode checks
passed 480p30 (60 video frames), 720p30 (60) and 720p60 (120), with both tracks
starting at zero. This is isolated desktop component evidence, not a match.

The actual same-PC HTTPS receiver passed authentication/origin guards,
single-receiver limits, scaled input mapping to the 1280x720 X11 desktop,
480p30 decode and reconnect into 720p30. A ten-second real-host report measured
about 29.9 receiver playback/displayed FPS, 30.5 FFmpeg encoder FPS and a mean
672 ms playback buffer. The preceding four-second observation processed 120
video frames without additional drops. HTTPS input-to-picture latency remains
unavailable; the buffer value is not a latency measurement.

The same-PC WebRTC receiver report measured about 60 decoded/displayed FPS and
60 capture/encode FPS. Three copied-video marker probes measured 46–57 ms of
stream-path response. These exclude game simulation, physical input and monitor
scanout, and cannot establish latency on the Mac or over the Internet. Host
session cleanup passed after disconnect. Private evidence remains under
`.local/streaming/internet-verification/`, `experience-verification/` and
`report-verification/`; screenshots remain in `.impeccable/review/`.

An early aggressive catch-up policy repeatedly sought and reduced receiver
throughput to roughly 7 FPS while its encoded track retained 30 FPS. Small
playback-rate corrections subsequently dropped many frames. A fixed-clock
comparison restored 30 FPS; the final uninstrumented receiver retained it.
The final policy keeps 1x playback, an 800 ms seek threshold, 350 ms target
and two-second seek cooldown. A 650 ms trial still dropped frames and was
rejected. No decoder-rate promise is inferred from encoder counters.

**Remaining acceptance:** a separate computer/network, Mac playback, audible
audio and audio/video sync, a busy battle and complete two-human match,
sustained Internet 720p60, and real game-command response timing. Public TURN,
stable hostnames, more streamed guests and native mid-match recovery remain
outside this release. This iteration did not start a public streaming tunnel.
The project test services were stopped afterward while retaining imports,
profiles, saves and private credentials.

Developer checks: `node tools/streaming/test-policy.mjs`, `test-report.mjs`,
`test-address.mjs`, `verify-experience.cjs`, `verify-report.cjs` and
`verify-internet.cjs`; Python marker/gate tests and duplicate input/video/audio
cleanup tests using the actual class methods with test doubles; script parsing; pinned
runtime/source and publication-boundary checks; corresponding-source packaging.

## Version 2.2 Internet streaming

The actual Windows/WSL startup passed NVIDIA rendering, Chromium WebGL,
NVENC and private relay-only game data-channel exchange. Its Internet
encoder preflight captured a two-second isolated desktop sample containing
60 H.264 video frames and AAC audio, with both tracks starting at zero and
approximately two-second durations; FFmpeg decoded both tracks successfully.
This is component evidence, not native gameplay or physical audio acceptance.

Chrome 154 on this PC decoded the real 1280 × 720 GPU stream through a
Cloudflare public HTTPS tunnel using the low-bandwidth 30 FPS preset. The
short observation advanced 4.02 seconds and decoded 120 frames. A mouse move
sent through that public receiver reached the expected coordinates in the
isolated X11 display. Unauthenticated HTTP/WebSocket requests, cross-origin
POST/WebSocket requests and a second concurrent receiver were rejected.
Disconnect and fresh reconnect passed. The bounded test then stopped the
tracked public tunnel and all three project streaming containers, retaining
imports, profiles and saves. Private evidence:
`.local/streaming/internet-verification/public.json` and receiver capture under
`.impeccable/review/stream-public-receiver.png`.

Local HTTPS receiver playback also passed. Website checks covered Stream game
navigation without a commander/import, invalid-address recovery, invite
prefill and a 390px layout without horizontal overflow. The desktop/mobile
interface review's SVG-arrow fix was scored resolved; the extension retained
the existing visual system. Existing synthetic WebRTC diagnostic-report tests
still passed, including three video-marker probes, cancelled recordings,
reconnects, unavailable metrics and privacy filtering. Script syntax, pinned
engine/source checksums, PowerShell/Python parsing and packaging passed.

Early checks exposed unaligned video/audio startup clocks, Windows-excluded
UDP ranges and public upload limits. Frame clocks now start together, the LAN
ports avoid those exclusions, slow clients release their encoder/session slot,
and Internet offers lower-bandwidth presets. Tunnel startup waits for the
public endpoint's actual authentication challenge before printing an invite.

This receiver was on the hosting PC using the public network path. A separate
computer/network, a Mac decoder, full two-player match, physical audio and
input-to-picture gameplay latency remain unverified. The 720p60 Internet
preset is available but has no successful WAN performance acceptance on this
connection. HTTPS streaming remains experimental, with temporary per-start
invites and a host laptop that must remain on during play.

## Yuri’s Revenge addition

Local checks passed for navigation/importer at 1440px and 390px, incomplete-file errors, cross-origin isolation, focus and safe exit, existing cache/preference preservation, and session URL configuration. Actual player-owned import reached the original Single Player → Skirmish battlefield on The Alamo, with six native live local-player units, continuing frames and visually confirmed unit selection. That run had no page errors, missing resources or file uploads. Binary relay discovery/forwarding/session separation passed with synthetic traffic.

After reboot, the launcher/relay checks passed again and two independent Chrome sessions entered a real native Network match through the site's compiled Yuri runtime and localhost:8093 relay. MCV deployment synchronized in both directions, with approximately 1.72/1.98-second observations, and simulation advanced through a 20-second observation without closed relay connections. This was same-PC, short-match acceptance. The test enters the runtime route directly; launcher invite configuration was checked separately. See [YURI.md](YURI.md) for browser-only INI preferences, read-only probes, reproducibility and initial verifier failures. Native evidence is `output/playwright/ra2-peer-discovery-IoSYny/result.json` and companion captures/performance reports; UI-only reports now use `.local/yuri-ui-verification.json`.

Yuri sustained/complete matches, movement, save reload, audio correctness, mobile/Mac and separate-computer internet play remain unverified. The shared-setup preview is now published; the current HTTPS acceptance is recorded below.

## Version 2.1 acceptance

- Actual browser removal deleted all installed archives and cleared the manifest. A simulated filesystem refusal retained the manifest and allowed retry. Reload returned to import while preserving commander identity, an app-local stored-data sentinel and another product's OPFS data.
- Transient installed-file read failure, file-size mismatch and corrupt records retained archives. Cached launch paths were cleared on failure; retry succeeded. An unreadable record blocks ambiguous cleanup and remains protected in the inventory. Explicit Settings removal recovers unreadable records, while active file locks prevent removal. Importer source/art caches are now product-scoped; cleanup left the ambiguous legacy shared IndexedDB sentinels intact. Extraction leftovers contribute to the usage estimate.
- Stale installation, temporary launch and archive-extraction roots were removed. Active extraction and installation locks prevented deletion. The current installation remained valid and launched afterward.
- A full real ZIP reimport restored 17 archives. Browser reload reused the installation. Cancelled RAR extraction, malformed ZIP replacement and cancellation during actual OPFS saving retained the previous installation.
- The original native Exit Game button returned to the launcher with confirmed fresh final save flushing and runtime destruction. Website match exit supported confirmation/cancellation, flushed saves and returned. Installed files survived relaunch.
- A simulated final-save failure returned with a save warning. A simulated loop-stop failure terminated the actual worker with strict quiescence evidence before fresh save flushing. A simulated unresponsive shutdown offered Force close; confirmation returned control, retained the installation and allowed another normal launch/exit.
- Real Alpine Assault terrain rendered on the Windows hardware renderer. Live 1600 × 900 rendering and Actual size maintained 16:9 at three viewport sizes; native mouse input selected and moved an actual builder by more than 20 world units after resize.
- Desktop/mobile settings had no horizontal overflow and retained a visible Close button while scrolling. Copy/download diagnostics included version 2.1.0, recent errors and engine display/renderer information. A simulated newer version was detected, and applying it was blocked while playing. Current-site version checking passed; publication of a future update is outside this local test.
- Main and follow-up reports passed without page errors. The main run had no missing resources. The first follow-up verifier attempt raced website readiness and camera settlement; the corrected verifier waits for both. Reports are `.local/version-21-verification.json` and `.local/version-21-followup-verification.json`; private captures are `output/playwright/v21-*`.

- The unchanged archived 2.0 site created a real original-engine Alpine Assault save through Save/Load. Serving 2.1 at the same origin/profile retained the installed root, commander, music and edge-scroll settings, and identical save bytes. The native Load menu restored the real battlefield and local units. Removing/reimporting the retail archives preserved that save, which loaded again. Reports are `.local/version-21-storage-verification.json` and `.local/version-21-upgrade-verification.json`.

Verifier issues are recorded separately: a reused disposable Chrome profile closed during diagnostic download, a rerun toggled an already-open recovery panel closed, and the upgrade harness waited on a failed child-server restart. Verification now creates a fresh main profile, checks panel visibility and switches 2.0/2.1 roots inside one local server. These corrections do not change the game runtime.

These are headless Windows Chrome checks on one PC. Native saved-match restoration and shutdown flushing were verified separately from storage fixtures. The remaining gates below still apply. The GitHub Pages workflow checks/packages the release before publication; hosted acceptance is recorded separately.

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

### Published Yuri setup preview — October 4, 2026

GitHub Pages workflow [37217220727](https://github.com/mustafamarroun-glitch/zero-hour-web/actions/runs/37217220727) deployed commit `37ab25b` successfully after Linux syntax, module, package and pinned-runtime/source checksum checks. The actual [Yuri HTTPS route](https://mustafamarroun-glitch.github.io/zero-hour-web/yuri/) then passed all 16 shared setup checks, including real folder/files/RAR/ZIP installation, reload, backup, failure/cancellation recovery, removal preservation, public room compatibility and original native-menu rendering without a second picker. There were no page errors, missing resources or uploads in that run. Report: `.local/yuri-public-setup-verification.json`.

The deployed Zero Hour Create room control and bidirectional WebRTC datagrams passed through the new public service. Synthetic Yuri discovery, binary forwarding and session separation also passed over public WSS. These are component checks, not complete internet matches. The preview service runs on localhost:8096 through a temporary Cloudflare tunnel; this PC must stay awake for multiplayer. Git checkout normalization initially changed inventoried runtime bytes; `.gitattributes` now preserves them, and committed-file inventory comparisons and the Linux release checks both passed. An initial Git upload timed out; the subsequent non-forced push succeeded.

### Yuri shared setup acceptance — October 4, 2026

`node tools/verify-yuri-setup.cjs` passed 16 checks using the actual movie-free Desktop RAR and a nested DEFLATE ZIP from the same 166-file installation. Complete-folder and individual-file pickers also installed the real files and restored after reload. A quick-selection startup lock race was found and fixed by awaiting the initial storage check before import. Both archive import and replacement survived reload. The downloaded installation backup passed CRC and SHA-256 comparison against source for every entry, retaining music, all 53 map files and the required empty movie MIX. Cancelled backups/imports, malformed archives, simulated quota refusal and a synchronous delete failure after deletion was queued retained the previous library. Cross-tab locks blocked removal while files were held by a game. Confirmed removal survived reload while retaining commander, Yuri preferences, actual save-database/custom-map sentinels and unrelated OPFS files. Zero Hour preferences remained unchanged. No page errors, missing resources or uploads were observed in this Yuri run.

The shared create-room UI exposed an eight-character code. A separate WebSocket peer using the actual installed content fingerprint joined with a matching runtime and internal relay code; a Zero Hour peer was rejected. This is room-service acceptance, not a new native multiplayer match. Launch rendered the original native Yuri menu from the website installation without a second picker, then cancel/confirmed exit returned correctly. The website audio/scroll values reached browser-local RA2MD.INI. Audible correctness and full gameplay remain outside these checks.

Reports: `.local/yuri-setup-verification.json`, `.local/archive-safety-verification.json`, `.local/browser-verification.json`. The shared archive-safety suite passed nine cases, and Zero Hour's actual import, restored library and compiled engine boot passed after the shared controller changes. That boot report includes cancelled engine fetches on unload, so it is not a zero-network-failure or new full-match claim. Final captures compare Yuri entry/setup/library/settings with Zero Hour setup/settings at 1440px and 390px in `.impeccable/review`. These checks are local Windows Chrome acceptance; no publication or remote Drive archive validation occurred.

Real Mac graphics, a completed multiplayer match on separate computers/networks, longer multiplayer reliability, a completed solo match, audible playback, second-device ZIP extraction/import and a fresh compiler rebuild remain pending. A menu, room list, fixture or checksum is not gameplay proof.

Browser automation used headless Windows Chrome with explicit SwiftShader for public solo and local multiplayer, and the default Intel D3D11 hardware renderer for a separate complete solo run. Audible playback, macOS and two physical computers are unverified.

An earlier default-renderer LAN run failed during native menu entry before the menu reveal fix; the later default-renderer solo run passed. No macOS device is available in this environment; the earlier Mac corruption report cannot be reproduced or resolved here without actual Mac diagnostics. Compiler rebuild instructions are provided, but a fresh Docker engine rebuild has not been run for this release.

## Separate-device acceptance

Use matching compatible archives on both computers. Import independently on the deployed HTTPS origin. On Windows Chrome and Mac Chrome, record exact browser version, macOS version, GPU and hardware-acceleration state. For dual-GPU MacBook Pros, connect power and test with automatic graphics switching disabled. First run Alpine Assault solo against one Easy Army, select/move a worker, and complete a building. Capture a local diagnostic download while the actual battlefield is visible. If Mac renders black/white or corrupted geometry, try the low-GPU preset and preserve its report/capture before comparing Compatibility mode and Shader effects. If WebGL context loss occurs, use Exit game instead of refreshing, then preserve the diagnostics.

After both solo gates pass:

1. Put the computers on different internet networks. Keep this PC's approved temporary service/tunnel running. Open https://mustafamarroun-glitch.github.io/zero-hour-web/ on both computers and restore/import matching files under distinct commander names.
2. Host creates a room and shares its invite. Guest joins. Verify both names and matching fingerprints, then both click Enter game room and wait for `2/2 engine players`.
3. Select Alpine Assault, opposing factions/teams and different colors. Wait for the final settings to match on both engines. Guest clicks Ready, then host clicks Ready; if changing a setting resets readiness, ready again. Host starts only when both original players report accepted and map availability.
4. Wait for actual terrain and an advancing frame counter. Each player selects/moves a worker and completes a building while the other observes. Download diagnostics on both clients during active gameplay.
5. Complete a normal match. Verify both report the same winner and no CRC mismatch; record disconnect/reconnect behavior. A reconnect may require leaving the room and starting a new match; mid-match resume is not verified.

This is the final internet acceptance gate. The current same-PC tests do not establish NAT traversal on different networks, a TURN fallback, Mac graphics or full-match reliability.
