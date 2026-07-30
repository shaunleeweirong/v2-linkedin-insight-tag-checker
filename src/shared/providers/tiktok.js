// TikTok Pixel — decode-only ("observed").
//
// LIMITATION, by design: TikTok sends most of its event data as a JSON POST body
// (context.pixel.code, context.ad.*, properties.*), not as query parameters. This
// extension observes requests via chrome.webRequest.onResponseStarted, which exposes
// the URL but NOT the request body, so those fields cannot be decoded here.
//
// What still works: the request itself is detected, so you can see that the TikTok
// pixel fired, when, and whether it completed or errored — plus whatever the
// implementation does put in the query string. Decoding the body would require an
// additional onBeforeRequest listener with the "requestBody" extra info, which is a
// materially more invasive permission than reading URLs and would change the
// privacy-policy claim. Deliberately not done without an explicit decision.

import { decodeParams } from './decode.js';

export const key = 'TIKTOK';
export const name = 'TikTok Pixel';
export const tier = 'observed';

export const filters = ['*://analytics.tiktok.com/api/*'];

const PATTERN = /^https?:\/\/analytics\.tiktok\.com\/api\/v\d+\/(?:track|pixel)/i;

const KEYS = {
  event: { name: 'Event', group: 'Event' },
  sdkid: { name: 'Pixel Code (SDK ID)', group: 'General' },
  timestamp: { name: 'Timestamp', group: 'General' },
  analytics_uniq_id: { name: 'Analytics Unique ID', group: 'General' }
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

  const event = url.searchParams.get('event');
  return {
    label: event ? `TikTok ${event}` : 'TikTok Pixel request',
    account: url.searchParams.get('sdkid') || null,
    event: event || null,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
