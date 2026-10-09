# ZeroHour Web landing page and game routes

The site root opens a game selection page before commander identity, local import, or gameplay. All three games use folders containing index.html, with matching URLs: /zero-hour/, /yuri/, and /shockwave/. The old zero-hour.html address redirects to /zero-hour/ and preserves the query and fragment. ZeroHour’s folder page is the shared launcher template; the sync tool derives Yuri and ShockWave from it. The existing home wordmark returns to game selection. Root room invites retain all query parameters and the fragment when forwarded to ZeroHour.

The homepage uses local HTML, CSS, font, and a small theme module. It loads no game engine, iframe, game importer, or WebAssembly. Game launchers continue to register the isolation service worker before enabling their forms on headerless static hosts.

Dark and light themes preserve existing ZeroHour gameplay preferences. Malformed preference data recovers when the visitor changes theme, and storage events synchronize other tabs. A restored page refreshes its theme on pageshow. Without JavaScript, game links remain available and the unavailable theme toggle stays hidden.

## Verified before deployment

Chrome checks cover local origin and a headerless repository subpath; all four entry choices; a returning commander; preference preservation; legacy room invites; keyboard skip/navigation; six widths from 320 to 1440px; 44px navigation hit areas; 200% text at320px; malformed storage; cross-tab updates; and disabled JavaScript. Dark/light text contrast samples exceed 4.5:1. Six engine profiling regression tests and source/provenance gates passed. No gameplay changes were made or claimed.

The full deployed 3.1.2 source/site/history backup is retained privately under output/backups. Browser libraries, saves, replays, streaming profiles and credentials are excluded from source and static publication.

## Version 3.2.2 route review

ZeroHour now uses the same folder/index.html structure as Yuri and ShockWave. The old file URL and root room invites preserve the complete query and fragment when redirected. Shared launcher generation, navigation, verification tools and player documentation use the new route.

The game launchers and streaming page have keyboard skip links. Commander names and room codes disable spellchecking; room codes also disable saved form suggestions. The source page declares a mobile viewport, and long hashes and revision links wrap on both documentation pages. The source checksum label explicitly identifies the combined upstream archive.

The release check validates local HTML links, anchors, scripts and styles beneath the GitHub Pages repository subpath, in addition to version labels, package-lock versions and existing engine/source checks. Chrome review covers all four entry pages, keyboard focus, 320–1440px layouts, documentation at 320px, legacy URLs and invites, settings and game-file storage continuity, and headerless service-worker isolation. Full matches and real streaming sessions are outside this route review and have not been rerun.
