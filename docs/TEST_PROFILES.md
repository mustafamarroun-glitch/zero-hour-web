# Test browser storage

Browser verification scripts now create unique profiles under `.local/test-browser-profiles/`. Normal runs remove only the profile created by that run, after closing Chrome. Launch failures, exceptions outside a script's inner `try`, report-writing failures, uncaught progress-timer failures, and handled SIGINT/SIGTERM also use the shared cleanup path. Screenshots, JSON reports, packaged game files, backups, and player browser storage remain separate.

No existing profile directory is swept by age or by name. Deletion requires the exact directory created by the current run, the unchanged ownership marker, and a path without symlinks/junctions. A browser-close or deletion error fails the run and leaves the directory for inspection. A force-killed process, power loss, or hard restart can bypass cleanup; such leftovers need review before deletion.

## Keep a profile deliberately

Use `ZH_KEEP_TEST_PROFILE=1` when a test needs inspection or a later continuation. The launcher prints the exact profile path. The v2/v2.1 verification reports also record the actual path and retention state. Clear the variable after that run so other runs return to automatic cleanup.

PowerShell example:

```powershell
$env:ZH_KEEP_TEST_PROFILE = '1'
node tools/verify-v21.cjs
Remove-Item Env:ZH_KEEP_TEST_PROFILE
node tools/verify-v21-followup.cjs
```

The follow-up requires the explicitly retained profile named in the preceding v2.1 report. It preserves that profile on close. Without a retained profile, it gives an actionable error rather than silently creating an empty profile. The upgrade test keeps one profile across the old and new site versions within the same run, then cleans it up normally.

For a single-browser test, set `ZH_PROFILE` to the exact retained profile path to reuse it. It must already exist under this project's `.local/test-browser-profiles/` and have its ownership marker. Reused profiles are always preserved. `ZH_V2_GAME_ONLY` requires an explicit `ZH_PROFILE` from a retained full v2 run.

The multiplayer test instead accepts independent `ZH_HOST_PROFILE` and `ZH_GUEST_PROFILE`. It ignores `ZH_PROFILE` so both clients cannot accidentally share the same locked profile. With neither specified, both clients receive fresh profiles and import their local game files.

Explicitly retained profiles still consume space. Inspect them and obtain approval before deleting any profile retained for debugging. Ordinary runs need no retention flag.

## Verification

`node --test tools/test-browser-profile.test.cjs` checks cleanup, failed launches, failed closes, retention/reuse, protected-path refusal, marker tampering, junction refusal, outer/report failures, and the interruption handler using small fixtures. `node tools/check.mjs` checks all project scripts and pinned engine/source checksums. These lifecycle checks do not establish a completed game or multiplayer match.
