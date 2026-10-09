# ZeroHour Web 3.2.0 landing page

The site root opens a game selection page before commander identity, local import, or gameplay. ZeroHour uses zero-hour.html; Yuri and ShockWave keep their own routes. The existing home wordmark returns to game selection. Root room invites retain all query parameters and the fragment when forwarded to ZeroHour.

The homepage uses local HTML, CSS, font, and a small theme module. It loads no game engine, iframe, game importer, or WebAssembly. Game launchers continue to register the isolation service worker before enabling their forms on headerless static hosts.

Dark and light themes preserve existing ZeroHour gameplay preferences. Malformed preference data recovers when the visitor changes theme, and storage events synchronize other tabs. A restored page refreshes its theme on pageshow. Without JavaScript, game links remain available and the unavailable theme toggle stays hidden.

## Verified before deployment

Chrome checks cover local origin and a headerless repository subpath; all four entry choices; a returning commander; preference preservation; legacy room invites; keyboard skip/navigation; six widths from 320 to 1440px; 44px navigation hit areas; 200% text at320px; malformed storage; cross-tab updates; and disabled JavaScript. Dark/light text contrast samples exceed 4.5:1. Six engine profiling regression tests and source/provenance gates passed. No gameplay changes were made or claimed.

The full deployed 3.1.2 source/site/history backup is retained privately under output/backups. Browser libraries, saves, replays, streaming profiles and credentials are excluded from source and static publication.
