import { describe, it, expect } from 'vitest';
import { ALL_REQUEST_FILTERS, matchProvider, decodeRequest, PROVIDERS } from './index.js';
import { decodeParams, truncate, MAX_VALUE_LEN } from './decode.js';

const findParam = (params, key) => params.find((p) => p.key === key);

describe('decodeParams', () => {
  it('labels known params and passes unknown ones through raw', () => {
    const params = decodeParams(new URLSearchParams('pid=1&mystery=42'), {
      pid: { name: 'Partner ID', group: 'General' }
    });
    expect(findParam(params, 'pid')).toMatchObject({ name: 'Partner ID', group: 'General' });
    // Undocumented params must survive — dropping them would defeat the decoder.
    expect(findParam(params, 'mystery')).toMatchObject({ name: 'mystery', group: 'Other', value: '42' });
  });

  it('truncates oversized values', () => {
    const long = 'x'.repeat(MAX_VALUE_LEN + 50);
    expect(truncate(long).length).toBe(MAX_VALUE_LEN + 1); // + the ellipsis
  });
});

describe('LinkedIn provider', () => {
  it('decodes a conversion beacon with friendly names', () => {
    const r = decodeRequest('https://px.ads.linkedin.com/collect/?pid=175804&conversionId=107612&fmt=img');
    expect(r).toMatchObject({ providerKey: 'LINKEDIN', tier: 'diagnosed', isConversion: true });
    expect(r.label).toBe('Conversion #107612');
    expect(findParam(r.params, 'conversionId')).toMatchObject({ name: 'Conversion ID' });
  });

  it('labels the base beacon distinctly from a conversion', () => {
    const r = decodeRequest('https://px.ads.linkedin.com/collect/?pid=123&fmt=js');
    expect(r.label).toBe('Base Insight Tag');
    expect(r.isConversion).toBe(false);
  });

  it('recognises the library file', () => {
    const r = decodeRequest('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    expect(r).toMatchObject({ providerKey: 'LINKEDIN', event: 'library' });
  });
});

describe('GA4 provider', () => {
  const URL_GA4 =
    'https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&en=purchase&cid=1.2&ep.method=stripe&up.plan=pro';

  it('decodes measurement ID and event name', () => {
    const r = decodeRequest(URL_GA4);
    expect(r).toMatchObject({ providerKey: 'GA4', tier: 'observed', account: 'G-ABC123' });
    expect(r.label).toBe('GA4 purchase');
  });

  it('expands ep.* and up.* dynamic params', () => {
    const { params } = decodeRequest(URL_GA4);
    expect(findParam(params, 'ep.method')).toMatchObject({ name: 'Event Param: method', group: 'Event' });
    expect(findParam(params, 'up.plan')).toMatchObject({ name: 'User Property: plan', group: 'User' });
  });

  it('is scoped to Google-owned hosts (first-party /g/collect is out of scope)', () => {
    expect(matchProvider('https://analytics.example.com/g/collect?v=2&tid=G-1')).toBeNull();
    expect(matchProvider('https://analytics.google.com/g/collect?v=2')).not.toBeNull();
  });
});

describe('Google Ads provider', () => {
  it('extracts the conversion ID from the URL path, not the query', () => {
    const r = decodeRequest(
      'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123456/?label=abc&random=1'
    );
    expect(r).toMatchObject({ providerKey: 'GOOGLEADS', account: 'AW-123456', conversionId: '123456' });
    expect(r.label).toContain('AW-123456');
  });

  it('handles the googleadservices non-viewthrough form', () => {
    const r = decodeRequest('https://www.googleadservices.com/pagead/conversion/987/?label=xyz');
    expect(r.account).toBe('AW-987');
    expect(findParam(r.params, 'label')).toMatchObject({ name: 'Conversion Label' });
  });
});

describe('Meta Pixel provider', () => {
  it('decodes pixel ID, event and bracketed custom data', () => {
    const r = decodeRequest('https://www.facebook.com/tr/?id=999&ev=Lead&cd[value]=10&cd[currency]=USD');
    expect(r).toMatchObject({ providerKey: 'METAPIXEL', account: '999', event: 'Lead' });
    expect(findParam(r.params, 'cd[value]')).toMatchObject({
      name: 'Custom Data: value',
      group: 'Custom Data'
    });
  });
});

describe('registry', () => {
  it('returns null for unrelated URLs', () => {
    expect(matchProvider('https://example.com/collect?pid=1')).toBeNull();
    expect(decodeRequest('not a url')).toBeNull();
  });

  it('keeps LinkedIn as the only diagnosed provider', () => {
    const diagnosed = PROVIDERS.filter((p) => p.tier === 'diagnosed').map((p) => p.key);
    expect(diagnosed).toEqual(['LINKEDIN']);
  });

  it('aggregates listener filters for every provider', () => {
    for (const p of PROVIDERS) {
      for (const f of p.filters) expect(ALL_REQUEST_FILTERS).toContain(f);
    }
  });

  it('does not let one vendor claim another vendor URL', () => {
    expect(matchProvider('https://px.ads.linkedin.com/collect?pid=1').key).toBe('LINKEDIN');
    expect(matchProvider('https://www.facebook.com/tr/?id=1').key).toBe('METAPIXEL');
  });
});
