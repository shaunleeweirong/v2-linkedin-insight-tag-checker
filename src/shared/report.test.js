import { describe, it, expect } from 'vitest';
import { formatReport, timelineToCsv } from './report.js';
import { initialTabState, reduce } from './state.js';
import { parseInsightRequest } from './beacon-parse.js';
import { decodeRequest } from './providers/index.js';

function run(events, start = null) {
  return events.reduce((s, e, i) => reduce(s, e, i + 1), start);
}

const requestEvent = (url, phase, extra = {}) => ({
  type: 'request',
  req: parseInsightRequest(url),
  decoded: decodeRequest(url),
  phase,
  ...extra
});

describe('formatReport', () => {
  it('states the verdict, PIDs and conversions in plain language', () => {
    const s = run([
      { type: 'dom', globals: { partnerIds: ['123456'], hasLintrk: true, scriptPresent: true } },
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123456&fmt=js', 'completed', {
        statusCode: 200
      }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123456&conversionId=777&fmt=gif', 'completed', {
        statusCode: 200
      })
    ]);

    const report = formatReport(s, { host: 'example.com', now: 1_700_000_000_000 });
    expect(report).toContain('example.com');
    expect(report).toContain('FIRING');
    expect(report).toContain('123456');
    expect(report).toContain('[fired] #777');
  });

  it('reports an empty state without claiming anything fired', () => {
    const report = formatReport(initialTabState(), { host: 'example.com' });
    expect(report).toContain('NOT FOUND');
    expect(report).toContain('none captured');
    expect(report).not.toContain('[fired]');
  });

  it('lists other vendors as context, separate from the verdict', () => {
    const s = run([
      { type: 'dom', globals: { partnerIds: ['1'], hasLintrk: true, scriptPresent: true } },
      requestEvent('https://www.facebook.com/tr/?id=9&ev=Lead', 'completed', { statusCode: 200 })
    ]);
    const report = formatReport(s, { host: 'example.com' });
    expect(report).toContain('Also seen on this page: Meta Pixel');
    expect(report).toContain('PRESENT, NOT FIRING');
  });
});

describe('timelineToCsv', () => {
  it('emits a header plus one row per entry', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/collect/?pid=1&conversionId=42&fmt=gif', 'completed', {
        statusCode: 200
      }),
      { type: 'navigation', url: 'https://example.com/thanks' }
    ]);

    const csv = timelineToCsv(s.timeline);
    const rows = csv.split('\n');
    expect(rows[0]).toContain('conversion_id');
    expect(csv).toContain('42');
    expect(csv).toContain('page load');
  });

  it('escapes quotes and commas so a URL cannot break the columns', () => {
    const csv = timelineToCsv([
      { kind: 'request', ts: 1, seq: 0, providerName: 'X', label: 'a,b "c"', url: 'https://e.com/?a=1,2' }
    ]);
    expect(csv).toContain('"a,b ""c"""');
  });

  it('distinguishes a navigation-cancelled beacon from a block', () => {
    const csv = timelineToCsv([
      { kind: 'request', ts: 1, seq: 0, providerName: 'LinkedIn', errorKind: 'aborted' },
      { kind: 'request', ts: 2, seq: 0, providerName: 'LinkedIn', errorKind: 'blocked' }
    ]);
    expect(csv).toContain('cancelled by navigation');
    expect(csv).toContain('blocked');
  });
});

describe('the loaded (script downloaded, nothing sent) status', () => {
  it('spells out the distinction in the copied report', () => {
    const s = run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'completed', {
        statusCode: 200
      })
    ]);
    const text = formatReport(s, { host: 'example.com', now: 1 });
    expect(text).toContain('SCRIPT LOADED');
    expect(text).not.toContain('FIRING —');
  });
});
