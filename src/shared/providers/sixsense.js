// 6sense (company identification) — decode-only ("observed").
//
// The upstream reference provider declares no parameter map for this endpoint, so
// every param falls through to raw passthrough with its literal key. That is the
// honest outcome: the request is detected and its data shown as-is, rather than
// given invented labels.

import { decodeParams } from './decode.js';

export const key = 'SIXSENSE';
export const name = '6sense';
export const tier = 'observed';

export const filters = ['*://*.6sense.com/v3/company/details*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?6sense\.com\/v3\/company\/details/i;

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
    label: '6sense company lookup',
    account: null,
    event: 'identify',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams)
  };
}
