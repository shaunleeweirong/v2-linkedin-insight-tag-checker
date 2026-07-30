// Microsoft Advertising UET (Bing Ads Universal Event Tracking) — decode-only.
//
// Worth having for a LinkedIn-first tool: Microsoft owns LinkedIn, and B2B
// advertisers running LinkedIn Ads very often run Microsoft Ads off the same brief,
// so the two tags usually live on the same page.

import { decodeParams } from './decode.js';

export const key = 'MSUET';
export const name = 'Microsoft Advertising UET';
export const tier = 'observed';

export const filters = ['*://bat.bing.com/action*'];

const PATTERN = /^https?:\/\/bat\.bing\.com\/action/i;

const KEYS = {
  ti: { name: 'UET Tag ID', group: 'General' },
  evt: { name: 'Event Type', group: 'Event' },
  ec: { name: 'Event Category', group: 'Event' },
  ea: { name: 'Event Action', group: 'Event' },
  el: { name: 'Event Label', group: 'Event' },
  ev: { name: 'Event Value', group: 'Event' },
  gv: { name: 'Goal Revenue', group: 'Ecommerce' },
  prodid: { name: 'Product ID', group: 'Ecommerce' },
  pagetype: { name: 'Page Type', group: 'Page' },
  page_path: { name: 'Page Path', group: 'Page' },
  p: { name: 'Page URL', group: 'Page' },
  tl: { name: 'Page Title', group: 'Page' },
  r: { name: 'Referrer', group: 'Page' },
  spa: { name: 'Single Page App', group: 'General' },
  kw: { name: 'Keywords Meta Tag', group: 'Page' }
};

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

  const event = url.searchParams.get('evt');
  return {
    label: event ? `Microsoft UET ${event}` : 'Microsoft UET event',
    account: url.searchParams.get('ti') || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
