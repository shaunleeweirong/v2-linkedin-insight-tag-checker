import { describe, it, expect } from 'vitest';
import { parseInsightRequest, REQUEST_FILTERS } from './beacon-parse.js';

describe('parseInsightRequest', () => {
  it('recognises the Insight Tag library file', () => {
    const r = parseInsightRequest('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    expect(r).toMatchObject({ kind: 'library', isConversion: false });
  });

  it('parses the base page-load beacon (no conversionId)', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/collect/?pid=123456&fmt=js&v=2');
    expect(r).toMatchObject({ kind: 'collect', pid: '123456', conversionId: null, fmt: 'js' });
    expect(r.isConversion).toBe(false);
  });

  it('flags a conversion beacon by the presence of conversionId (image pixel)', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/collect/?pid=175804&conversionId=107612&fmt=img');
    expect(r).toMatchObject({ kind: 'collect', pid: '175804', conversionId: '107612', fmt: 'img' });
    expect(r.isConversion).toBe(true);
  });

  it('flags a conversion beacon even when fmt is not img (JS-triggered)', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/collect/?pid=175804&conversionId=999&fmt=gif');
    expect(r.isConversion).toBe(true);
    expect(r.conversionId).toBe('999');
  });

  it('handles the /collect path with no trailing slash', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/collect?pid=1&conversionId=2');
    expect(r.isConversion).toBe(true);
  });

  it('ignores unrelated URLs', () => {
    expect(parseInsightRequest('https://example.com/collect?pid=1')).toBeNull();
    expect(parseInsightRequest('https://www.linkedin.com/feed')).toBeNull();
    expect(parseInsightRequest('not a url')).toBeNull();
  });

  it('does not treat an empty conversionId as a conversion', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/collect/?pid=1&conversionId=');
    expect(r.isConversion).toBe(false);
  });
});

// The current Insight Tag (scriptVersion 1000010) POSTs its page-visit signal to
// /wa/ with a gzipped body instead of the legacy GET /collect?pid=… — on sites
// that have fully migrated, /collect never fires at all.
describe('the /wa/ signal endpoint', () => {
  it('recognises the /wa/ endpoint as a LinkedIn request', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g');
    expect(r).toMatchObject({ kind: 'wa', isConversion: false });
  });

  it('carries no pid from the URL — /wa/ keeps it in the request body', () => {
    const r = parseInsightRequest('https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g');
    expect(r.pid).toBeNull();
  });

  it('is listed in REQUEST_FILTERS so webRequest actually delivers it', () => {
    expect(REQUEST_FILTERS).toContain('*://px.ads.linkedin.com/wa/*');
  });

  it('does not claim unrelated paths that merely start with "wa"', () => {
    expect(parseInsightRequest('https://px.ads.linkedin.com/wallet')).toBeNull();
    expect(parseInsightRequest('https://px.ads.linkedin.com/watch/x')).toBeNull();
  });
});

describe('the attribution_trigger ping', () => {
  it('parses its pid, which it carries in the query string', () => {
    const r = parseInsightRequest(
      'https://px.ads.linkedin.com/attribution_trigger?pid=843739&time=1786531307969'
    );
    expect(r).toMatchObject({ kind: 'attribution', pid: '843739', isConversion: false });
  });

  it('is listed in REQUEST_FILTERS', () => {
    expect(REQUEST_FILTERS).toContain('*://px.ads.linkedin.com/attribution_trigger*');
  });
});
