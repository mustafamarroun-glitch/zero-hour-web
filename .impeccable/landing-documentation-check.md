# Landing documentation check

Scope: ordinary extension of the inherited field-manual system. Checked `DESIGN.md`, `PRODUCT.md`, `public/style.css`, `public/landing.css`, `public/index.html`, `public/landing.mjs`, and `.impeccable/landing.md` on 2026-10-09. The landing sources were reread after the finish-review fixes.

- Palette: landing reuses shared theme tokens. Dark paper/ink/control are `#161a14`, `#e8ecdf`, and `#647b40`; the light theme keeps warm paper and olive controls.
- Type: bundled Rajdhani headings at weight 600; native Segoe UI/Arial body. Landing display is 48–84px, featured title 44–64px, secondary titles 36px, and shared body 16px.
- Layout: shared 1300px maximum container and 6vw inset; grouped two-column composition collapses at 850px, with secondary game entries stacking at 520px.
- Components: inherited 3px button corners, 12px/18px padding, olive primary action, shared theme-aware hover colors; landing links have visible focus and 46px minimum height.
- Accessibility: header/footer controls provide 44px minimum hit areas; section anchors have `tabindex="-1"` and visible focus. Flexible navigation, zero minimum grid-item widths, wrapping text, and bounded action widths support narrow-screen text reflow.
- Theme behavior: malformed or non-object stored preferences recover to an empty object; toggling preserves other valid preferences. Cross-tab storage events and restored back/forward-cache pages refresh the theme and button state. The theme control stays hidden without JavaScript.
- Identity and flow: root markup visibly uses `ZeroHour` and version `3.2.0`, and links to `zero-hour.html`, Yuri, ShockWave, and the separate stream entry. Older root room invites retain their query and hash when redirected to the ZeroHour launcher. No new world, component system, or shipping raster assets are introduced by this surface.

`DESIGN.md` remains unchanged. Its existing brief matches the visual direction but predates the reference format: no YAML token frontmatter or canonical sections, and `.impeccable/design.json` is absent. Its legacy `Zero Hour Web` heading is preserved rather than treating this extension as authorization to refresh system documentation. These format conditions are reported, not repaired or canonized.

This pass independently checked source evidence. The implementation/finish review reports passing source validation and browser verification, including 200% text reflow at 320px, keyboard navigation, and preference recovery/refresh behavior. This documentation check does not add gameplay acceptance evidence.
