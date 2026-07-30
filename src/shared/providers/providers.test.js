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

describe('Snapchat provider', () => {
  it('decodes pixel ID and event', () => {
    const r = decodeRequest('https://tr.snapchat.com/p?pid=abc-123&ev=PURCHASE&e_cur=USD&e_pr=99');
    expect(r).toMatchObject({ providerKey: 'SNAPCHAT', account: 'abc-123', event: 'PURCHASE' });
    expect(findParam(r.params, 'e_cur')).toMatchObject({ name: 'Currency', group: 'Ecommerce' });
  });

  it('matches load-balanced subdomains like tr6', () => {
    expect(matchProvider('https://tr6.snapchat.com/p?pid=1&ev=PAGE_VIEW').key).toBe('SNAPCHAT');
  });
});

describe('X (Twitter) provider', () => {
  it('pulls the event name out of the JSON events array', () => {
    const events = encodeURIComponent('[["pageview"]]');
    const r = decodeRequest(`https://analytics.twitter.com/i/adsct?txn_id=abc12&events=${events}`);
    expect(r).toMatchObject({ providerKey: 'TWITTER', account: 'abc12', event: 'pageview' });
  });

  it('still decodes when events is not valid JSON', () => {
    const r = decodeRequest('https://analytics.twitter.com/i/adsct?txn_id=abc12&events=broken');
    expect(r.event).toBeNull();
    expect(findParam(r.params, 'events').value).toBe('broken');
  });

  it('matches the t.co route', () => {
    expect(matchProvider('https://t.co/i/adsct?txn_id=1').key).toBe('TWITTER');
  });
});

describe('Pinterest provider', () => {
  it('decodes tag ID, event and bracketed event data', () => {
    const r = decodeRequest(
      'https://ct.pinterest.com/v3/?tid=2612345&event=checkout&ed[value]=25&ed[currency]=USD'
    );
    expect(r).toMatchObject({ providerKey: 'PINTEREST', account: '2612345', event: 'checkout' });
    expect(findParam(r.params, 'ed[value]')).toMatchObject({ name: 'Revenue', group: 'Ecommerce' });
  });

  it('labels undeclared ed[...] keys readably rather than dropping them', () => {
    const r = decodeRequest('https://ct.pinterest.com/v3/?tid=1&ed[custom_thing]=x');
    expect(findParam(r.params, 'ed[custom_thing]')).toMatchObject({
      name: 'Event Data: custom_thing'
    });
  });
});

describe('TikTok provider', () => {
  it('detects the request and decodes whatever is in the query string', () => {
    const r = decodeRequest('https://analytics.tiktok.com/api/v2/pixel?sdkid=ABC123&event=CompletePayment');
    expect(r).toMatchObject({ providerKey: 'TIKTOK', account: 'ABC123', event: 'CompletePayment' });
  });

  it('matches the track endpoint and other API versions', () => {
    expect(matchProvider('https://analytics.tiktok.com/api/v1/track?sdkid=X').key).toBe('TIKTOK');
  });
});

describe('Microsoft UET provider', () => {
  it('decodes the UET tag ID and event type', () => {
    const r = decodeRequest('https://bat.bing.com/action/0?ti=12345678&evt=pageLoad&ec=video');
    expect(r).toMatchObject({ providerKey: 'MSUET', account: '12345678', event: 'pageLoad' });
    expect(findParam(r.params, 'ec')).toMatchObject({ name: 'Event Category' });
  });
});

describe('Google Tag Manager provider', () => {
  it('decodes a container load', () => {
    const r = decodeRequest('https://www.googletagmanager.com/gtm.js?id=GTM-ABCDE&l=dataLayer');
    expect(r).toMatchObject({ providerKey: 'GTM', account: 'GTM-ABCDE' });
    expect(r.label).toBe('GTM container load');
  });

  it('distinguishes the gtag.js loader from the container', () => {
    const r = decodeRequest('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
    expect(r.label).toBe('Google tag (gtag.js) load');
  });

  it('does not swallow GA4 collect requests', () => {
    expect(matchProvider('https://www.google-analytics.com/g/collect?v=2&tid=G-1').key).toBe('GA4');
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
    const expected = {
      'https://px.ads.linkedin.com/collect?pid=1': 'LINKEDIN',
      'https://www.facebook.com/tr/?id=1': 'METAPIXEL',
      'https://www.google-analytics.com/g/collect?v=2': 'GA4',
      'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/?label=a': 'GOOGLEADS',
      'https://www.googletagmanager.com/gtm.js?id=GTM-1': 'GTM',
      'https://bat.bing.com/action/0?ti=1': 'MSUET',
      'https://analytics.tiktok.com/api/v2/pixel?sdkid=1': 'TIKTOK',
      'https://ct.pinterest.com/v3/?tid=1': 'PINTEREST',
      'https://tr.snapchat.com/p?pid=1': 'SNAPCHAT',
      'https://analytics.twitter.com/i/adsct?txn_id=1': 'TWITTER'
    };
    for (const [url, key] of Object.entries(expected)) {
      expect(matchProvider(url)?.key, url).toBe(key);
    }
  });

  it('has a unique key per provider', () => {
    const keys = PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
