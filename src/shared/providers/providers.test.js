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

describe('HubSpot provider', () => {
  it('decodes the Hub ID and event name', () => {
    const r = decodeRequest(
      'https://track.hubspot.com/__ptq.gif?a=1234567&id=demo-request&pu=https%3A%2F%2Fexample.com'
    );
    expect(r).toMatchObject({ providerKey: 'HUBSPOT', account: '1234567', event: 'demo-request' });
    expect(findParam(r.params, 'a')).toMatchObject({ name: 'Hub ID (Account)' });
  });

  it('falls back to a page view when no event id is present', () => {
    const r = decodeRequest('https://track.hubspot.com/__ptq.gif?a=1234567');
    expect(r.label).toBe('HubSpot page view');
  });
});

describe('Reddit provider', () => {
  it('decodes advertiser ID, event and m.* metadata', () => {
    const r = decodeRequest(
      'https://alb.reddit.com/rp.gif?id=t2_abc&event=Lead&m.value=50&m.currency=USD'
    );
    expect(r).toMatchObject({ providerKey: 'REDDIT', account: 't2_abc', event: 'Lead' });
    expect(findParam(r.params, 'm.value')).toMatchObject({ name: 'Value' });
  });

  it('labels undeclared m.* keys readably', () => {
    const r = decodeRequest('https://alb.reddit.com/rp.gif?id=1&m.somethingNew=x');
    expect(findParam(r.params, 'm.somethingNew')).toMatchObject({ name: 'Metadata: somethingNew' });
  });
});

describe('Marketo provider', () => {
  it('reads the Munchkin ID from the subdomain when the param is absent', () => {
    const r = decodeRequest('https://123-ABC-456.mktoresp.com/webevents/visitWebPage?_mchRu=%2Fpricing');
    expect(r).toMatchObject({ providerKey: 'MARKETO', account: '123-ABC-456', event: 'visitWebPage' });
  });

  it('prefers the explicit _mchId param', () => {
    const r = decodeRequest('https://123-ABC-456.mktoresp.com/webevents/clickLink?_mchId=999-ZZZ-111');
    expect(r.account).toBe('999-ZZZ-111');
    expect(r.event).toBe('clickLink');
  });

  it('passes undocumented _mch params through raw rather than guessing', () => {
    const r = decodeRequest('https://a.mktoresp.com/webevents/visitWebPage?_mchCn=x');
    expect(findParam(r.params, '_mchCn')).toMatchObject({ name: '_mchCn', group: 'Other' });
  });
});

describe('Pardot provider', () => {
  it('decodes account and visitor IDs', () => {
    const r = decodeRequest(
      'https://pi.pardot.com/analytics?account_id=555&visitor_id=6780&title=Pricing'
    );
    expect(r).toMatchObject({ providerKey: 'PARDOT', account: '555' });
    expect(findParam(r.params, 'visitor_id')).toMatchObject({ name: 'Visitor ID' });
  });
});

describe('ABM providers', () => {
  it('detects a Demandbase company lookup', () => {
    const r = decodeRequest(
      'https://api.company-target.com/api/v2/ip.json?key=abc123&page_title=Pricing'
    );
    expect(r).toMatchObject({ providerKey: 'DEMANDBASE', account: 'abc123', event: 'identify' });
  });

  it('detects a 6sense lookup and shows its params raw', () => {
    const r = decodeRequest('https://epsilon.6sense.com/v3/company/details?token=xyz');
    expect(r).toMatchObject({ providerKey: 'SIXSENSE', event: 'identify' });
    expect(findParam(r.params, 'token')).toMatchObject({ name: 'token', group: 'Other' });
  });
});

describe('Adobe Analytics provider', () => {
  const AA = 'https://example.sc.omtrdc.net/b/ss/myreportsuite/1/JS-2.0/s123?pageName=Home&c1=alpha&v2=beta&h1=lvl';

  it('extracts the report suite from the URL path, not the query', () => {
    const r = decodeRequest(AA);
    expect(r).toMatchObject({ providerKey: 'ADOBEANALYTICS', account: 'myreportsuite' });
    expect(r.label).toBe('Adobe page view: Home');
  });

  it('expands props, eVars and hierarchies', () => {
    const { params } = decodeRequest(AA);
    expect(findParam(params, 'c1')).toMatchObject({ name: 'prop1', group: 'Props' });
    expect(findParam(params, 'v2')).toMatchObject({ name: 'eVar2', group: 'eVars' });
    expect(findParam(params, 'h1')).toMatchObject({ name: 'Hierarchy 1', group: 'Hierarchy' });
  });

  it('distinguishes a link hit from a page view', () => {
    const r = decodeRequest(
      'https://example.sc.omtrdc.net/b/ss/rs1/1/s1?pe=lnk_o&pev2=Download%20PDF'
    );
    expect(r.event).toBe('link');
    expect(r.label).toContain('Download PDF');
  });

  it('does not confuse the standalone v param with an eVar', () => {
    const r = decodeRequest('https://example.sc.omtrdc.net/b/ss/rs1/1/s1?v=Y');
    expect(findParam(r.params, 'v')).toMatchObject({ name: 'JavaScript Enabled' });
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
      'https://analytics.twitter.com/i/adsct?txn_id=1': 'TWITTER',
      'https://alb.reddit.com/rp.gif?id=1': 'REDDIT',
      'https://track.hubspot.com/__ptq.gif?a=1': 'HUBSPOT',
      'https://1-ab-2.mktoresp.com/webevents/visitWebPage?_mchId=1': 'MARKETO',
      'https://pi.pardot.com/analytics?account_id=1': 'PARDOT',
      'https://epsilon.6sense.com/v3/company/details?t=1': 'SIXSENSE',
      'https://api.company-target.com/api/v2/ip.json?key=1': 'DEMANDBASE',
      'https://example.sc.omtrdc.net/b/ss/rs1/1/s1?pageName=x': 'ADOBEANALYTICS'
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
