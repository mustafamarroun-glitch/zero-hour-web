# Play Zero Hour Web with a friend

Website: https://mustafamarroun-glitch.github.io/zero-hour-web/

These instructions are for your current Windows laptop and project. You do not need Codex running. Solo play needs only the website and imported game files. Multiplayer also needs your laptop's Node server and Cloudflare tunnel running.

There is no automatic startup configured. After restarting the laptop, follow steps 1–3 again. Your friend does not run a server or these commands.

## Before starting

- Use normal Chrome profiles on both computers. Keep using the same website and profile so imported files remain available.
- Version 2 can import `C:\Users\Winchester\Desktop\Zero-Hour-Browser-English.rar` or its ZIP directly with **Choose ZIP or RAR**. An older published build requires extracting it and importing the folder. Both players need matching English game archives; the trimmed package's 17 required archives match the originals.
- Keep the hosting laptop plugged in, awake and online throughout the match. Temporarily choose **Never** for sleep while plugged in under Windows Settings → System → Power & battery → Screen and sleep (wording varies). Restore your preferred setting afterward. Closing the lid may put the laptop to sleep.
- The server and tunnel were already running when this guide was written. If you have not restarted or stopped them, first try the website; you do not need duplicate processes.

## 1. Start the multiplayer server after a restart

Open **Windows PowerShell** from Start. Paste this entire block and press Enter:

```powershell
Set-Location -LiteralPath 'C:\Users\Winchester\Documents\Projects\Zero-Hour-Web'
$env:HOST = '127.0.0.1'
$env:PORT = '8095'
$env:ALLOWED_ORIGINS = 'https://mustafamarroun-glitch.github.io,http://localhost:8093'
& 'C:\Users\Winchester\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\tools\server.mjs
```

Success looks like:

```text
Zero Hour Web: http://localhost:8095 (separate origin; room and signaling service active)
```

**Leave this window open.** It will stay busy without returning to a command prompt; that is expected. You do not need to start the separate localhost:8093 website when playing on GitHub Pages.

If you see `EADDRINUSE`, something is already listening on port 8095, usually the existing server. Do not start another copy. Check the existing server window.

## 2. Start the public tunnel in a second PowerShell window

Open a **second Windows PowerShell window**. Paste:

```powershell
Set-Location -LiteralPath 'C:\Users\Winchester\Documents\Projects\Zero-Hour-Web'
New-Item -ItemType Directory -Force -Path '.local\network' | Out-Null
& 'C:\Users\Winchester\Documents\Projects\Online-Games\.local\yuri-multiplayer\cloudflared.exe' tunnel --edge region1.v2.argotunnel.com:7844 --protocol http2 --no-autoupdate --url http://127.0.0.1:8095 --logfile '.local\network\tunnel-direct.log'
```

The executable is reused from the existing installation; this command does not modify that project.

Look for a box containing a **new address ending in `.trycloudflare.com`**, such as:

```text
https://some-new-words.trycloudflare.com
```

Also look for `Registered tunnel connection`. **Copy the actual new HTTPS address and leave this window open.** The example above is not a working address. The tunnel address normally changes every time you restart the tunnel.

To check that the tunnel reaches your server, open its new address with `/network-config.json` appended in Chrome. You should see JSON containing `rooms`, `signaling` and `runtime`. Relative values such as `/rooms` in this check are normal; you will configure the public website in the next step.

If connection errors keep repeating and that page will not open, press **Ctrl+C** in the tunnel window and try the command below, which lets Cloudflare choose its edge automatically:

```powershell
& 'C:\Users\Winchester\Documents\Projects\Online-Games\.local\yuri-multiplayer\cloudflared.exe' tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:8095 --logfile '.local\network\tunnel-direct.log'
```

Use the address from this latest successful attempt. If neither attempt connects, the tunnel is unavailable; updating the website cannot repair it. Check your internet connection, try another connection if available, and retry. Do not disable your firewall to troubleshoot this.

## 3. Tell the public website the new tunnel address

1. Sign into GitHub as **mustafamarroun-glitch**.
2. Open this file editor: https://github.com/mustafamarroun-glitch/zero-hour-web/edit/main/public/network-config.json
3. Replace **only the hostname in `rooms` and `signaling`** with the new tunnel hostname. Both must start with **`wss://`**, not `https://`. Keep `/rooms` and `/nostr` on their respective addresses.

For example, if your tunnel address is `https://some-new-words.trycloudflare.com`, the complete file would be:

```json
{
  "temporaryService": true,
  "runtime": "3ccaa0e9-compiled-combined-v6",
  "rooms": "wss://some-new-words.trycloudflare.com/rooms",
  "iceServers": [],
  "signaling": "wss://some-new-words.trycloudflare.com/nostr"
}
```

4. Click **Commit changes**, enter `Update temporary multiplayer endpoint`, choose to commit directly to **main**, and confirm.
5. Open https://github.com/mustafamarroun-glitch/zero-hour-web/actions and wait for the newest **Publish standalone website** run to finish with a green check. Allow a few minutes; if it is red, multiplayer has not received the update.
6. Check https://mustafamarroun-glitch.github.io/zero-hour-web/network-config.json — both addresses should show your new hostname. Reload this page if you still see the old one.
7. Both players reload the game website. On Windows use **Ctrl+Shift+R**; on Mac use **Command+Shift+R**. Leave any old room and create a fresh one.

Always play at the GitHub Pages website, not the temporary tunnel address. The tunnel provides multiplayer connectivity; changing game website origins would require another import.

## 4. Prepare both computers

1. Open https://mustafamarroun-glitch.github.io/zero-hour-web/ in Chrome.
2. Enter different commander names, 2–12 characters long, using letters, numbers, spaces, `_` or `-`.
3. If prompted, import the extracted game folder and wait until validation finishes. Importing stays local to each browser. Do not clear browser site data afterward.
4. On each computer, first click **Launch skirmish** and try **Alpine Assault** against one Easy Army. Confirm that you can see terrain, select a worker, right-click to move it, and complete a building. Then use **Exit game**.
5. If graphics are corrupted, try **Compatibility** in the Graphics control, exit and relaunch. You can also try **Shader effects**. Download **Diagnostics** if neither works. Actual Mac rendering is still unverified.

## 5. Create and play a two-player match

1. You click **Create room**, then **Copy invite link** and send the link to your friend. They open it on the same game website/profile, or enter your room code and click **Join**.
2. Confirm that both names appear and the files are compatible. If content differs, both players must import matching archives.
3. Both click **Enter game room**. Wait until it reports **2/2 engine players**.
4. Select **Alpine Assault**, different colors and opposing teams. Choose factions and wait until the settings match on both computers. Start with just the two human players.
5. **Your friend clicks Ready first; then you click Ready.** Changing a setting can reset readiness, so ready again if necessary.
6. As host, click **Host start** only when both players are accepted, ready and have the map.
7. Wait for visible terrain and an advancing simulation before clicking. Each player selects a worker and right-clicks to move it, then builds a structure. Confirm that the other player sees the same actions.
8. Play through to a winner. During the match, each player can click **Diagnostics** to save a report. Keep reports if there is a freeze, disconnect, graphics problem or CRC mismatch.

A room or loading screen alone does not prove multiplayer works. Real local two-browser gameplay passed, but a completed match on two physical computers over different networks is still the test you are doing. A successful full match should show the same winner on both computers without a CRC mismatch.

## If something goes wrong

| Symptom | What to check |
| --- | --- |
| Create room cannot connect | Both PowerShell windows must still be running. Check the tunnel JSON page, the deployed public JSON hostname and the latest green GitHub Actions run. |
| Room not found / host disconnected | Old rooms disappear when the server restarts. Host creates a fresh room and shares a new invite. |
| Files or engine version differ | Both use the same public site and matching 17 archives. Reload the site; reimport matching files if needed. |
| Room works but engine stays at 1/2 players | Wait briefly. If it stays there, both exit the engine, leave the room and retry in a fresh room. Restrictive networks can prevent the WebRTC connection; no TURN fallback is configured. Trying a different network or phone hotspot may help, but is not guaranteed. |
| Tunnel repeatedly disconnects | Check whether its JSON page is reachable. If not, restart it, obtain the new URL and repeat step 3. Restarting interrupts the current session. |
| Match freezes or reports CRC mismatch | Download Diagnostics on both computers and note what happened. Exit and start a new match. Mid-match reconnection is not verified. |
| Laptop sleeps or internet drops | Wake/reconnect it and check both services. You may need a fresh room or tunnel. Keep the laptop awake during the match. |

Do not clear Chrome site data as a first troubleshooting step: it removes imported files and can affect other sites under the same GitHub Pages account origin.

## When finished

Exit the game on both computers. In each of the two PowerShell windows, press **Ctrl+C** to stop the service, then close the window. The multiplayer endpoint becomes unavailable; solo play remains available. Restore your laptop's normal sleep setting.

For the next session after a restart: **server → tunnel → update the two GitHub addresses → wait for green deployment → fresh room**.
