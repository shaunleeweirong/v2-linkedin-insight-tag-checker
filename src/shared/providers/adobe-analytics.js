// Adobe Analytics — decode-only ("observed").
//
// The most complex vendor here: the report suite lives in the URL PATH, and most of
// the payload is dynamic (props c1-c75, eVars v1-v75, hierarchies h1-h5) rather than
// fixed keys, so the dynamic rules below do the heavy lifting.
//
// SCOPE: matched on Adobe-owned collection hosts (*.2o7.net, *.omtrdc.net) only. Many
// enterprises route Adobe through a first-party CNAME (metrics.example.com/b/ss/…),
// which this deliberately does NOT catch — matching `/b/ss/` on arbitrary hosts would
// mean inspecting request URLs across the whole web. Same trade-off as GA4, kept
// consistent so the privacy claim stays "known vendor endpoints only".

import { decodeParams } from './decode.js';

export const key = 'ADOBEANALYTICS';
export const name = 'Adobe Analytics';
export const tier = 'observed';

export const filters = ['*://*.2o7.net/b/ss/*', '*://*.omtrdc.net/b/ss/*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?(?:2o7\.net|omtrdc\.net)\/b\/ss\//i;
const RSID_FROM_PATH = /\/b\/ss\/([^/]+)\//i;

const KEYS = {
  pageName: { name: 'Page Name', group: 'Page' },
  g: { name: 'Current URL', group: 'Page' },
  r: { name: 'Referrer URL', group: 'Page' },
  ch: { name: 'Channel', group: 'Page' },
  events: { name: 'Events', group: 'Event' },
  products: { name: 'Products', group: 'Ecommerce' },
  cc: { name: 'Currency Code', group: 'Ecommerce' },
  purchaseID: { name: 'Purchase ID', group: 'Ecommerce' },
  mid: { name: 'Marketing Cloud Visitor ID', group: 'User' },
  vid: { name: 'Visitor ID', group: 'User' },
  aid: { name: 'Legacy Visitor ID', group: 'User' },
  t: { name: 'Browser Time', group: 'General' },
  ts: { name: 'Timestamp', group: 'General' },
  pe: { name: 'Link Type', group: 'Event' },
  pev1: { name: 'Link URL', group: 'Event' },
  pev2: { name: 'Link Name', group: 'Event' },
  s: { name: 'Screen Resolution', group: 'Device' },
  v: { name: 'JavaScript Enabled', group: 'Device' },
  AQB: { name: 'Payload Start', group: 'General' },
  AQE: { name: 'Payload End', group: 'General' }
};

// Adobe accepts both the short and long forms of each dynamic variable.
const DYNAMIC = [
  {
    test: /^(?:c|prop)\d+$/i,
    name: (k) => `prop${k.replace(/^(?:c|prop)/i, '')}`,
    group: 'Props'
  },
  {
    test: /^(?:v|eVar)\d+$/i,
    name: (k) => `eVar${k.replace(/^(?:v|eVar)/i, '')}`,
    group: 'eVars'
  },
  {
    test: /^(?:h|hier)\d+$/i,
    name: (k) => `Hierarchy ${k.replace(/^(?:h|hier)/i, '')}`,
    group: 'Hierarchy'
  }
];

export function match(rawUrl) {
  return PATTERN.test(rawUrl);
}

export function parse(rawUrl) {
  if (!match(rawUrl)) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const rsidMatch = RSID_FROM_PATH.exec(url.pathname);
  const rsid = rsidMatch ? rsidMatch[1] : null;

  // `pe` present means this is a link-tracking hit rather than a page view.
  const isLink = url.searchParams.has('pe');
  const pageName = url.searchParams.get('pageName');
  const linkName = url.searchParams.get('pev2');

  return {
    label: isLink
      ? `Adobe link: ${linkName || url.searchParams.get('pe')}`
      : `Adobe page view${pageName ? `: ${pageName}` : ''}`,
    account: rsid,
    event: isLink ? 'link' : 'pageview',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS, DYNAMIC)
  };
}
