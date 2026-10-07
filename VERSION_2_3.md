# Version 2.3: stream experience

Version 2.2 is preserved in the private restore point
`output/backups/Zero-Hour-Web-v2.2.0-20261007T011839Z/`.
The original source and release/site passed ZIP CRC and restored SHA-256 checks;
the complete Git bundle was verified. Read RESTORE.txt there. Browser libraries,
stream profiles, passwords and game saves remain separately in their original
locations. Restore into a new directory; do not overwrite those private folders.

## Player changes

- Internet Auto starts with 854x480 / 30 FPS / 350 kbps video, with AAC audio
  up to 64 kbps. It tries 720p30 / 1 Mbps and then 720p60 / 2 Mbps cautiously
  after sustained healthy playback. Three poor samples lower quality; a
  90-second cooldown prevents repeated upgrade trials. A trial is not a
  bandwidth guarantee. Manual quality stays fixed and can change while playing.
- Playback keeps a fixed 1x audio/video clock. Catch-up seeks above 800 ms
  target 350 ms and are separated by two seconds to avoid continuous decoder
  seeks. Small rate changes caused substantial frame drops in real Chrome and
  were removed after an actual NVENC receiver comparison.
- Changing quality reconnects video, retaining the hosted browser/game.
  Interrupted Internet streams retry up to three times; Disconnect cancels
  retries. Occupied sessions, rejected logins and unsupported codecs show
  specific recovery text without automatic retries. Multiplayer match resume
  is a separate, unverified capability.
- Stream tools include volume/mute, quality, fullscreen and diagnostics.
  F8 hides/shows tools, Alt+Enter toggles fullscreen, and keyboard focus is
  explained. Volume/mute/quality are remembered locally; addresses and logins
  are not stored. Fullscreen preserves access to tools.
- Mouse moves are coalesced once per animation frame and flushed before button
  and keyboard transitions. Letterbox clicks cannot issue orders; drags clamp
  at the picture boundary. Data-saver controls map back to the full host desktop.
  Blur, tab hiding, disconnect and host cleanup release held controls.
- Internet joins now select Internet on the receiver; private IPv4 invites
  select Same Wi-Fi. Guests still authenticate at the host and need no import.
- Internet reports now download 10 seconds of receiver playback counters,
  displayed FPS where supported, buffer, bitrate, drops, network RTT and host
  encoder progress where available. They exclude stale LAN counters and
  private addresses, credentials, game files, recordings and screenshots.
  HTTPS input-to-picture latency remains explicitly unavailable. Existing
  Wi-Fi copied-video marker probes remain intact.

No simulation clock, retail asset, import namespace or game-save format changes.
Engine rebuild, public TURN deployment, stable hostnames, additional streamed
guests and mid-match recovery are not part of this release. Separate-device,
Mac, actual audible playback, busy-battle and completed-match acceptance remain
required; see docs/VERIFICATION.md for exact current evidence.
