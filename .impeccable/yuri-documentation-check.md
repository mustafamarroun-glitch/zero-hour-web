# Yuri ordinary-extension documentation check

Checked 2026-10-04 after the finish review and its placeholder-contrast correction.

## Scope and authority

This is an ordinary extension of Zero Hour's outside-game launcher. The explicit parity request and `.impeccable/yuri-setup.md` govern it. `DESIGN.md` remains the incumbent visual authority; `PRODUCT.md` describes the shared product and local-retail-file boundary. No new visual world or durable system replacement was approved.

## Evidence checked

- Read the Impeccable `document.md` and `new-work.md` requirements for ordinary extensions.
- Compared the finished HTML and shared stylesheet with `DESIGN.md`: dark olive paper, pale ink, Rajdhani headings, native sans body, thin rules, restrained controls, optional paper theme, responsive stacked setup and settings dialog all inherit the incumbent system.
- Opened `.impeccable/review/desktop.png`, `mobile.png`, `zero-reference-desktop.png` and `settings-desktop.png`. These show Yuri desktop/mobile setup, the Zero Hour desktop reference, and Yuri settings. The supplied full finish-review matrix also covers commander entry, installed lobby/recovery, light lobby, mobile settings and settings storage controls; that review is separate from this documentation comparison.
- Read `tools/sync-launchers.mjs`, `public/index.html`, `public/yuri/index.html`, shared `public/app.mjs`, `public/style.css`, and preferences/adapter references. The Yuri launcher is generated from the canonical Zero Hour page and uses its shared UI and behavior. `node tools/sync-launchers.mjs --check` passed.
- Confirmed the shared import ZIP/RAR/folder/files controls, installed-file disclosure, ZIP backup, replacement/removal/cleanup, and settings structure in both pages. Both Yuri download buttons point to the same supplied Drive URL, with explicit explanatory copy. This check did not verify remote Drive access or full-match gameplay.

## Preservation and pre-existing drift

No edits were made to `DESIGN.md`, `PRODUCT.md`, application files or incumbent sidecars by this documentation pass. No `.impeccable/design.json` was present. The existing compact prose `DESIGN.md` predates the current token-frontmatter/canonical-section format. That is pre-existing documentation-format drift, preserved and reported rather than migrated as a side effect. No visual-system drift requiring a replacement was observed in the checked evidence.

## Completion

Ordinary-extension documentation requirements are fulfilled: compare the finished build with the incumbent system, preserve its files, report checked evidence and pre-existing drift. Regenerating `DESIGN.md` or creating a sidecar is not required for this ordinary extension. The separate reviewer scored its single material placeholder-contrast fix resolved; that verdict is limited to the listed fix.

## Recheck after the later picker fix

The later change in `public/app.mjs` introduces `restoreTask`, delegates startup restoration to `restoreLibrary()`, and awaits that task before archive extraction, file scanning or installation. It removes the startup storage-lock race for a quick folder/file selection. The UI template, stylesheet and token system are unaffected. Rechecked those source changes, the integrated actual-folder/file-picker regression in `tools/verify-yuri-setup.cjs` (optional `YURI_GAME_DIR`), its explanation in `docs/YURI.md`, and `.local/yuri-file-picker-verification.json`, which records the dedicated complete-folder and 166-file picker/reload result. The generator consistency check passed again. This is a behavioral correction within the same ordinary-extension scope; the documentation completion and preservation decision above still hold. The documentation pass has not rerun browser tests or expanded gameplay claims.
