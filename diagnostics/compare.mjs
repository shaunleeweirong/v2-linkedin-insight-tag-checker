// Diff the extension's verdict before vs after the fix, site by site.
import fs from 'node:fs';
const REPO = '/Users/shaunlee/Desktop/apps/linkedin-insight-tag-checker';
const NEW = await import(REPO + '/src/shared/state.js');
const OLD = await import('/Users/shaunlee/Downloads/insight-tag-checker-0.4.3/assets/state-C0AQcsTb.js');

const before = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const after = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const byySite = new Map(after.map((r) => [r.site, r]));

const verdict = (mod, st, isNew) =>
  st ? { status: (isNew ? mod.deriveBaseStatus : mod.d)(st), pids: (isNew ? mod.getPartnerIds : mod.g)(st) }
     : { status: 'NO-STATE', pids: [] };

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('SITE', 30) + pad('BEFORE', 26) + pad('AFTER', 26) + 'CHANGE');
console.log('-'.repeat(104));

let fixed = 0, regressed = 0, same = 0;
for (const b of before) {
  const a = byySite.get(b.site);
  if (!a) continue;
  const vb = verdict(OLD, b.extState?.state, false);
  const va = verdict(NEW, a.extState?.state, true);
  const hadTag = (r) => (r.requests || []).some((q) => /licdn|ads\.linkedin/.test(q.url)) || r.globals?.scriptPresent === true;
  if (!hadTag(b) && !hadTag(a)) continue;

  const sb = `${vb.status}/${vb.pids.length ? vb.pids.join(',') : '—'}`;
  const sa = `${va.status}/${va.pids.length ? va.pids.join(',') : '—'}`;

  let change = '';
  const gainedPids = va.pids.length > vb.pids.length;
  const lostPids = va.pids.length < vb.pids.length;
  const wasBrokenPanel = vb.status === 'firing' && vb.pids.length === 0;
  const isBrokenPanel = va.status === 'firing' && va.pids.length === 0;

  if (wasBrokenPanel && !isBrokenPanel) { change = '*** FIXED: firing-without-PID resolved ***'; fixed++; }
  else if (isBrokenPanel) { change = '!!! STILL firing-without-PID'; regressed++; }
  else if (lostPids) { change = '!!! LOST partner IDs'; regressed++; }
  else if (vb.status === 'firing' && va.status !== 'firing' && va.status !== 'loaded') { change = '!!! lost firing verdict'; regressed++; }
  else if (vb.status === 'firing' && va.status === 'loaded') { change = 'now "loaded" (script only, sent nothing)'; }
  else if (gainedPids) { change = 'gained partner IDs'; fixed++; }
  else same++;

  console.log(pad(b.site.replace(/^https?:\/\//, '').slice(0, 28), 30) + pad(sb.slice(0, 24), 26) + pad(sa.slice(0, 24), 26) + change);
}
console.log(`\nimproved: ${fixed}   unchanged: ${same}   needs attention: ${regressed}`);
