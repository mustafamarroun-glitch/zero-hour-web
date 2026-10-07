# Stream Zero Hour on Wi-Fi or over the internet

## Version 2.3 receiver improvements

The verified Version 2.2 source/site restore point is under
`output/backups/Zero-Hour-Web-v2.2.0-20261007T011839Z/`. Its ZIP entries passed
CRC and restored SHA-256 verification, and its complete Git bundle verified.
Read its RESTORE.txt; extract into a new folder and retain the original private
stream profile, imports, passwords and saves separately.

Internet now defaults to **Auto**. It starts with **Data saver · 480p30**
(854x480, 350 kbps video plus up to 64 kbps AAC audio). Healthy visible playback
for 30 consecutive samples permits a cautious trial of **Balanced · 720p30**
(1 Mbps), then **Smooth · 720p60** (2 Mbps by default). Three poor samples
lower quality; upgrade trials have a 90-second cooldown. This estimates playback
health, not spare upload capacity. Manual presets stay fixed. Quality changes
briefly reconnect video without relaunching the hosted game. Input coordinates
continue to map to the full 1280x720 desktop in the smaller data-saver stream.

Internet playback keeps a fixed 1x clock. Catch-up seeks start above 800 ms,
target 350 ms of remaining video, and are separated by two seconds. Repeated
seeks and small playback-rate changes had reduced receiver throughput in real
Chrome even though the encoded track retained 30 FPS. These values
are playback buffer targets, not input-to-picture latency measurements.

Interrupted Internet playback retries at most three times (1.5, 3 and 6 seconds).
Disconnect cancels pending retries and report recordings. An occupied session,
rejected login or unsupported codec stops automatic retries and explains the
next action. A successful 15-second connection resets the retry budget.
Wi-Fi failures keep their explicit reconnect guidance. Video reconnect does not
prove that a disconnected native multiplayer match can resume.

**Stream tools / F8** shows quality, volume/mute, fullscreen and the report
button, including inside fullscreen. **Alt+Enter** toggles fullscreen. Escape
leaves fullscreen; a subsequent Escape reaches the game. Receiver volume,
mute and quality are remembered locally. Addresses/passwords are not saved.
Clicks in black letterbox areas cannot issue orders; dragged coordinates clamp
to the picture, pointer movement is coalesced, and focus/tab changes release
held controls. Host input connections close when each receiver session ends.

**Save diagnostic report** works in both modes. Internet reports include
receiver video counter estimates, displayed FPS when frame callbacks exist,
buffer, bitrate, drops, WebSocket RTT and actual FFmpeg encoder progress where
available. Missing counters stay null; LAN encode/capture counters are excluded
from Internet reports. HTTPS has no copied-video marker support, so input delay
is explicitly unavailable rather than derived from RTT. Reports are local JSON
downloads with no screenshots, recordings, game files, credentials or addresses.
Wi-Fi keeps the existing copied-video-marker diagnostic below.

Restart through the normal launcher to load host code. Do not restart only the
friend container: Docker sidecars share its network namespace and need the
launcher's coordinated recreation. No public tunnel is started by the local
verification commands. See VERSION_2_3.md and VERIFICATION.md for release scope
and the remaining separate-device/full-match acceptance.

## Internet streaming (Version 2.2)

The website’s **Stream game** link opens `/stream/`. The guest pastes the
host’s HTTPS address or uses a website invite with `?host=<encoded-address>`.
The page identifies the host before navigation. Passwords remain separate from
URLs and the static website; no game installation is needed on the receiver.

On Windows, start Docker Desktop and double-click **Start Zero Hour Internet
Streaming.cmd**, or run:

```powershell
.\Start-InternetStreaming.ps1
```

The launcher uses the same GPU-tested isolated Chromium session, tests a
two-second desktop H.264 NVENC/AAC encode and decode, then starts a separate
Cloudflare Quick Tunnel to the authenticated receiver on Windows loopback
port 3002. The existing preview multiplayer tunnel is left alone. The verified
connector cached under `.local/preview-server/` is reused, or an installed
`cloudflared` is used. No router forwarding or Windows Firewall changes are
required for this HTTPS transport. The laptop’s local game and container game
continue to use their private LAN game relay.

Share `.local/streaming/INTERNET-INVITE.txt` **privately**. It contains the
website invite, direct stream address, username and generated 32-character
password. New streaming starts upgrade the former four-digit LAN password;
later starts retain the private password. Choose **Internet · HTTPS**, then
**Connect** on the receiving page. Click the picture for sound and control.
You continue playing at `http://localhost:8098/`; the friend controls only the
container desktop. Import `/mnt/zero-hour` once in that streamed browser, then
join the same game room as the local player.

The Internet transport sends live fragmented MP4 with GPU H.264 video and AAC
audio through an authenticated WebSocket. Mouse/keyboard messages share that
connection. It bypasses the private-only WebRTC candidates and does not require
a public TURN account. Same-Wi-Fi receivers can still choose WebRTC for lower
buffering and its existing diagnostic report. Internet playback reports actual
buffer depth, received bitrate and WebSocket RTT; these are not game input
latency measurements. Stale buffers are bounded and slow senders disconnect
instead of indefinitely queuing old frames. One receiver is allowed across both
transports. HTTP and WebSocket access require the private login, and state
changes/upgrade requests enforce the receiver’s same origin.

Internet quality now starts with **Auto · Data saver · 480p30**: 350 kbps H.264
and up to 64 kbps AAC. **Balanced** targets 720p30 at 1 Mbps; **Smooth**
targets 720p60 at 2 Mbps. Quality can change while connected. Data saver reduces
fine detail; raise quality only when the host’s upload and receiver’s download
can sustain it. The smooth preset bitrate is configurable
with `ZH_INTERNET_BITRATE` in `compose.streaming.wsl.yaml`. LAN WebRTC keeps its
720p60 / 8 Mbps configuration. All rates are targets rather than game-performance
guarantees. Independent video/audio clocks start at zero; the encoder preflight
checks real frame progression, not merely a valid first frame.

**Stop Zero Hour Streaming.cmd** / `.\Stop-Streaming.ps1` stops this stream’s
tracked tunnel as well as its Docker services, while retaining profiles,
imports and saves. Tunnel identity includes process start time, preventing a
reused process ID from stopping another service. Restarting Internet streaming
creates a fresh invite; the laptop must stay on and awake. Quick Tunnels are
temporary development endpoints, so the invite is not a permanent hosted game
service. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
and [FFmpeg’s fragmented MP4 options](https://ffmpeg.org/ffmpeg-formats.html).

Windows/WSL uses UDP 21064 for LAN stream media and 21000–21063 for the private
game relay, avoiding this laptop’s Windows/Hyper-V exclusions around 49152 and
50000. These LAN ports still bind only to the selected private address. HTTPS
Internet streaming itself uses the loopback origin and outbound tunnel.

Developer validation: `node tools/streaming/test-address.mjs`,
`node tools/streaming/verify-internet.cjs` (with Playwright available), and the
container’s `test-internet-encoder.py`. `ZH_STREAM_TEST_URL` targets a public
tunnel instead of local HTTPS. A same-PC receiver through a public tunnel can
prove that path works, but cannot establish separate-network gameplay, Mac
decoder performance, acceptable latency or a completed two-player match.

On 2026-10-07, the low-bandwidth public-tunnel test passed real Chrome video
decode, remote X11 pointer control, authentication/origin guards, the
single-receiver limit and reconnects. The host was stopped afterward. See
[the Version 2.2 acceptance record](VERIFICATION.md#version-22-internet-streaming)
for exact observations and remaining physical-device/gameplay limits.

## Same-Wi-Fi streaming

This setup streams one separate Zero Hour browser session from your Windows
laptop to a friend’s Mac on the same Wi-Fi. You keep playing locally in your
normal Windows browser. Your friend receives the game’s video and audio in a
Mac browser and sends mouse and keyboard input to a separate Linux container
display. The container uses the laptop’s NVIDIA GPU for Chromium rendering and
NVENC video encoding. The existing web game still supplies multiplayer rooms
and the match protocol.

## What has been proven

On 2026-10-05, a disposable Docker probe on this Windows laptop rendered an
OpenGL red pixel through `D3D12 (NVIDIA GeForce RTX 3050 6GB Laptop GPU)`. The
same WSL configuration rendered a real Chromium WebGL pixel on that GPU. FFmpeg
encoded 120 synthetic 1920 × 1080 frames at 60 fps with H.264 NVENC. The bridge’s
PyAV NVENC encoder also produced H.264 packets from a real test frame.

Those checks confirm that WSL can expose this GPU to the replacement streaming
path. They do not measure Zero Hour, a Mac’s decoder, real Wi-Fi playback, or
input-to-picture delay. The older Selkies CUDA/EGL encoder path failed under
WSL, so the Windows launcher now uses an isolated Chromium, X11 capture and a
WebRTC bridge with an NVENC-only encoder. It fails closed if NVENC cannot start.

The optimized memory-mapped Xvfb capture and direct BGR0-to-NVENC path also
captured and encoded 600 of 600 frames over ten seconds at a 1920 × 1080, 60 fps
target while the streamed browser was idle. Capture time was 0.68 ms median and
0.95 ms p95; encoder calls were 8.58 ms median and 14.74 ms p95. This measured
the capture and encoder stages inside the container. It did not include a LAN
receiver, the Mac’s hardware decoder, a real match, or end-to-end frame
presentation, so it does not prove that the full session holds 60 fps.

## Start

Start Docker Desktop in Linux-container mode. In PowerShell, from this project
directory, run:

```powershell
.\Start-Streaming.ps1 -LanAddress 192.168.1.67
```

Use this laptop’s current private Wi-Fi address if it differs. The launcher
builds a project-local streaming image from the already-cached Chromium image,
runs three disposable capability checks, pins the passing image ID, configures
a private `saddam` login with a generated password, and starts only this project’s
container and its Zero Hour site sidecar. It does not install Linux, repartition
a disk, change the display driver or open Windows Firewall ports. Keep the
laptop plugged in and awake.

The default game-data path is the installed Zero Hour `Data` folder. If yours is
elsewhere, pass it explicitly:

```powershell
.\Start-Streaming.ps1 -LanAddress 192.168.1.67 -GameDirectory 'D:\Games\Generals Zero Hour\Data'
```

You open `http://localhost:8098/` in your usual Windows browser and import your
local Data folder. Your friend opens the printed `https://<laptop-LAN-IP>:3001/`
address on the Mac and signs in with username `saddam` and the password in
`.local/streaming/password`. The
certificate is generated locally for your laptop’s LAN address; the Mac browser
will ask you to trust it. In the streamed Zero Hour browser, import
`/mnt/zero-hour` once. Both players import matching files and join the same
multiplayer room.

Windows/WSL streaming keeps its active game in a separate persistent Chromium
profile named `chromium-lan`, avoiding stale container locks. The earlier
Chromium profile remains stored untouched. The new profile needs the one-time
`/mnt/zero-hour` import before joining.

For an already-running older Windows/WSL stream, run
`.\Enable-PrivateTurn.ps1` from PowerShell in the project directory. It briefly
restarts the stream container, enables the LAN-only relay, and sets the same
login. The friend will need to reconnect and sign in again.

The container’s Chromium display and profile are separate from Windows. The
friend can play while you use your local keyboard and mouse. Click the streamed
picture to control it, use **Full screen** for play, and select 1280 × 720 in
both game sessions. The stream defaults to 1280 × 720 at 60 fps and 8 Mbps to
reduce capture, encode and Wi-Fi load. Disconnecting releases held inputs. Stop
the session from PowerShell when the match is finished:

```powershell
.\Stop-Streaming.ps1
```

Stop retains the friend browser profile, imported files and game saves. It does
not delete the private password or certificate. The friend page reports
measured decoded and displayed video fps and WebRTC round-trip time. RTT is not
the same as input-to-picture delay.

## Collect a private match report (Windows/WSL bridge)

1. Finish/leave any previous match. From PowerShell in this project, run
   `.\Stop-Streaming.ps1`, then `.\Start-Streaming.ps1 -LanAddress <current-private-Wi-Fi-IPv4>`
   with Docker Desktop running. The stop/start refreshes the bridge and its diagnostics
   code while retaining imports, profiles and saves. Use the `-GameDirectory` option
   from **Start** if needed. Both devices must be on the same LAN.
2. Reload `http://localhost:8098/` on Windows. On the Mac, close the old friend
   receiver tab, open the newly printed `https://<laptop-LAN-IP>:3001/`, sign in
   using the launcher’s local login, and click **Connect**. Import `/mnt/zero-hour`
   in the streamed browser if this profile has not imported it yet.
3. Reload both game clients so they fetch the current private TURN configuration.
   Create a **new** multiplayer room and join it from the streamed friend game.
   Use matching game files and 1280 × 720 in both games. Start a small match;
   confirm both humans see a battlefield and can select/move their own units.
   A visible lobby or stream connection alone does not confirm this.
4. Keep the Mac receiver tab visible. Press Escape to leave receiver full screen
   if necessary, then click **Save diagnostic report** once on the **Mac receiver**.
   It records about ten seconds and requests a local JSON download. Click the
   streamed picture again to continue playing during recording. Three brief
   black/white markers may appear in the picture’s top-left 48 × 48 pixels.
   Avoid switching tabs/minimizing the browser. Wait for the download message;
   check the Mac browser’s Downloads list (allow this site’s download if asked).
5. Keep `zero-hour-stream-<UTC-timestamp>.json` on the Mac. Each click creates a
   fresh observation window; reconnecting creates a new report session ID.
   To keep a private host-side copy, manually copy the JSON to this project’s
   ignored `.local/streaming/` folder. There is no automatic upload or host save
   endpoint. Stop with `.\Stop-Streaming.ps1` after the match.

The report reuses `window.ZeroHourStreamDiagnostics` and authenticated `/metrics`.
It contains per-interval decoded FPS, displayed FPS from video-frame callbacks,
selected WebRTC candidate-pair RTT, receiver frame/drop/loss/decoder fields, host
capture and encoded frame rates, last capture/encode times, configured size/rate,
encoder health, and host outbound byte/packet counters and receiver-feedback RTT
when available. Host timings are the latest observations, not per-frame
distributions. The report includes sample timestamps, window duration, summaries,
and explicit unavailable reasons. Missing browser counters remain `null`, with
summary counts of zero; missing host metrics do not prevent receiver reporting.
Tab hiding marks the report interrupted and suppresses affected displayed-FPS
samples. Disconnect cancels the recording and discards its samples; reconnect
and click again. A stream without usable video stats cannot produce a success report.

**Input-to-visible-response estimate:** an opt-in diagnostic message follows the
same ordered input DataChannel as mouse/keyboard messages. The host paints a
random-token marker into a copied capture frame before encoding. The receiver
reads only that 48px video region while a probe is pending and measures time from
message send to its detection in a video-frame callback, using only the receiver
clock. It clears the marker after detection; the host also expires it after two
seconds. The game framebuffer and simulation are untouched. A timeout, older
host, hidden tab, missing frame-callback API or blocked canvas readback yields
`unavailable` with a reason, never an RTT-derived latency value. The measurement
includes input-channel transit, capture scheduling, encode, video transport,
decode and browser presentation scheduling. Callback/readback delay can raise
the estimate. It excludes game simulation/command response, physical keyboard or
mouse delay and physical monitor scanout. It is a **stream-path probe**, not a
measurement of a unit reacting to a real game command.

Displayed FPS counts frames submitted for browser composition; it cannot prove
physical display scanout. RTT is a network round trip, not input latency. See the
[WebRTC statistics definitions](https://www.w3.org/TR/webrtc-stats/) and
[video-frame callback timing](https://wicg.github.io/video-rvfc/).
No screenshots, video recordings, input contents, SDP, ICE addresses, URLs,
credentials, retail assets, saves or profiles go into the report. It does include
browser/version information (`userAgent`) to help identify Mac decoder behavior.
Reports stay on the receiver unless you manually copy/share them. Do not add them
to `public/`, `release/`, Git or GitHub Pages.

Local verification uses an explicitly synthetic loopback WebRTC video source and
fixture host stats to check collection, marker detection, privacy filtering,
download and reconnect/error handling. It does **not** establish host NVENC/game
performance, Mac playback, acceptable latency or a completed two-human match.
The real Mac match and downloaded report remain the acceptance steps above.

Developer checks: `node tools/streaming/test-report.mjs`,
`python tools/streaming/test-marker.py`, and `node tools/check.mjs`.
With Playwright available to Node, run `node tools/streaming/verify-report.cjs`.
It starts an ephemeral loopback HTTP fixture, opens isolated headless Chrome,
collects three local JSON reports, verifies failure/reconnect behavior, and closes
its server/browser. Outputs are ignored under
`.local/streaming/report-verification/`; UI captures go under
`.impeccable/review/stream-report-*.png`. No game files or Docker session are used.
The local sandbox can block browser peer traffic; use a normal local terminal
when its loopback ICE connection cannot start. On 2026-10-05 these checks passed
in Windows Chrome 154.0.8037.98 outside the sandbox. Docker’s Linux engine was
stopped, so the live Python/NVENC bridge and physical Mac were not exercised.

## LAN and performance checks

The streamer publishes HTTPS TCP port 3001, WebRTC UDP port 21064, and the
private game relay on UDP port 3478 plus UDP ports 21000–21063. These ports bind
only to the selected private LAN address. The project does not add a Windows
Firewall rule. Docker Desktop and Windows may show a firewall prompt; allow
access only on your private network. The Zero Hour site sidecar is reachable on
host loopback port 8098, and Chromium’s debugging port stays on container
loopback.

The on-laptop Coturn service relays game WebRTC data between the Windows browser
and streamed Chromium, whose Docker network cannot use the other browser’s
private host candidates directly. The site issues short-lived, 12-hour
credentials from a local secret. The TURN listener accepts game peers only at
the laptop’s LAN address and Docker interface; it is not a public relay and no
router port forwarding is used. After updating an existing stream, restart it,
reload both game clients, create a fresh web room and rejoin so both clients
fetch TURN settings before starting multiplayer.

If the Zero Hour lobby shows only your commander and its network line says
`Peers: 0/0`, signaling is connected but the WebRTC game peer is not. Check
`docker compose --project-name zero-hour-streaming --env-file
.local/streaming/compose.env --file compose.streaming.wsl.yaml ps` and the `turn`
service logs before retrying. A lobby entry by itself does not prove a game peer
or match is connected.

The current stream target is 1280 × 720 at 60 fps and 8 Mbps H.264. Width,
height and bitrate are set in `compose.streaming.wsl.yaml` as
`ZH_STREAM_WIDTH`, `ZH_STREAM_HEIGHT` and `ZH_STREAM_BITRATE`. The game retains
its existing 60 client frames per second and 30 logic updates per second. The
laptop runs two game simulations, performs X11 frame readback, and shares its
RTX 3050 between both players; large maps or bot counts can lower game
performance. The capture and NVENC stages passed a ten-second 1080p60 component
test, but the full workload still needs verification. Check Mac decoded and
displayed FPS and WebRTC RTT during a real match; RTT alone does not measure
input-to-visible-response time. The Mac’s decoder, drops, frame presentation
and input delay remain unverified. Same-Wi-Fi gameplay uses no public STUN or
TURN service; the private TURN relay runs on this laptop.

If the session reports an encoder error, disconnect the friend and inspect:

```powershell
docker compose --project-name zero-hour-streaming --env-file .local/streaming/compose.env --file compose.streaming.wsl.yaml logs friend
```

Capability reports and diagnostics remain in `.local/streaming/`. No player
archives, password, TLS key, browser profile or game saves belong in the
published website. To choose a different image or network setup, edit the
project’s compose files and run the relevant acceptance tests before use.
