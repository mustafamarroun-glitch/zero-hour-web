# Play Zero Hour together on the LAN

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
the requested `saddam` / `0000` login, and starts only this project’s
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
address on the Mac and signs in with username `saddam` and password `0000`. The
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

## LAN and performance checks

The streamer publishes HTTPS TCP port 3001, WebRTC UDP port 50000, and the
private game relay on UDP port 3478 plus UDP ports 49160–49223. These ports bind
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
