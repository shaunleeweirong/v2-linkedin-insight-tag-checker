// Google Ads conversion tracking — decode-only ("observed").
//
// Unlike the other providers, the account/conversion ID lives in the URL PATH
// (/pagead/conversion/123456/ or /pagead/viewthroughconversion/123456/), not the
// query string.

import { decodeParams } from './decode.js';

export const key = 'GOOGLEADS';
export const name = 'Google Ads';
export const tier = 'observed';

export const filters = [
  '*://googleads.g.doubleclick.net/pagead/*conversion*',
  '*://www.googleadservices.com/pagead/conversion*'
];

const PATTERN = /\/pagead\/(?:viewthrough)?conversion(?:_async)?[/?]/i;
const ACCOUNT_FROM_PATH = /\/pagead\/(?:viewthrough)?conversion(?:_async)?\/(\d+)/i;

const KEYS = {
  label: { name: 'Conversion Label', group: 'Conversion' },
  url: { name: 'Page URL', group: 'Page' },
  tiba: { name: 'Page Title', group: 'Page' },
  data: { name: 'Event Data', group: 'Event' },
  gcs: { name: 'Consent Mode', group: 'Consent' },
  value: { name: 'Conversion Value', group: 'Conversion' },
  currency_code: { name: 'Currency', group: 'Conversion' }
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

  const idMatch = ACCOUNT_FROM_PATH.exec(url.pathname);
  const conversionId = idMatch ? idMatch[1] : null;
  const account = conversionId ? `AW-${conversionId}` : null;
  const label = url.searchParams.get('label');

  return {
    label: account ? `Google Ads ${account}${label ? ` / ${label}` : ''}` : 'Google Ads conversion',
    account,
    event: 'conversion',
    isConversion: true,
    conversionId,
    params: decodeParams(url.searchParams, KEYS)
  };
}
