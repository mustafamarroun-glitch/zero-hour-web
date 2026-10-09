# ShockWave 1.201 browser profile

ShockWave is a third game at `/shockwave/`. It uses New Shoes' existing managed
mod mount alongside the independent Zero Hour and Yuri launchers. The initial
scope is AI skirmish and two-player friend rooms. Campaign, General's Challenge,
streaming, complete matches, Mac gameplay and different-network play need
separate acceptance.

## Player files

The current importer supports the project's combined English base profile:
17 original archives. ShockWave adds 11 active archives, pinned by size and
SHA-256 in `public/shockwave/manifest.json`. No game data, Windows launcher,
GenTool, wrapper or DLL is included in the website.

Use the Zero Hour 1.04 base rules. Do not add Patch 1.06 or other gameplay mods.
Optional classic icons are disabled. Original `.gib` and activated `.big` names
are accepted, including leading `!`. Canonical stored names omit `!`; indexed
managed mount names preserve the official override order. A ZIP/RAR containing
only the Windows installer cannot be played directly in the browser.

`tools/prepare-shockwave.py` copies player-owned base and extracted/installed mod
archives and the original `Data/Cursors/*.ani` artwork into a new private folder,
verifying all copies. It refuses existing
outputs. Example from the project:

```powershell
python tools/prepare-shockwave.py --base "C:\path\to\Zero Hour\Data" --mod "C:\path\to\ShockWave files" --output ".local\shockwave-player-files"
```

Import that folder through ShockWave, or ZIP/RAR its contents. Both friends
need the same files. `.local/` stays outside source and publication.

The supplied installer was extracted privately using the author-provided
cicdec 3.0.1 tool, without executing the installer. Native outputs were not run.
The site supports importing an existing separate native mod installation too.
The supplied ZIP's MD5 and size match the developer's [ModDB download
listing](https://www.moddb.com/mods/cc-shockwave/downloads/shockwave-version-12).
Archive SHA-256 values were computed from that installer, rather than presented
as developer-published archive checksums. Provenance is in the manifest.

## Isolation and recovery

Zero Hour retains its existing keys and OPFS root. ShockWave uses
`zero-hour-web-v1:shockwave:` for local/session storage and IndexedDB, and
`zero-hour-web-v1/shockwave-v1` in OPFS. The scope adapter propagates the game
identity to importer, engine and I/O workers. Saves/replays additionally use
a content-derived managed mod context, stable when reinstalling the same files.
Browser-wide clearing and origin quota still affect all games at that origin.

Replacement stages base and mod files, then commits one combined manifest.
Cancellation or validation failure preserves the old installation. Removal
targets this game's archives and preserves settings and committed saves. ZIP
backups contain base and mod archives plus imported cursor artwork. Saves and
replays are separate. Version 3.1.2 rejects new imports missing any of the 52
original cursor files, before replacing the installed game. Older archive-only
backups need the original `Data/Cursors` folder added before reimport.

### Original mouse cursor (3.1.1)

The initial prepared folder omitted the 52 original ANI cursor files, causing
the white browser pointer. New prepared folders include them. To repair an
existing installation, finish and exit the match, refresh the launcher, then
open **Installed files & recovery → Import another installation → Select files**.
Select all `.ani` files in the prepared folder's `Data/Cursors` directory. This
small import validates and packs the animations in place, preserving the 28
archive paths, settings, mod save context and multiplayer content identity.
No full game reimport is required. Cursor artwork stays browser-local.

### Audited compressed package (3.1.2)

`tools/package-shockwave.py` audits a prepared folder against its original base
and mod sources. It checks every BIG entry's bounds and names, all source-copy
SHA-256 values and official mod hashes, then creates a standard Deflate level 9
ZIP with exactly 17 base archives, 11 mod archives and 52 original cursors.
Every compressed entry is fully restored and verified by CRC and SHA-256.
The package excludes native programs, other-language resources, cinematics,
optional classic icons, metadata, saves and replays without changing originals.
Do not trim inside the pinned mod archives: units and shared resources may
depend on them even when campaign and Challenge acceptance is outside scope.

```powershell
python tools/package-shockwave.py --folder ".local\shockwave\player-files" --base "C:\path\to\Zero Hour\Data" --mod ".local\shockwave\extracted" --output ".local\packaging\shockwave-web-new"
```

The private output includes a ZIP, checksum, exact audit inventory and player
instructions. The ZIP imports through **Choose ZIP or RAR**, without extracting
or running a Windows installer. `ZH_ARCHIVE=<ZIP path>` selects this path in
`tools/verify-shockwave.cjs` for a fresh installation and actual gameplay audit.

Rooms use ID `shockwave`, runtime
`3ccaa0e9-compiled-combined-v6-rf1-shockwave-1.201-v1`, and a content fingerprint
of all 28 archives. Zero Hour and Yuri cannot join a ShockWave room.

## Verification

`tools/verify-shockwave.cjs` uses a managed Chrome test profile and real files.
It checks cancellation and Zero Hour isolation, starts the Special Weapons
general, and requires actual `Spec_` objects and a completed mod barracks.
`ZH_PROFILE` can reuse an explicitly retained managed test profile.

`ZH_GAME=shockwave node tools/verify-multiplayer.cjs` tests website rooms, native
settings, mod objects on both peers, replicated mouse movement and 30 seconds
of CRC observation. Two local Chrome profiles do not establish separate-device
or Internet gameplay. Reports remain in `.local/`.

Run `node tools/check.mjs` and `node tools/package.mjs` before release. Publication
is separate from the local build and requires a release request.

`node tools/verify-shockwave-service.mjs` checks that the configured public WSS
room service accepts ShockWave and a matching peer, and that signaling opens.
The renewed temporary tunnel depends on the host PC staying awake. Service
protocol success does not establish completed cross-device Internet gameplay.

`ZH_PROFILE=<retained managed profile> node tools/verify-shockwave-cursors.cjs`
checks invalid artwork rejection, an in-place 52-file import, native save
presence, original animated battlefield cursor and persistence after reload.
