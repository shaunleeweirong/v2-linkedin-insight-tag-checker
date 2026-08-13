// Reproduces the service-worker restart clobber using the SHIPPED 0.4.3 modules.
// Models the exact apply()/hydrate() semantics read out of the shipped bundle:
//
//   apply(tabId, ev):  const t = MAP.get(tabId) || initialTabState();   <-- never hydrates
//                      MAP.set(tabId, reduce(t, ev)); storage.set(...)  <-- then PERSISTS it
//   hydrate(tabId):    MAP.has(tabId) ? MAP.get(tabId) : storage.get(tabId)   (popup path only)
import { p as parseInsightRequest, d as deriveBaseStatus, g as getPartnerIds, i as initialTabState, r as reduce }
  from '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3/assets/state-C0AQcsTb.js';

let MAP = new Map();            // module-scope Map inside the service worker
const STORAGE = new Map();      // chrome.storage.session

function apply(tabId, ev) {
  const prev = MAP.get(tabId) || initialTabState();   // <-- the bug: no storage read
  const next = reduce(prev, ev, Date.now());
  MAP.set(tabId, next);
  STORAGE.set('tab:' + tabId, next);                  // <-- persists the clobbered state
  return next;
}
function hydrate(tabId) {                              // what the popup's getState uses
  if (MAP.has(tabId)) return MAP.get(tabId);
  return STORAGE.get('tab:' + tabId) || initialTabState();
}
function restartServiceWorker() { MAP = new Map(); }   // MV3 idle termination (~30s)

function popup(tabId, label) {
  const st = hydrate(tabId);
  const status = deriveBaseStatus(st);
  const pids = getPartnerIds(st);
  console.log(
    `${label.padEnd(34)} status=${status.toUpperCase().padEnd(9)} ` +
    `PARTNER ID=${pids.length ? pids.join(',') : '«Not detected yet»'}`
  );
  return { status, pids };
}

const TAB = 42;
const req = (url) => ({ type: 'request', req: parseInsightRequest(url), decoded: { providerKey: 'X', params: [] }, phase: 'completed', statusCode: 200 });

console.log('--- page loads, everything observed correctly ---');
apply(TAB, { type: 'navigation', url: 'https://endowus.com/' });
apply(TAB, req('https://snap.licdn.com/li.lms-analytics/insight.min.js'));
apply(TAB, req('https://px.ads.linkedin.com/collect?v=2&fmt=js&pid=843739'));
apply(TAB, { type: 'dom', globals: { partnerIds: [], hasLintrk: true, scriptPresent: true, noscriptPixel: false, cmp: null } });
popup(TAB, 'popup opened immediately:');

console.log('\n--- 30s idle: MV3 terminates the service worker ---');
restartServiceWorker();

console.log('--- a GA4 beacon (not LinkedIn) wakes it back up ---');
apply(TAB, req('https://www.google-analytics.com/g/collect?v=2&tid=G-XXXX&en=scroll'));
popup(TAB, 'popup opened after wake:');

console.log('\n--- now a LinkedIn library re-request (SPA route / cache revalidation) ---');
apply(TAB, req('https://snap.licdn.com/li.lms-analytics/insight.min.js'));
popup(TAB, 'popup after library re-request:');
