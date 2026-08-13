import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const REPO='/Users/shaunlee/Desktop/apps/linkedin-insight-tag-checker';
const EXT = process.env.EXT || REPO + '/dist';
const LABEL = process.env.LABEL || 'build';
// Always judge with the CURRENT logic so before/after are compared on equal terms.
const { deriveBaseStatus, getPartnerIds } = await import(REPO + '/src/shared/state.js');
const dir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad','rs3-'));
const ctx = await chromium.launchPersistentContext(dir, { headless:false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-first-run','--no-default-browser-check'], viewport:{width:1280,height:900}});
const sw0 = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:20000});
const extId = new URL(sw0.url()).host;

const page = await ctx.newPage();
await page.goto('https://endowus.com/',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
await page.waitForTimeout(9000);
const tabId = await sw0.evaluate(async () =>
  (await chrome.tabs.query({})).find(x=>{try{return new URL(x.url).host.includes('endowus')}catch{return false}})?.id);

// Reader that does NOT depend on the worker object: an extension page has chrome.*
const reader = await ctx.newPage();
await reader.goto(`chrome-extension://${extId}/src/popup/popup.html`);
const read = async (id) => reader.evaluate(
  async (k) => (await chrome.storage.session.get('tab:'+k))['tab:'+k] || null, id);

let st = await read(tabId);
console.log(`[${LABEL}] BEFORE restart :`, deriveBaseStatus(st), JSON.stringify(getPartnerIds(st)));

const bs = await ctx.browser().newBrowserCDPSession();
const { targetInfos } = await bs.send('Target.getTargets');
const swTargets = targetInfos.filter(t => t.type==='service_worker' && t.url.startsWith('chrome-extension://'));
for (const t of swTargets) await bs.send('Target.closeTarget',{targetId:t.targetId}).catch(()=>{});
console.log(`[${LABEL}] terminated ${swTargets.length} extension worker(s)`);
await page.waitForTimeout(3000);

// Wake it with a NON-LinkedIn beacon — exactly the case that used to wipe the tab.
await page.evaluate(() => fetch('https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&en=scroll',{mode:'no-cors'}).catch(()=>{}));
await page.waitForTimeout(5000);

st = await read(tabId);
console.log(`[${LABEL}] AFTER  restart :`, st ? deriveBaseStatus(st) : 'NO STATE', JSON.stringify(st?getPartnerIds(st):[]));
await ctx.close();
