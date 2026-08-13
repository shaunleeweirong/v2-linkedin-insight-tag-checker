import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const REPO='/Users/shaunlee/Desktop/apps/linkedin-insight-tag-checker';
const { deriveBaseStatus, getPartnerIds } = await import(REPO + '/src/shared/state.js');
const dir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad','e2e2-'));
const ctx = await chromium.launchPersistentContext(dir, { headless:false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args:[`--disable-extensions-except=${REPO}/dist`,`--load-extension=${REPO}/dist`,'--no-first-run','--no-default-browser-check'], viewport:{width:1280,height:900}});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:20000});

async function check(site, { blockSignals = false } = {}) {
  const p = await ctx.newPage();
  if (blockSignals) await p.route(/px\.ads\.linkedin\.com\/(collect|wa)/, r => r.abort());
  await p.goto(site,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  await p.waitForTimeout(10000);
  const st = await sw.evaluate(async (host)=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(t=>{try{return new URL(t.url).host.includes(host)}catch{return false}});
    if(!tab) return null;
    const key='tab:'+tab.id;
    return (await chrome.storage.session.get(key))[key]||null;
  }, new URL(site).host.replace(/^www\./,''));
  await p.close();
  const label = (blockSignals ? 'signals blocked: ' : '') + site.replace(/^https?:\/\//,'');
  console.log(`${label.padEnd(42)} status=${String(st?deriveBaseStatus(st):'NO STATE').padEnd(10)} PIDs=${st?JSON.stringify(getPartnerIds(st)):'—'}`);
}

await check('https://www.hubspot.com/');
await check('https://endowus.com/');
await check('https://www.snowflake.com/en/');
await check('https://www.datadoghq.com/', { blockSignals: true });
await ctx.close();
