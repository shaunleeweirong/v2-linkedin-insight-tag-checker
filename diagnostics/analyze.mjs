import fs from 'node:fs';
import { d as deriveBaseStatus, g as getPartnerIds }
  from '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3/assets/state-C0AQcsTb.js';

const results = JSON.parse(fs.readFileSync(process.argv[2] || '/private/tmp/claude-501/-Users-shaunlee/11dd4d2e-44c0-49d5-b41a-b8e2d32dba3d/scratchpad/results.json', 'utf8'));

const rows = [];
for (const r of results) {
  const reqs = r.requests || [];
  const lib = reqs.filter((q) => /snap\.licdn\.com\/li\.lms-analytics/.test(q.url));
  const collect = reqs.filter((q) => /px\.ads\.linkedin\.com\/collect/.test(q.url));
  const wa = reqs.filter((q) => /px\.ads\.linkedin\.com\/wa\//.test(q.url));
  const attr = reqs.filter((q) => /attribution_trigger/.test(q.url));
  const collectPids = [...new Set(collect.map((q) => { try { return new URL(q.url).searchParams.get('pid'); } catch { return null; } }).filter(Boolean))];
  const waPids = [...new Set(wa.flatMap((q) => { try { return (JSON.parse(q.decodedBody || '{}').pids || []).map(String); } catch { return []; } }))];
  const scriptVersions = [...new Set(wa.map((q) => { try { return String(JSON.parse(q.decodedBody || '{}').scriptVersion ?? ''); } catch { return ''; } }).filter(Boolean))];

  const st = r.extState?.state || null;
  const extStatus = st ? deriveBaseStatus(st) : 'NO-STATE';
  const extPids = st ? getPartnerIds(st) : [];

  const domPids = (r.globals?.dataPartnerIds || []).concat(r.globals?.partnerId ? [String(r.globals.partnerId)] : []);

  rows.push({
    site: r.site.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 32),
    hasTag: lib.length > 0 || collect.length > 0 || wa.length > 0 || (r.globals?.scriptPresent === true),
    lib: lib.length, collect: collect.length, wa: wa.length, attr: attr.length,
    collectPids, waPids, domPids, scriptVersions,
    lintrk: r.globals?.lintrkType, cmp: r.globals?.cmp, consent: r.consentClicked || '',
    extStatus, extPids,
    symptom: extStatus === 'firing' && extPids.length === 0,
    waOnly: wa.length > 0 && collect.length === 0,
    beaconOnlyPid: domPids.length === 0 && (collectPids.length > 0 || waPids.length > 0),
    error: r.error
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('SITE', 34) + pad('lib', 4) + pad('col', 4) + pad('wa', 4) + pad('DOM pids', 12) + pad('beacon pids', 14) + pad('EXT STATUS', 12) + pad('EXT PIDs', 12) + 'FLAGS');
console.log('-'.repeat(120));
for (const r of rows) {
  if (!r.hasTag) { console.log(pad(r.site, 34) + '  — no LinkedIn Insight Tag on this page —' + (r.error ? '  ERR:' + r.error.slice(0, 40) : '')); continue; }
  const flags = [];
  if (r.symptom) flags.push('*** FIRING-BUT-NO-PID ***');
  if (r.waOnly) flags.push('WA-ONLY(pid in POST body)');
  if (r.beaconOnlyPid) flags.push('pid-only-from-beacon');
  if (r.consent) flags.push('consent-clicked');
  console.log(
    pad(r.site, 34) + pad(r.lib, 4) + pad(r.collect, 4) + pad(r.wa, 4) +
    pad(r.domPids.join(',') || '—', 12) +
    pad([...new Set([...r.collectPids, ...r.waPids])].join(',') || '—', 14) +
    pad(r.extStatus, 12) + pad(r.extPids.join(',') || '«none»', 12) + flags.join(' ')
  );
}

const tagged = rows.filter((r) => r.hasTag);
console.log('\n=== SUMMARY ===');
console.log('sites visited              :', rows.length);
console.log('with a LinkedIn Insight Tag:', tagged.length);
console.log('  FIRING but NO PARTNER ID :', tagged.filter((r) => r.symptom).length, tagged.filter((r) => r.symptom).map((r) => r.site));
console.log('  using /wa/ POST endpoint  :', tagged.filter((r) => r.wa > 0).length);
console.log('  /wa/ with NO /collect     :', tagged.filter((r) => r.waOnly).length, tagged.filter((r) => r.waOnly).map((r) => r.site));
console.log('  DOM partner-id globals    :', tagged.filter((r) => r.domPids.length).length, '/', tagged.length, '(rest depend 100% on the beacon)');
console.log('  PID only obtainable from beacon:', tagged.filter((r) => r.beaconOnlyPid).length);

console.log('\n=== LinkedIn tag scriptVersion  vs  legacy /collect beacon ===');
const byVer = new Map();
for (const r of tagged) for (const v of r.scriptVersions) {
  if (!byVer.has(v)) byVer.set(v, { v, sites: [], withCollect: 0, without: 0 });
  const e = byVer.get(v); e.sites.push(r.site); r.collect > 0 ? e.withCollect++ : e.without++;
}
for (const e of [...byVer.values()].sort((a, b) => Number(a.v) - Number(b.v)))
  console.log(`  scriptVersion ${pad(e.v, 10)} sites=${pad(e.sites.length, 3)} sends /collect: ${e.withCollect}   sends ONLY /wa/: ${e.without}`);
console.log('\n  extension can read a PID from /collect query params : YES');
console.log('  extension can read a PID from /wa/ POST body        : NO (endpoint unmatched + body never parsed)');
