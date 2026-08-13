// Repro: does the legacy /collect beacon (the extension's ONLY PID source on
// sites that don't set _linkedin_data_partner_ids) get skipped on repeat visits
// once LinkedIn's cookie-sync has already run?
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXT = '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3';
const SITE = process.argv[2] || 'https://endowus.com/';
const VISITS = Number(process.argv[3] || 3);
const LI_RE = /linkedin\.com|licdn\.com/i;

const userDataDir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad', 'repro-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check'],
  viewport: { width: 1280, height: 900 }
});

let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });

for (let visit = 1; visit <= VISITS; visit++) {
  const hits = [];
  const onReq = (req) => {
    const u = req.url();
    if (!LI_RE.test(u)) return;
    let body = null; try { body = req.postData(); } catch {}
    let decoded = null;
    if (body) { try { decoded = zlib.gunzipSync(Buffer.from(body, 'base64')).toString('utf8'); } catch {} }
    hits.push({ m: req.method(), u, decoded });
  };
  context.on('request', onReq);

  const page = await context.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);

  const st = await sw.evaluate(async (host) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => { try { return new URL(t.url).host.includes(host); } catch { return false; } });
    if (!tab) return null;
    const key = 'tab:' + tab.id;
    return (await chrome.storage.session.get(key))[key] || null;
  }, new URL(SITE).host.replace(/^www\./, ''));

  context.off('request', onReq);

  console.log(`\n================ VISIT ${visit} ================`);
  for (const h of hits) {
    console.log(`  ${h.m} ${h.u.slice(0, 130)}`);
    if (h.decoded) console.log(`       body-> ${h.decoded.slice(0, 200)}`);
  }
  const pidsFromState = [
    ...((st?.domGlobals?.partnerIds) || []),
    ...(st?.baseBeacon?.pid ? [st.baseBeacon.pid] : []),
    ...((st?.conversions || []).map(c => c.pid).filter(Boolean))
  ];
  const fired = !!(st?.baseBeacon?.fired || st?.library?.fired || (st?.conversions || []).some(c => c.fired));
  console.log(`  --> EXTENSION: status=${fired ? 'FIRING' : 'not-firing'}  library=${!!st?.library?.fired}  baseBeacon=${JSON.stringify(st?.baseBeacon)}  PARTNER IDS=${JSON.stringify([...new Set(pidsFromState)])}`);
  await page.close();
}

await context.close();
