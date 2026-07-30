// Google Analytics 4 — decode-only ("observed").
//
// Scoped deliberately to Google-owned hosts. A broad `*/g/collect*` match would also
// catch first-party/server-side GA4, but it would mean inspecting request URLs on
// arbitrary domains, which we do not want to claim in the privacy policy.

import { decodeParams } from './decode.js';

export const key = 'GA4';
export const name = 'Google Analytics 4';
export const tier = 'observed';

export const filters = [
  '*://*.google-analytics.com/g/collect*',
  '*://analytics.google.com/g/collect*'
];

const PATTERN =
  /^https?:\/\/(?:(?:[^/]+\.)?google-analytics\.com|analytics\.google\.com)\/g\/collect/i;

const KEYS = {
  v: { name: 'Protocol Version', group: 'General' },
  tid: { name: 'Measurement ID', group: 'General' },
  cid: { name: 'Client ID', group: 'General' },
  uid: { name: 'User ID', group: 'General' },
  en: { name: 'Event Name', group: 'Event' },
  dl: { name: 'Page URL', group: 'Page' },
  dh: { name: 'Hostname', group: 'Page' },
  dp: { name: 'Page Path', group: 'Page' },
  dt: { name: 'Page Title', group: 'Page' },
  dr: { name: 'Referrer', group: 'Page' },
  sr: { name: 'Screen Resolution', group: 'Device' },
  ul: { name: 'User Language', group: 'Device' },
  gcs: { name: 'Consent Mode', group: 'Consent' }
};

// GA4 sends event params as `ep.<name>` / `epn.<name>` (n = numeric) and user
// properties as `up.<name>` / `upn.<name>`.
const DYNAMIC = [
  {
    test: /^epn?\./,
    name: (k) => `Event Param: ${k.replace(/^epn?\./, '')}`,
    group: 'Event'
  },
  {
    test: /^upn?\./,
    name: (k) => `User Property: ${k.replace(/^upn?\./, '')}`,
    group: 'User'
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

  const event = url.searchParams.get('en');
  const tid = url.searchParams.get('tid');

  return {
    label: event ? `GA4 ${event}` : 'GA4 event',
    account: tid || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS, DYNAMIC)
  };
}
