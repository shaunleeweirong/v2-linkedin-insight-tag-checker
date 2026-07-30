// Meta (Facebook) Pixel — decode-only ("observed").

import { decodeParams } from './decode.js';

export const key = 'METAPIXEL';
export const name = 'Meta Pixel';
export const tier = 'observed';

export const filters = ['*://*.facebook.com/tr*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?facebook\.com\/tr\/?\?/i;

const KEYS = {
  id: { name: 'Pixel ID', group: 'General' },
  ev: { name: 'Event', group: 'Event' },
  dl: { name: 'Page URL', group: 'Page' },
  rl: { name: 'Referring URL', group: 'Page' },
  ts: { name: 'Timestamp', group: 'General' },
  v: { name: 'Pixel Version', group: 'General' },
  ec: { name: 'Event Count', group: 'Event' },
  it: { name: 'Initialized Timestamp', group: 'General' },
  if: { name: 'In an iFrame', group: 'General' },
  r: { name: 'Code Branch', group: 'General' },
  sw: { name: 'Screen Width', group: 'Device' },
  sh: { name: 'Screen Height', group: 'Device' }
};

// Custom data and user data arrive bracketed: cd[content_name], ud[uid].
const DYNAMIC = [
  {
    test: /^cd\[/,
    name: (k) => `Custom Data: ${k.slice(3).replace(/\]$/, '')}`,
    group: 'Custom Data'
  },
  {
    test: /^ud\[/,
    name: (k) => `User Data: ${k.slice(3).replace(/\]$/, '')}`,
    group: 'User Data'
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

  const event = url.searchParams.get('ev');

  return {
    label: event ? `Meta ${event}` : 'Meta Pixel event',
    account: url.searchParams.get('id') || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS, DYNAMIC)
  };
}
