// Pure helpers for recognising LinkedIn Insight Tag network requests.
//
// These run in the service worker (against every observed request URL) and are
// kept dependency-free so they can be unit-tested without a browser.

export const LI_LIBRARY_HOST = 'snap.licdn.com';
export const LI_COLLECT_HOST = 'px.ads.linkedin.com';

// URL match patterns handed to chrome.webRequest listeners. Scoped to exactly
// what parseInsightRequest() understands: the /collect beacon (base page-load and
// conversions) and the Insight Tag library file.
//
// NOTE: narrowing the listener filter here is fine, but the manifest's
// host_permissions MUST stay "<all_urls>". Chrome only dispatches webRequest
// events when the extension has host access to BOTH the request URL and the
// page that initiated it — with LinkedIn-only host permissions, beacon events
// are silently dropped on every site the user hasn't granted via an icon click.
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

/**
 * Classify a chrome.webRequest error string.
 *
 * This distinction matters: a conversion that fires on click and then navigates
 * away has its beacon CANCELLED by the navigation (`net::ERR_ABORTED`). Treating
 * that like an ad-blocker hit made the extension accuse the user's own browser of
 * blocking a tag that actually worked. Only a genuine block (or a DNS-level one,
 * e.g. Pi-hole) should ever drive the 'blocked' verdict.
 *
 * @param {string|null|undefined} error
 * @returns {'blocked' | 'aborted' | 'network' | 'error' | null}
 */
export function classifyError(error) {
  if (!error) return null;
  const e = String(error);

  if (/BLOCKED_BY_CLIENT|BLOCKED_BY_ADMINISTRATOR|BLOCKED_BY_RESPONSE/i.test(e)) return 'blocked';
  if (/ABORTED/i.test(e)) return 'aborted';
  if (/NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|CONNECTION_(?:REFUSED|RESET|CLOSED|FAILED)|TIMED_OUT|INTERNET_DISCONNECTED/i.test(e)) {
    return 'network';
  }
  return 'error';
}

/** Does this error kind mean the tag was genuinely prevented from reaching LinkedIn? */
export function isBlockingError(errorKind) {
  return errorKind === 'blocked' || errorKind === 'network';
}
