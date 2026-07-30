// Reddit Pixel — decode-only ("observed").

import { decodeParams } from './decode.js';

export const key = 'REDDIT';
export const name = 'Reddit Pixel';
export const tier = 'observed';

// Served from alb.reddit.com in most implementations; the wildcard covers the rest.
export const filters = ['*://*.reddit.com/rp.gif*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?reddit\.com\/rp\.gif/i;

const KEYS = {
  id: { name: 'Advertiser ID', group: 'General' },
  event: { name: 'Event Name', group: 'Event' },
  'm.customEventName': { name: 'Custom Event Name', group: 'Event' },
  'm.conversionId': { name: 'Conversion ID', group: 'Event' },
  'm.itemCount': { name: 'Item Count', group: 'Ecommerce' },
  'm.value': { name: 'Value', group: 'Ecommerce' },
  'm.valueDecimal': { name: 'Value (Decimal)', group: 'Ecommerce' },
  'm.currency': { name: 'Currency', group: 'Ecommerce' },
  'm.products': { name: 'Products', group: 'Ecommerce' }
};

// Any other m.* metadata key still surfaces readably.
const DYNAMIC = [
  {
    test: /^m\./,
    name: (k) => `Metadata: ${k.slice(2)}`,
    group: 'Event'
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

  const event = url.searchParams.get('event') || url.searchParams.get('m.customEventName');
  return {
    label: event ? `Reddit ${event}` : 'Reddit Pixel event',
    account: url.searchParams.get('id') || null,
    event: event || null,
    isConversion: false,
    conversionId: url.searchParams.get('m.conversionId') || null,
    params: decodeParams(url.searchParams, KEYS, DYNAMIC)
  };
}
