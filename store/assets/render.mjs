// Renders the HTML in store/assets/html/ to pixel-exact PNGs.
//
// Run `node store/assets/build.mjs` first to regenerate the HTML, then this.
// Playwright is intentionally NOT a project dependency — it is only needed to
// regenerate marketing art, so install it on demand:
//
//   npm install --no-save playwright
//   node store/assets/build.mjs && node store/assets/render.mjs
//
// deviceScaleFactor is 1 so the PNG's pixel size equals the CSS viewport size,
// which is what the Chrome Web Store validates against.

import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = join(HERE, 'html');

// Target size per file, taken from the filename convention.
function sizeFor(name) {
  const explicit = name.match(/(\d+)x(\d+)/);
  if (explicit) return { width: Number(explicit[1]), height: Number(explicit[2]) };
  if (name.startsWith('screenshot-')) return { width: 1280, height: 800 };
  return null;
}

if (!existsSync(HTML_DIR)) {
  console.error('No html/ directory. Run: node store/assets/build.mjs');
  process.exit(1);
}

const files = readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
if (!files.length) {
  console.error('No HTML files found. Run: node store/assets/build.mjs');
  process.exit(1);
}

// Use a pre-installed Chromium when one is present (CI images often ship one whose
// build number doesn't match the npm playwright package), otherwise let Playwright
// resolve its own.
const PREINSTALLED = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOpts = existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

const browser = await chromium.launch(launchOpts);
let written = 0;

for (const file of files.sort()) {
  const name = basename(file, '.html');
  const size = sizeFor(name);
  if (!size) {
    console.warn(`skip ${file} — cannot infer target size from the filename`);
    continue;
  }

  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(HTML_DIR, file)).href, { waitUntil: 'load' });
  // The stylesheet pulls in a webfont; wait for it so text isn't captured in a
  // fallback face on the first paint.
  await page.evaluate(() => document.fonts.ready);

  const out = join(HERE, `${name}.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, ...size } });
  await page.close();

  console.log(`${name}.png  ${size.width}x${size.height}`);
  written += 1;
}

await browser.close();
console.log(`\nWrote ${written} PNG(s) to ${HERE}`);
