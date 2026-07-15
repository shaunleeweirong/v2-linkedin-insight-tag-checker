import { describe, it, expect } from 'vitest';
import { parseInsightRequest } from './beacon-parse.js';

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
