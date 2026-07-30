// HubSpot tracking — decode-only ("observed").
//
// The highest-value non-ad provider for a LinkedIn-first tool: LinkedIn Lead Gen
// Form submissions routinely land in HubSpot, so "did the lead actually reach the
// CRM?" sits right next to "did the conversion fire?" on the same timeline.

import { decodeParams } from './decode.js';

export const key = 'HUBSPOT';
export const name = 'HubSpot';
export const tier = 'observed';

export const filters = ['*://track.hubspot.com/__ptq.gif*'];

const PATTERN = /^https?:\/\/track\.hubspot\.com\/__ptq\.gif/i;

const KEYS = {
  a: { name: 'Hub ID (Account)', group: 'General' },
  ct: { name: 'Content Type', group: 'General' },
  pu: { name: 'Page URL', group: 'Page' },
  po: { name: 'Page Path', group: 'Page' },
  t: { name: 'Page Title', group: 'Page' },
  id: { name: 'Event Name', group: 'Event' },
  value: { name: 'Event Value', group: 'Event' }
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

  const event = url.searchParams.get('id');
  return {
    label: event ? `HubSpot ${event}` : 'HubSpot page view',
    account: url.searchParams.get('a') || null,
    event: event || 'pageview',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
