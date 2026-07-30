// X (Twitter) Pixel — decode-only ("observed").

import { decodeParams } from './decode.js';

export const key = 'TWITTER';
export const name = 'X (Twitter) Pixel';
export const tier = 'observed';

// The tag posts to analytics.twitter.com; some builds route through t.co.
export const filters = ['*://analytics.twitter.com/i/adsct*', '*://t.co/i/adsct*'];

const PATTERN = /^https?:\/\/(?:analytics\.twitter\.com|t\.co)\/i\/adsct/i;

const KEYS = {
  txn_id: { name: 'Pixel / Tag ID', group: 'General' },
  p_id: { name: 'Pixel Type', group: 'General' },
  p_user_id: { name: 'User ID', group: 'User' },
  events: { name: 'Event Data', group: 'Event' },
  tw_sale_amount: { name: 'Revenue', group: 'Ecommerce' },
  tw_order_quantity: { name: 'Quantity', group: 'Ecommerce' },
  tw_document_href: { name: 'Page URL', group: 'Page' },
  tw_iframe_status: { name: 'In an iFrame', group: 'General' },
  tpx_cb: { name: 'Callback', group: 'General' }
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

  // `events` is a JSON array like [["pageview"]] — pull the event name out for the
  // row label, but leave the raw value visible in the decoded params.
  let event = null;
  try {
    const raw = url.searchParams.get('events');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) event = String(parsed[0][0]);
    }
  } catch {
    /* leave event null — the raw value is still shown */
  }

  return {
    label: event ? `X (Twitter) ${event}` : 'X (Twitter) event',
    account: url.searchParams.get('txn_id') || null,
    event,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
