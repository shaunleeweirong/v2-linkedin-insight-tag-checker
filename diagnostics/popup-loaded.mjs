import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const REPO='/Users/shaunlee/Desktop/apps/linkedin-insight-tag-checker';
const { reduce, deriveBaseStatus } = await import(REPO + '/src/shared/state.js');
const { parseInsightRequest } = await import(REPO + '/src/shared/beacon-parse.js');
const { decodeRequest } = await import(REPO + '/src/shared/providers/index.js');

// A tag whose script downloaded and then sent nothing — the state Finding 2 introduces.
const LIB = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
let st = reduce(null, { type:'navigation', url:'https://example.com/' }, 1);
st = reduce(st, { type:'request', req:parseInsightRequest(LIB), decoded:decodeRequest(LIB), phase:'completed', statusCode:200 }, 2);
console.log('seeded state status =', deriveBaseStatus(st));

const dir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad','pl-'));
const ctx = await chromium.launchPersistentContext(dir, { headless:false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args:[`--disable-extensions-except=${REPO}/dist`,`--load-extension=${REPO}/dist`,'--no-first-run','--no-default-browser-check'], viewport:{width:420,height:640}});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:20000});
const extId = new URL(sw.url()).host;

const popup = await ctx.newPage();
await popup.goto('about:blank');
await sw.evaluate(async (state) => {
  const [self] = await chrome.tabs.query({ active:true, currentWindow:true });
  await chrome.storage.session.set({ ['tab:' + self.id]: state });
}, st);
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup.waitForTimeout(1200);
console.log('--- POPUP ---\n' + await popup.evaluate(() => document.body.innerText));
await popup.screenshot({ path: '/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad/popup-loaded.png' });
await ctx.close();
