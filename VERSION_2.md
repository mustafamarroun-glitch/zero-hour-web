# Zero Hour Web 2.0.0

Version 1 is preserved at Git tag `v1.0.0` (commit `6e54adf`). Its exact working snapshot, including the uncommitted player guides and release package, is in `output/backups/Zero-Hour-Web-v1.0.0-20261004T064804Z/Zero-Hour-Web-v1.0.0.zip`. The sibling manifest contains restored-entry SHA-256 hashes and restore instructions; `history.bundle` retains Git history. Every entry passed ZIP CRC and SHA-256 comparison. Backup ZIP SHA-256: `ec821c3f49c87b7044ac09e3d5ae95541662b94aed8545eab549ed62746e5be7`.

Version 2 development is on `codex/version-2`. The application version is independent of the unmodified upstream engine. Keep the `zero-hour-web-v1` storage namespace: it preserves existing libraries, identities, saves and engine preferences.

## Changes

- Dark mode defaults on, with a remembered switch in the header and Settings.
- The gameplay toolbar collapses without covering the battlefield. F8 toggles it; a small Menu button reveals it. Automatic hiding can be disabled. Alt + Enter toggles fullscreen.
- Settings offers real engine resolutions (1024 × 768, 1280 × 720, 1600 × 900, 1920 × 1080 and window fit capped at 1080p), aspect-preserving fit/actual display size, existing renderer selection, separate music/effects volume, edge scrolling, performance information and reset.
- The pointer-leave path retains the exact native edge rather than pushing it into the interior. Letterbox movement updates the closest native edge. Toolbar and dialog activation neutralize camera input. Browser focus loss still releases input.
- Prepare for deployment includes the supplied Google Drive ZIP and RAR links and a single-file archive picker alongside folder/files import.
- ZIP STORE/DEFLATE import streams into private OPFS staging, verifies CRC and size, and feeds the existing game validator. RAR decoding reads Blob slices and writes OPFS synchronously in a dedicated worker; only the decoder dictionary and chunks need RAM.
- Archive import accepts one installation inside enclosing folders, rejects unsafe paths and duplicates, and extracts `.big` game data plus optional original cursor `.ani` files. ZIP64, encrypted and multipart archives require external extraction. Maximum expanded archive contents: 8 GiB / 20,000 entries. No server upload, game patching or replacement content.
- A replacement is installed into a new root and validated before its manifest replaces the old library. Cancel/failure preserves the previous installed library. Temporary extraction storage is removed, with locked stale-root cleanup on startup.
- Recovery controls show storage estimates/persistence, validate the installed library, back up, replace and remove installed game data. Removal protects an active installation and preserves saves and original files. Exit confirmation protects an active match; browser-close prompts are best-effort.
- Settings diagnostics can be downloaded before launch; engine diagnostics include version and display information.

## Verification

The final gameplay run passed: actual ZIP/RAR imports, replacement preservation, dark theme persistence, responsive setup, real skirmish, four-edge camera movement, live 1024 × 768 / 1600 × 900 changes, original mouse selection/movement, scrolling off, fullscreen and protected clean exit. The run is recorded in `.local/version-2-verification.json`, with private screenshots in `output/playwright/v2-*`. Archive safety and shared-origin/subpath isolation passed separately. Results and remaining gates are summarized in `docs/VERIFICATION.md`. Runtime/decoder/source hashes and publication boundaries remain required by `node tools/check.mjs`.

This is a local development/release build. Publishing is a separate action. Mac graphics, completed internet multiplayer matches, audible playback and a compiler rebuild require their own acceptance.
