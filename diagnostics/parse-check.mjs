// Imports the ACTUAL shipped 0.4.3 parser and runs candidate URLs through it.
import { p as parseInsightRequest, R as FILTERS, d as deriveBaseStatus, g as getPartnerIds, i as initial, r as reduce }
  from '/Users/shaunlee/Downloads/insight-tag-checker-0.4.3/assets/state-C0AQcsTb.js';
export { parseInsightRequest, FILTERS, deriveBaseStatus, getPartnerIds, initial, reduce };
if (process.argv[1].endsWith('parse-check.mjs')) {
  console.log('FILTERS =', FILTERS);
  const cases = [
    'https://px.ads.linkedin.com/collect?v=2&fmt=js&pid=12345&time=1',
    'https://px.ads.linkedin.com/collect/?v=2&fmt=js&pid=12345',
    'https://px.ads.linkedin.com/wa/?pid=12345',
    'https://px4.ads.linkedin.com/collect?v=2&fmt=js&pid=12345',
    'https://px.ads.linkedin.com/attribution_trigger?pid=12345',
    'https://snap.licdn.com/li.lms-analytics/insight.min.js',
    'https://www.linkedin.com/px/li/sync?pid=12345',
    'https://px.ads.linkedin.com/collect?pid=12345&conversionId=987'
  ];
  for (const c of cases) console.log(JSON.stringify(parseInsightRequest(c)), '  <-', c);
}
