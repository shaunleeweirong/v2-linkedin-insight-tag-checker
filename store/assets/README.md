# Store marketing assets

Pixel-exact Chrome Web Store images, generated from HTML so they're easy to edit.

## Files (ready to upload)

| File | Size | Slot |
| --- | --- | --- |
| `store-icon-128.png` | 128×128 | Store icon |
| `screenshot-01-firing.png` | 1280×800 | Screenshot — the core verdict |
| `screenshot-02-conversions.png` | 1280×800 | Screenshot — timeline survives navigation |
| `screenshot-03-decoder.png` | 1280×800 | Screenshot — decoded params + 17 platforms |
| `screenshot-04-truth.png` | 1280×800 | Screenshot — the four states |
| `screenshot-05-local.png` | 1280×800 | Screenshot — local-only + exportable report |
| `promo-small-440x280.png` | 440×280 | Small promo tile (required) |
| `promo-marquee-1400x560.png` | 1400×560 | Marquee promo tile (optional) |

The Chrome Web Store accepts a maximum of **5** screenshots, so each slot has to
earn its place. Keep them matched to what the extension actually does — a
screenshot of a UI that no longer exists is worse than one screenshot fewer.

## Regenerate

The images are HTML pages (`html/`) rendered by headless Chromium at exact
viewport sizes.

Playwright is deliberately **not** a project dependency — it is only needed for
marketing art, so install it on demand:

```bash
npm install --no-save playwright
node store/assets/build.mjs     # copy/layout  → html/
node store/assets/render.mjs    # html/        → *.png
```

`render.mjs` uses a pre-installed Chromium at `/opt/pw-browsers/chromium` when one
exists (override with `CHROMIUM_PATH`), otherwise it falls back to whatever
Playwright resolves — this avoids re-downloading a browser on images that already
ship one. It renders at `deviceScaleFactor: 1` so each PNG's pixel size equals its
CSS viewport, which is what the store validates.

Edit copy, layout and the mock UI in `build.mjs`. It has two mockup builders:
`popup()` for the toolbar popup and `panel()` for the side-panel timeline.

Verify dimensions afterwards:

```bash
node -e "const{readFileSync,readdirSync}=require('fs');for(const f of readdirSync('store/assets').filter(n=>n.endsWith('.png')).sort()){const b=readFileSync('store/assets/'+f);console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20),f)}"
```

The store icon is produced separately by `scripts/gen-icons.mjs` (dependency-free).
