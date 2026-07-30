// Pinterest Tag — decode-only ("observed").

import { decodeParams } from './decode.js';

export const key = 'PINTEREST';
export const name = 'Pinterest Tag';
export const tier = 'observed';

export const filters = ['*://ct.pinterest.com/*'];

const PATTERN = /^https?:\/\/ct\.pinterest\.com\/(?:v3|user)/i;

const KEYS = {
  tid: { name: 'Tag ID', group: 'General' },
  event: { name: 'Event', group: 'Event' },
  cb: { name: 'Cache Buster', group: 'General' },
  noscript: { name: 'Image Tag', group: 'General' },
  'pd[em]': { name: 'Hashed Email Address', group: 'User' },
  'ed[value]': { name: 'Revenue', group: 'Ecommerce' },
  'ed[order_quantity]': { name: 'Quantity', group: 'Ecommerce' },
  'ed[currency]': { name: 'Currency', group: 'Ecommerce' },
  'ed[order_id]': { name: 'Order ID', group: 'Ecommerce' },
  'ed[promo_code]': { name: 'Promo Code', group: 'Ecommerce' },
  'ed[property]': { name: 'Property', group: 'Ecommerce' },
  'ed[search_query]': { name: 'Search Query', group: 'Event' },
  'ed[video_title]': { name: 'Video Title', group: 'Event' },
  'ed[lead_type]': { name: 'Lead Type', group: 'Event' }
};

// Anything else bracketed under ed[…] / pd[…] still surfaces with a readable label.
const DYNAMIC = [
  {
    test: /^ed\[/,
    name: (k) => `Event Data: ${k.slice(3).replace(/\]$/, '')}`,
    group: 'Event'
  },
  {
    test: /^pd\[/,
    name: (k) => `Page Data: ${k.slice(3).replace(/\]$/, '')}`,
    group: 'Page'
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

  const event = url.searchParams.get('event');
  return {
    label: event ? `Pinterest ${event}` : 'Pinterest Tag event',
    account: url.searchParams.get('tid') || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS, DYNAMIC)
  };
}
