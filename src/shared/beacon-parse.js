// Pure helpers for recognising LinkedIn Insight Tag network requests.
//
// These run in the service worker (against every observed request URL) and are
// kept dependency-free so they can be unit-tested without a browser.

export const LI_LIBRARY_HOST = 'snap.licdn.com';
export const LI_COLLECT_HOST = 'px.ads.linkedin.com';

// URL match patterns handed to chrome.webRequest listeners. Scoped to exactly
// what parseInsightRequest() understands: the /collect beacon (base page-load and
// conversions) and the Insight Tag library file.
export const REQUEST_FILTERS = [
  '*://px.ads.linkedin.com/collect*',
  '*://snap.licdn.com/li.lms-analytics/*'
];

/**
 * Recognise and parse a LinkedIn Insight Tag request URL.
 *
 * @param {string} rawUrl
 * @returns {null | {
 *   kind: 'library' | 'collect',
 *   pid: string | null,
 *   conversionId: string | null,
 *   fmt: string | null,
 *   isConversion: boolean,
 *   url: string
 * }}
 */
export function parseInsightRequest(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname;

  // The Insight Tag library (insight.min.js and friends).
  if (host === LI_LIBRARY_HOST && url.pathname.includes('/li.lms-analytics/')) {
    return {
      kind: 'library',
      pid: null,
      conversionId: null,
      fmt: null,
      isConversion: false,
      url: rawUrl
    };
  }

  // The tracking beacon. NOTE: both the base page-load beacon and event-specific
  // conversion beacons hit /collect. The discriminator is the PRESENCE of the
  // `conversionId` param, never `fmt`.
  if (host === LI_COLLECT_HOST && url.pathname.startsWith('/collect')) {
    const pid = url.searchParams.get('pid');
    const conversionId = url.searchParams.get('conversionId');
    const fmt = url.searchParams.get('fmt');
    return {
      kind: 'collect',
      pid: pid || null,
      conversionId: conversionId || null,
      fmt: fmt || null,
      isConversion: conversionId != null && conversionId !== '',
      url: rawUrl
    };
  }

  return null;
}
