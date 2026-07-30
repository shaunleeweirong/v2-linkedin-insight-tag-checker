// Google Tag Manager container load — decode-only ("observed").
//
// This one earns its place on diagnostic grounds rather than decoding depth: most
// Insight Tags are deployed THROUGH GTM. If the Insight Tag isn't firing and the GTM
// container never loaded either, the container is the root cause, not the tag. Seeing
// both facts on one timeline turns "the tag is broken" into "GTM didn't load".

import { decodeParams } from './decode.js';

export const key = 'GTM';
export const name = 'Google Tag Manager';
export const tier = 'observed';

export const filters = [
  '*://*.googletagmanager.com/gtm.js*',
  '*://*.googletagmanager.com/gtag/js*'
];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?googletagmanager\.com\/(?:gtm\.js|gtag\/js)/i;

const KEYS = {
  id: { name: 'Container / Tag ID', group: 'General' },
  l: { name: 'Data Layer Variable', group: 'General' }
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

  const isContainer = /\/gtm\.js/i.test(url.pathname);
  return {
    label: isContainer ? 'GTM container load' : 'Google tag (gtag.js) load',
    account: url.searchParams.get('id') || null,
    event: 'library',
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
