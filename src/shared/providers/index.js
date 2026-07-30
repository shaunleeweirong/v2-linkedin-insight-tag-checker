// Provider registry.
//
// LinkedIn is the only "diagnosed" provider — the trichotomy, warnings, badge and
// consent logic in state.js are LinkedIn-specific and stay that way. The others are
// "observed": they populate the timeline so a marketer can see what else fires
// alongside the Insight Tag, and nothing more.

import * as linkedin from './linkedin.js';
import * as ga4 from './ga4.js';
import * as googleAds from './google-ads.js';
import * as metaPixel from './meta-pixel.js';

export const PROVIDERS = [linkedin, ga4, googleAds, metaPixel];

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
