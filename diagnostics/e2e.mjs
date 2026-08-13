import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const EXT = process.env.EXT || '/Users/shaunlee/Desktop/apps/linkedin-insight-tag-checker/dist';
const dir = fs.mkdtempSync(path.join('/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad','e2e-'));
const ctx = await chromium.launchPersistentContext(dir, { headless:false,
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--no-first-run','--no-default-browser-check'], viewport:{width:1280,height:900}});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:20000});
const errs=[]; sw.on('console', m => { if(m.type()==='error') errs.push(m.text()); });

for (const site of JSON.parse(process.argv[2])) {
  const seen={collect:0,wa:0,lib:0};
  const onReq=r=>{const u=r.url();
    if(/snap\.licdn\.com\/li\.lms-analytics/.test(u))seen.lib++;
    else if(/px\.ads\.linkedin\.com\/collect/.test(u))seen.collect++;
    else if(/px\.ads\.linkedin\.com\/wa\//.test(u))seen.wa++;};
  ctx.on('request',onReq);
  const p=await ctx.newPage();
  await p.goto(site,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  await p.waitForTimeout(10000);
  const out = await sw.evaluate(async (host)=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(t=>{try{return new URL(t.url).host.includes(host)}catch{return false}});
    if(!tab) return null;
    const key='tab:'+tab.id;
    const st=(await chrome.storage.session.get(key))[key]||null;
    const res=await chrome.runtime.sendMessage({type:'getState',tabId:tab.id}).catch(()=>null);
    return { status: res?.status, state: st };
  }, new URL(site).host.replace(/^www\./,''));
  ctx.off('request',onReq);
  const st=out?.state;
  const pids=[...new Set([...(st?.domGlobals?.partnerIds||[]), ...(st?.baseBeacon?.pid?[st.baseBeacon.pid]:[])])].join(',');
  console.log(`${site.replace(/^https?:\/\//,'').padEnd(26)} net(lib=${seen.lib} collect=${seen.collect} wa=${seen.wa})  ext.status=${String(out?.status).padEnd(9)} baseBeacon.pid=${st?.baseBeacon?.pid??'—'}  PIDS=${pids||'«none»'}`);
  await p.close();
}
if(errs.length){ console.log('\nSERVICE WORKER ERRORS:'); errs.forEach(e=>console.log('  !',e)); } else console.log('\nno service-worker errors');
await ctx.close();
