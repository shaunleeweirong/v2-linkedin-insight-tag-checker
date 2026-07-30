// Provider registry.
//
// LinkedIn is the only "diagnosed" provider — the trichotomy, warnings, badge and
// consent logic in state.js are LinkedIn-specific and stay that way. The others are
// "observed": they populate the timeline so a marketer can see what else fires
// alongside the Insight Tag, and nothing more.

import * as linkedin from './linkedin.js';
import * as ga4 from './ga4.js';
import * as googleAds from './google-ads.js';
import * as googleTagManager from './google-tag-manager.js';
import * as metaPixel from './meta-pixel.js';
import * as microsoftUet from './microsoft-uet.js';
import * as tiktok from './tiktok.js';
import * as pinterest from './pinterest.js';
import * as snapchat from './snapchat.js';
import * as xTwitter from './x-twitter.js';

// LinkedIn must stay first: matchProvider() returns the first hit, and LinkedIn is
// the only provider whose result feeds the diagnostic.
export const PROVIDERS = [
  linkedin,
  ga4,
  googleAds,
  googleTagManager,
  metaPixel,
  microsoftUet,
  tiktok,
  pinterest,
  snapchat,
  xTwitter
];

/** Every chrome.webRequest match pattern the service worker needs to listen on. */
export const ALL_REQUEST_FILTERS = PROVIDERS.flatMap((p) => p.filters);

/**
 * Find the provider that owns a URL.
 * @returns {object|null} the provider module, or null when nothing matches.
 */
export function matchProvider(rawUrl) {
  return PROVIDERS.find((p) => p.match(rawUrl)) || null;
}

/**
 * Decode a URL into a timeline-ready record.
 * @returns {null | {providerKey, providerName, tier, label, account, event,
 *                   isConversion, conversionId, params}}
 */
export function decodeRequest(rawUrl) {
  const provider = matchProvider(rawUrl);
  if (!provider) return null;

  const parsed = provider.parse(rawUrl);
  if (!parsed) return null;

  return {
    providerKey: provider.key,
    providerName: provider.name,
    tier: provider.tier,
    url: rawUrl,
    ...parsed
  };
}
