// Snapchat Pixel — decode-only ("observed").

import { decodeParams } from './decode.js';

export const key = 'SNAPCHAT';
export const name = 'Snapchat Pixel';
export const tier = 'observed';

// Snapchat load-balances across tr., tr6. and friends, so match the subdomain
// wildcard but keep it pinned to the /p pixel path.
export const filters = ['*://*.snapchat.com/p*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?snapchat\.com\/p(?:[/?]|$)/i;

const KEYS = {
  pid: { name: 'Pixel ID', group: 'General' },
  ev: { name: 'Event', group: 'Event' },
  pl: { name: 'Page URL', group: 'Page' },
  rf: { name: 'Referrer', group: 'Page' },
  ts: { name: 'Timestamp', group: 'General' },
  v: { name: 'Pixel Version', group: 'General' },
  u_hem: { name: 'User Email (hashed)', group: 'User' },
  u_hpn: { name: 'User Phone (hashed)', group: 'User' },
  e_desc: { name: 'Description', group: 'Event' },
  e_sm: { name: 'Sign Up Method', group: 'Event' },
  e_su: { name: 'Success', group: 'Event' },
  e_ss: { name: 'Search Keyword', group: 'Event' },
  e_ni: { name: 'Number of Items', group: 'Ecommerce' },
  e_iids: { name: 'Item IDs', group: 'Ecommerce' },
  e_ic: { name: 'Item Category', group: 'Ecommerce' },
  e_cur: { name: 'Currency', group: 'Ecommerce' },
  e_pr: { name: 'Price', group: 'Ecommerce' },
  e_tid: { name: 'Transaction ID', group: 'Ecommerce' },
  e_pia: { name: 'Payment Info Available', group: 'Ecommerce' }
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

  const event = url.searchParams.get('ev');
  return {
    label: event ? `Snapchat ${event}` : 'Snapchat Pixel event',
    account: url.searchParams.get('pid') || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
