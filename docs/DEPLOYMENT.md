# Separate deployment

`npm run package` creates an allowlisted static website and complete corresponding source. Publish `release/site`, not the workspace. Original installations, profiles, retail data, screenshots, saves and credentials are excluded. The original Online-Games deployment must remain untouched.

## Hosting

Free GitHub Pages from a new public `zero-hour-web` repository is suitable for the static frontend; it does not run the room/signaling service. The prepared site is roughly tens of MB, below the documented 1 GB Pages site limit. Pages has a 100 GB/month soft bandwidth limit. Current official references: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits and https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages (checked 2026-10-04).

Hosts supporting response headers can use `public/_headers` for COOP `same-origin`, COEP `require-corp`, and CORP `same-origin`. GitHub Pages uses the included service-worker isolation bootstrap. It only adds headers to same-origin responses within this site's scope, without caching responses or game files. Headerless subpath hosting and the deployed HTTPS site's complete real solo flow both passed.

Run the Node service separately. Set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin, `ROOMS_URL` and `SIGNALING_URL` when serving one combined endpoint, and `ICE_SERVERS` only when using your own authorized ICE provider. For static hosting, write the public WSS endpoints and optional public ICE configuration into `public/network-config.json` before packaging.

Free development option: Cloudflare Quick Tunnel can expose this project's local service through a temporary HTTPS/WSS URL, with a documented limit of 200 in-flight requests and no production availability guarantee. It needs this PC and service running, and its URL changes on restart. Current reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ (checked 2026-10-04). It is a development endpoint, not a permanent multiplayer backend.

## Release gates

1. `npm run check`; ensure engine/source hashes and no retail/executable files in the package.
2. `npm run package`; inspect the source ZIP and publication manifest.
3. Commit only this project's source and allowlisted runtime; create a new repository. Do not reuse the old repository history or remote.
4. Publish the dedicated HTTPS site, verify isolation and relative-module loading, import actual archives there, and repeat a real skirmish. Same-account GitHub Pages sites share an origin; the dedicated storage namespace is tested separately.
5. Test two browser sessions through public signaling; then complete a separate-device, separate-network match.

The separate public repository is https://github.com/mustafamarroun-glitch/zero-hour-web. Its workflow checks and packages the allowlisted site before publishing through GitHub Pages. An existing Git Credential Manager account was verified and is used without storing tokens in this project. No paid service has been provisioned.

The user explicitly approved a temporary Cloudflare endpoint for localhost:8095. Registration succeeded after selecting Cloudflare's resolved edge directly. The actual published room UI and bidirectional WebRTC datagrams through public Nostr signaling passed in Chrome. Terminal health requests timed out and the tunnel sometimes reconnects, so do not treat it as a production availability guarantee. Full engine gameplay on different networks remains a separate gate. The endpoint works only while this PC, service and tunnel remain running.
