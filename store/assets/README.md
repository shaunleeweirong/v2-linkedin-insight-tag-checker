# Store marketing assets

Pixel-exact Chrome Web Store images, generated from HTML so they're easy to edit.

## Files (ready to upload)

| File | Size | Slot |
| --- | --- | --- |
| `store-icon-128.png` | 128×128 | Store icon |
| `screenshot-01-firing.png` | 1280×800 | Screenshot |
| `screenshot-02-conversions.png` | 1280×800 | Screenshot |
| `screenshot-03-consent.png` | 1280×800 | Screenshot |
| `screenshot-04-blocked.png` | 1280×800 | Screenshot |
| `screenshot-05-local.png` | 1280×800 | Screenshot |
| `promo-small-440x280.png` | 440×280 | Small promo tile (required) |
| `promo-marquee-1400x560.png` | 1400×560 | Marquee promo tile (optional) |

## Regenerate

The images are HTML pages (`html/`) rendered by a headless browser at exact
viewport sizes.

1. Edit copy/layout in `build.mjs`, then rebuild the HTML:
   ```bash
   node store/assets/build.mjs
   ```
2. Serve the HTML: `python3 -m http.server 8124 --directory store/assets/html`
3. In a headless browser (e.g. Playwright), for each page: set the viewport to the
   target size, open `http://localhost:8124/<file>.html`, and screenshot with a
   **CSS-pixel scale** (deviceScaleFactor 1) so output equals the viewport size.
4. Confirm dimensions: `sips -g pixelWidth -g pixelHeight <file>.png`.

The store icon is produced separately by `scripts/gen-icons.mjs` (dependency-free).
