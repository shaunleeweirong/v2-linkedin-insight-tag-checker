// Salesforce Account Engagement (Pardot) — decode-only ("observed").
//
// NOTE ON KEY COVERAGE: like Marketo, Pardot is not in the reference provider set,
// so this map covers only well-documented parameters; anything else passes through
// with its raw key rather than a guessed label.

import { decodeParams } from './decode.js';

export const key = 'PARDOT';
export const name = 'Salesforce Account Engagement (Pardot)';
export const tier = 'observed';

export const filters = ['*://pi.pardot.com/analytics*', '*://*.pardot.com/analytics*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?pardot\.com\/analytics/i;

const KEYS = {
  account_id: { name: 'Account ID', group: 'General' },
  campaign_id: { name: 'Campaign ID', group: 'General' },
  visitor_id: { name: 'Visitor ID', group: 'User' },
  visitor_id_sign: { name: 'Visitor ID Signature', group: 'User' },
  url: { name: 'Page URL', group: 'Page' },
  title: { name: 'Page Title', group: 'Page' },
  referrer: { name: 'Referrer', group: 'Page' }
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
    label: 'Pardot page view',
    account: url.searchParams.get('account_id') || null,
    event: 'pageview',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
