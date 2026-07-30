// Marketo (Munchkin) — decode-only ("observed").
//
// NOTE ON KEY COVERAGE: Marketo is not in the reference provider set I sourced the
// other vendors from, so this key map is built from Marketo's public Munchkin
// documentation and covers only the parameters whose meaning is well established.
// Everything else (`_mchCn`, `_mchHa`, …) deliberately falls through to raw
// passthrough rather than being given a guessed label.

import { decodeParams } from './decode.js';

export const key = 'MARKETO';
export const name = 'Marketo (Munchkin)';
export const tier = 'observed';

// Each subscription gets its own subdomain: <munchkin-id>.mktoresp.com
export const filters = ['*://*.mktoresp.com/webevents/*'];

const PATTERN = /^https?:\/\/(?:[^/]+\.)?mktoresp\.com\/webevents\//i;
const MUNCHKIN_FROM_HOST = /^([^.]+)\.mktoresp\.com$/i;

const KEYS = {
  _mchId: { name: 'Munchkin ID', group: 'General' },
  _mchTk: { name: 'Tracking Token', group: 'General' },
  _mchHo: { name: 'Host', group: 'Page' },
  _mchPo: { name: 'Port', group: 'Page' },
  _mchRu: { name: 'Page Path', group: 'Page' },
  _mchQp: { name: 'Query Parameters', group: 'Page' },
  _mchRe: { name: 'Referrer', group: 'Page' },
  _mchNc: { name: 'Cache Buster', group: 'General' },
  _mchVr: { name: 'Munchkin Version', group: 'General' }
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

  // The activity type is the last path segment: visitWebPage, clickLink, …
  const activity = url.pathname.split('/').filter(Boolean).pop() || null;

  // Prefer the explicit param (shown verbatim); fall back to the subdomain.
  //
  // Hostnames are case-insensitive and `new URL()` lowercases them, so the ID
  // recovered from the host loses its casing. Munchkin IDs are uppercase by
  // convention (123-ABC-456), so restore that form — otherwise the value shown
  // wouldn't match what the user sees in Marketo and pastes into a search.
  const hostMatch = MUNCHKIN_FROM_HOST.exec(url.hostname);
  const account =
    url.searchParams.get('_mchId') || (hostMatch ? hostMatch[1].toUpperCase() : null);

  return {
    label: activity ? `Marketo ${activity}` : 'Marketo web event',
    account,
    event: activity,
    isConversion: false,
    conversionId: null,
    params: decodeParams(url.searchParams, KEYS)
  };
}
