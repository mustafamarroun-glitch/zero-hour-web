ZERO HOUR WEB - PROJECT BRIEF AND HOW TO PLAY
Updated: 4 October 2026

PROJECT BRIEF

Zero Hour Web lets you play Command & Conquer: Generals Zero Hour in a
desktop browser using the New Shoes WebAssembly engine and your own
compatible game files. It provides a commander name, local file import,
solo skirmish, experimental private two-player rooms, and a ZIP backup
of your imported game archives.

Retail game files are not included. Import reads your original files and
stores a copy inside this browser; it does not upload or modify them.
This is a separate project from Winchester OS / Online-Games.

WHAT YOU NEED

- A Windows desktop or laptop with Chrome and hardware acceleration enabled.
- Your own compatible Generals + Zero Hour installation. The tested combined
  English profile contains 17 required archives, approximately 1.62 GiB.
  Select its Data folder; filenames alone do not guarantee compatibility.
- Roughly 2 GB of available browser storage for the tested installation,
  plus extra disk space if you want to download and extract a backup.
- A normal browser profile with site storage enabled. Avoid private mode
  if you want your installation and saves to remain available.
- For local startup only: Node.js 22 or newer, with npm. An internet
  connection is needed to install the project's dependencies initially.

OPTION A - OPEN THE PUBLISHED WEBSITE

Open this address in Chrome:
https://mustafamarroun-glitch.github.io/zero-hour-web/

You do not need Node.js for this option. Continue with FIRST-TIME SETUP.
The published multiplayer service uses a temporary endpoint and depends
on its host PC, service and tunnel staying online; availability can vary.

OPTION B - RUN THIS PROJECT ON YOUR COMPUTER

1. Install Node.js 22 or newer if it is not already installed.
2. Open PowerShell in the project folder. On this computer, run:

   cd "C:\Users\Winchester\Documents\Projects\Zero-Hour-Web"

3. Install dependencies once, or after the dependency lockfile changes:

   npm ci

4. Start the website and local room/signaling service:

   npm start

5. Leave PowerShell running and open this exact address in Chrome:

   http://localhost:8093/

Do not open public/index.html directly. The engine needs the web server.
To stop the server, exit the game first, then press Ctrl+C in PowerShell.
Next time, repeat steps 4 and 5; you normally do not need npm ci again.

FIRST-TIME SETUP

1. Enter a commander name and click "Enter". Use 2-12 English letters,
   numbers, spaces, underscores or hyphens. This is a guest display name,
   not an account or cloud login.
2. Click "Choose ZIP or RAR" for one archive, or "Choose game folder" for
   your installation's Data folder. "Select files" accepts the required
   game archives together. Get ZIP / Get RAR opens the supplied Drive links.
3. Wait for local extraction, validation and installation. Keep the tab open.
   Continue when the page says "Local installation ready".
4. Browser ZIP backups can be imported directly into Version 2.
   Encrypted, multipart or ZIP64 archives must be extracted externally.
   Dark mode is on by default; the header switch remembers your choice.

PLAY A SOLO SKIRMISH

1. Click "Launch skirmish". Wait for the original game's skirmish options.
   If the main menu appears, choose Single Player, then Skirmish.
2. Choose your map, faction, color and AI opponent in the original game.
   A useful first test is Alpine Assault against one Easy Army.
3. Start the match using the original game's start control.
4. Wait until the battlefield is visible, select a worker or builder,
   move it, and try constructing a building.

CONTROLS AND EXIT

- Left-click: select a unit or building.
- Drag with the left mouse button: select a group of units.
- Right-click: issue a movement or attack order.
- Select a builder, then use its construction panel to build.
- Esc: open the original game menu.
- F8: reveal or hide the website toolbar. It hides automatically by default.
- Alt + Enter / "Fullscreen": enter or leave fullscreen.
- Move the mouse to or just beyond the battlefield edge to scroll the camera.
- "Settings": resolution, display size, edge scrolling, music/effects volume,
  toolbar behavior, dark mode and performance information.
- Settings "Graphics renderer": choose Compatibility or Shader effects;
  this applies on the next launch. Resolution applies to the running engine.
- "Diagnostics": download a report for troubleshooting.
- "Exit game": confirm leaving an active match, then shut down and flush saves.
  Wait for the lobby to return before closing the tab or stopping the server.

PLAY WITH A FRIEND - EXPERIMENTAL

Both players need matching compatible game archives, distinct commander
names, and access to the same website and multiplayer service. Each player
imports their own files locally. First confirm solo gameplay works on both.

1. The host clicks "Create room", then "Copy invite link", and shares
   the link with the other player.
2. The guest opens the invite, completes setup if necessary, and joins.
   Alternatively, enter the host's room code and click "Join".
3. Wait for both names and "Runtime and content fingerprints match".
4. Both players click "Enter game room". Wait for "2/2 engine players";
   the website room roster alone does not mean the game is connected.
5. Choose the map, factions, teams and different colors. For a first test,
   use Alpine Assault and opposing teams. Wait for settings to synchronize.
6. The guest clicks "Ready", then the host clicks "Ready". Changing match
   settings may require both players to ready again.
7. When both players are ready and have the map, the host clicks "Host start".
8. Wait for terrain and an advancing frame counter, then play.

The default local server accepts connections only from this computer.
A localhost invite will not connect a friend on another computer to your
server. For separate computers, use the published website with its service
online, or set up HTTPS/WSS hosting as described in docs/DEPLOYMENT.md.
Starting npm on each computer does not create a shared multiplayer service.

If a host disconnects, leave and create a new room. Mid-match reconnection
and resume are not verified. For two sessions on one computer, use separate
browser profiles and import into each; two tabs share the same guest identity.

RETURNING LATER AND BACKUPS

Use the same website address and browser profile to restore your installation,
commander name and saves. Localhost, 127.0.0.1, another port, and the published
website have separate storage. Imports and saves do not follow your name.

To back up imported game files:
1. Open "Installed files & recovery" in the lobby.
2. Click "Prepare ZIP backup" and wait until it is ready.
3. Click "Save ZIP" to download Zero-Hour-backup.zip.
4. To restore or move the library, import the ZIP directly into Version 2,
   or extract it and import that folder on an older destination website.

This ZIP contains imported game archives, not saved matches or your commander
profile. Clearing browser site data can remove the installation and saves.
GitHub Pages projects on the same account share site-wide storage clearing,
even though this project keeps its own library separate.

TROUBLESHOOTING

- Import rejected: read the displayed error and select the complete compatible
  Data folder. A partial installation or different archive contents may fail.
- Storage unavailable/full: enable site storage and free disk space. Use a
  normal browser profile and retry the import.
- Game fails to load: use Chrome with hardware acceleration, keep the server
  running for local play, and use the exact HTTPS or localhost address.
- Black, white or corrupted graphics: try "Compatibility", then "Shader
  effects" in the Graphics control. Download Diagnostics and record your
  browser version, operating system and GPU. Mac gameplay is unverified.
- Room connection fails: the room/signaling service may be offline. On local
  play, check the npm start terminal; on the published site, its temporary
  service/tunnel must be running. Solo skirmish remains available.
- Content mismatch: both players must import matching complete archives.
- DESYNC: exit the match and preserve Diagnostics from both players.
- PowerShell blocks npm.ps1: use npm.cmd ci and npm.cmd start instead.

TESTED STATUS AND LIMITS

The project's verification record dated 4 October 2026 documents Windows
Chrome import, visible solo gameplay, unit movement, completed construction,
clean exit/relaunch, and ZIP archive integrity. It also records preliminary
two-session local multiplayer movement and synchronization.

A completed solo match, a completed multiplayer match on separate computers
and internet networks, longer multiplayer reliability, Mac graphics, audible
playback, and backup extraction/import on a second physical device remain
unverified. Mobile gameplay is outside this release.

MORE INFORMATION

README.md             - Technical overview and provenance.
docs/VERIFICATION.md  - Recorded checks and remaining gameplay tests.
docs/DEPLOYMENT.md    - Hosting and multiplayer service setup.
docs/ARCHITECTURE.md  - Engine, networking and local-storage design.

Developer checks: npm run check
Build a hosting package: npm run package (output: release/site)
Packaging is not required to play locally. Publish only release/site;
keep private local files and player-owned retail archives out of hosting.
