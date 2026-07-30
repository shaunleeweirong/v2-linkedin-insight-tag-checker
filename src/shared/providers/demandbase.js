// Demandbase (Engagement / company identification) — decode-only ("observed").
//
// ABM platforms sit directly alongside LinkedIn Ads in B2B stacks — they are often
// what the LinkedIn audience is built from — so seeing the identification call fire
// (or not) is genuinely useful context.

import { decodeParams } from './decode.js';

export const key = 'DEMANDBASE';
export const name = 'Demandbase';
export const tier = 'observed';

export const filters = ['*://api.company-target.com/api/v2/ip.json*'];

const PATTERN = /^https?:\/\/api\.company-target\.com\/api\/v2\/ip\.json/i;

const KEYS = {
  key: { name: 'Account Key', group: 'General' },
  page: { name: 'Page URL', group: 'Page' },
  page_title: { name: 'Page Title', group: 'Page' },
  referrer: { name: 'Page Referrer', group: 'Page' },
  src: { name: 'Called From', group: 'General' }
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

  return {
    label: 'Demandbase company lookup',
    account: url.searchParams.get('key') || null,
    event: 'identify',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
