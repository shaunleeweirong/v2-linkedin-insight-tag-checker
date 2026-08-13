// Sweep harness: loads the SHIPPED 0.4.3 extension into real Chromium, visits
// sites, and captures three layers of evidence per site:
//   1. every LinkedIn-related network request (host, path, method, params, body)
//   2. the page's Insight Tag globals (what the MAIN-world script would read)
//   3. what the extension ACTUALLY recorded (chrome.storage.session per tab)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXT = process.env.EXT || '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3';
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad/results.json';
const SITES = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DWELL = Number(process.env.DWELL || 9000);

const LI_RE = /linkedin\.com|licdn\.com/i;

const ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'button#truste-consent-button',
  '.cc-allow', '.cc-btn.cc-allow',
  '[data-testid="uc-accept-all-button"]',
  'button[aria-label*="Accept all" i]',
  'button:has-text("Accept all")',
  'button:has-text("Accept All Cookies")',
  'button:has-text("Allow all")',
  'button:has-text("I Accept")',
  'button:has-text("Accept")',
  'a:has-text("Accept all")'
];

const READ_GLOBALS = () => {
  const g = {};
  try {
    g.dataPartnerIds = Array.isArray(window._linkedin_data_partner_ids)
      ? window._linkedin_data_partner_ids.map(String) : null;
  } catch { g.dataPartnerIds = 'ERR'; }
  try { g.partnerId = window._linkedin_partner_id ?? null; } catch { g.partnerId = 'ERR'; }
  try { g.lintrkType = typeof window.lintrk; } catch { g.lintrkType = 'ERR'; }
  try {
    g.scriptPresent = !!document.querySelector('script[src*="snap.licdn.com/li.lms-analytics"]');
  } catch { g.scriptPresent = 'ERR'; }
  try {
    g.noscriptPixel = Array.from(document.querySelectorAll('noscript')).some((n) =>
      /px\.ads\.linkedin\.com\/collect/.test(n.textContent || n.innerHTML || ''));
  } catch { g.noscriptPixel = 'ERR'; }
  try {
    g.cmp = window.OneTrust ? 'OneTrust'
      : (window.Cookiebot !== undefined ? 'Cookiebot'
      : (window.truste ? 'TrustArc'
      : (window.UC_UI || window.usercentrics ? 'Usercentrics'
      : (window.Osano ? 'Osano'
      : (window.Didomi || window.didomiOnReady ? 'Didomi'
      : (typeof window.__tcfapi === 'function' ? 'IAB TCF' : null))))));
  } catch { g.cmp = 'ERR'; }
  // iframe check: is the tag only inside a frame?
  try { g.frameCount = window.frames.length; } catch { g.frameCount = -1; }
  return g;
};

async function main() {
  const userDataDir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad', 'prof-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check'
    ],
    viewport: { width: 1280, height: 900 }
  });

  // Wait for the extension service worker.
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  console.error('extension id:', extId);

  const results = [];

  for (const site of SITES) {
    const rec = { site, requests: [], globals: null, extState: null, consentClicked: false, error: null };
    const page = await context.newPage();

    const onReq = (req) => {
      const u = req.url();
      if (!LI_RE.test(u)) return;
      let body = null;
      try { body = req.postData(); } catch {}
      let decodedBody = null;
      if (body) {
        try { decodedBody = zlib.gunzipSync(Buffer.from(body, 'base64')).toString('utf8').slice(0, 600); } catch {}
      }
      rec.requests.push({
        decodedBody,
        url: u.slice(0, 600),
        method: req.method(),
        resourceType: req.resourceType(),
        isNav: req.isNavigationRequest(),
        frameUrl: (() => { try { return req.frame()?.url()?.slice(0, 120) ?? null; } catch { return null; } })(),
        body: body ? String(body).slice(0, 500) : null
      });
    };
    context.on('request', onReq);

    try {
      await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(DWELL);

      // Best-effort consent accept, then dwell again.
      for (const sel of ACCEPT_SELECTORS) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 250 })) {
            await el.click({ timeout: 2000, force: true });
            rec.consentClicked = sel;
            break;
          }
        } catch {}
      }
      if (rec.consentClicked) await page.waitForTimeout(6000);

      rec.globals = await page.evaluate(READ_GLOBALS).catch((e) => ({ evalError: String(e) }));

      // Ask the extension's SW what it recorded for THIS tab.
      rec.extState = await sw.evaluate(async (targetUrlHost) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => {
          try { return new URL(t.url).host.includes(targetUrlHost); } catch { return false; }
        });
        if (!tab) return { noTab: true, tabs: tabs.map((t) => t.url).slice(0, 10) };
        const key = 'tab:' + tab.id;
        const got = await chrome.storage.session.get(key);
        const st = got[key] || null;
        return { tabId: tab.id, tabUrl: tab.url, state: st };
      }, new URL(site).host.replace(/^www\./, '')).catch((e) => ({ swEvalError: String(e) }));
    } catch (e) {
      rec.error = String(e).slice(0, 300);
    } finally {
      context.off('request', onReq);
      await page.close().catch(() => {});
    }

    results.push(rec);
    const li = rec.requests.filter((r) => /snap\.licdn\.com\/li\.lms-analytics/.test(r.url)).length;
    const col = rec.requests.filter((r) => /ads\.linkedin\.com/.test(r.url)).length;
    console.error(`${site}  lib=${li} liHits=${col} pids=${JSON.stringify(rec.globals?.dataPartnerIds ?? rec.globals?.partnerId)} cmp=${rec.globals?.cmp}`);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  }

  await context.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.error('DONE ->', OUT);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
