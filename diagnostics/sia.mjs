import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXT = '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3';
const userDataDir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad', 'sia-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check'],
  viewport: { width: 1280, height: 900 }
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });

const page = await context.newPage();
const docs = [];
page.on('framenavigated', (f) => { if (f === page.mainFrame()) docs.push(f.url()); });
await page.goto('https://www.singaporeair.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(12000);

console.log('main-frame navigations:', docs);
console.log('final tab url        :', page.url());

const dump = await sw.evaluate(async () => {
  const all = await chrome.storage.session.get(null);
  const tabs = await chrome.tabs.query({});
  return { keys: Object.keys(all), all, tabs: tabs.map((t) => ({ id: t.id, url: t.url })) };
});
console.log('\nopen tabs        :', JSON.stringify(dump.tabs));
console.log('storage.session keys:', dump.keys);
for (const k of dump.keys) {
  const s = dump.all[k];
  console.log(`\n--- ${k} ---`);
  console.log('  pageSeq', s.pageSeq, '| url', s.url);
  console.log('  library   ', JSON.stringify(s.library));
  console.log('  baseBeacon', JSON.stringify(s.baseBeacon));
  console.log('  domGlobals', JSON.stringify(s.domGlobals));
  console.log('  timeline  ', (s.timeline || []).map((t) => `${t.kind}:${t.providerKey || t.url || ''}`).join(' | '));
}
await context.close();
