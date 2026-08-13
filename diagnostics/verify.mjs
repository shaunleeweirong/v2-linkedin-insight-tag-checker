// (a) What are the ACTUAL wire bytes of the /wa/ POST body? (raw gzip vs base64 text)
// (b) Do singaporeair's LinkedIn beacons really arrive with tabId === -1?
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXT = '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3';
const userDataDir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad', 'ver-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check'],
  viewport: { width: 1280, height: 900 }
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });

// (b) instrument the extension's own service worker with a probe listener
await sw.evaluate(() => {
  globalThis.__probe = [];
  chrome.webRequest.onResponseStarted.addListener(
    (d) => globalThis.__probe.push({ tabId: d.tabId, type: d.type, initiator: d.initiator || null, url: d.url.slice(0, 90) }),
    { urls: ['*://*.licdn.com/*', '*://*.linkedin.com/*'] }
  );
});

// (a) capture raw post bytes
const bodies = [];
context.on('request', (r) => {
  if (!/px\.ads\.linkedin\.com\/wa\//.test(r.url())) return;
  try { const b = r.postDataBuffer(); if (b) bodies.push(b); } catch {}
});

for (const site of ['https://www.hubspot.com/', 'https://www.singaporeair.com/']) {
  const p = await context.newPage();
  await p.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(11000);
  await p.close().catch(() => {});
}

console.log('=== (a) /wa/ POST body wire format ===');
for (const b of bodies.slice(0, 2)) {
  const head = [...b.subarray(0, 4)].map((x) => '0x' + x.toString(16).padStart(2, '0')).join(' ');
  console.log(`  length=${b.length}  first4=[${head}]  asAscii="${b.subarray(0, 6).toString('latin1')}"`);
  let how = 'unknown';
  try { zlib.gunzipSync(b); how = 'RAW GZIP on the wire (bytes -> gunzip -> JSON)'; }
  catch {
    try { zlib.gunzipSync(Buffer.from(b.toString('latin1'), 'base64')); how = 'BASE64 TEXT of gzip (bytes -> ascii -> base64-decode -> gunzip -> JSON)'; } catch {}
  }
  console.log(`  => ${how}`);
}

console.log('\n=== (b) tabId attribution seen by the extension service worker ===');
const probe = await sw.evaluate(() => globalThis.__probe);
const bySite = new Map();
for (const e of probe) {
  const k = (e.initiator || 'no-initiator');
  if (!bySite.has(k)) bySite.set(k, []);
  bySite.get(k).push(e);
}
for (const [init, evs] of bySite) {
  const tabIds = [...new Set(evs.map((e) => e.tabId))];
  console.log(`  initiator=${init}  events=${evs.length}  tabIds=${JSON.stringify(tabIds)}`);
}
await context.close();
