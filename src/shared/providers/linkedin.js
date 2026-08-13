// LinkedIn Insight Tag — the ONLY first-class ("diagnosed") provider.
//
// Everything the diagnostic engine needs (kind / isConversion / pid / conversionId)
// still comes from parseInsightRequest() in ../beacon-parse.js; this module layers
// full parameter decoding on top for the timeline. Keeping the two separate means
// the trichotomy in state.js never depends on decoding.

import { decodeParams } from './decode.js';
import { parseInsightRequest, REQUEST_FILTERS } from '../beacon-parse.js';

export const key = 'LINKEDIN';
export const name = 'LinkedIn Insight Tag';
export const tier = 'diagnosed';

// Reuses the canonical list in beacon-parse.js so the listener filters and the
// parser can never drift apart.
export const filters = REQUEST_FILTERS;

// Only params LinkedIn is known to send. Anything else falls through to raw
// passthrough rather than being given an invented label.
const KEYS = {
  pid: { name: 'Partner ID', group: 'General' },
  conversionId: { name: 'Conversion ID', group: 'Conversion' },
  fmt: { name: 'Pixel Format', group: 'General' },
  time: { name: 'Timestamp', group: 'General' },
  url: { name: 'Page URL', group: 'Page' }
};

export function match(rawUrl) {
  return parseInsightRequest(rawUrl) !== null;
}

export function parse(rawUrl) {
  const req = parseInsightRequest(rawUrl);
  if (!req) return null;

  // Labels favour the words a LinkedIn advertiser already uses.
  //
  // "Library" is a programming term with no meaning in LinkedIn's docs, so the
  // script download is labelled by what happened instead. "Base Insight Tag" is
  // kept verbatim: it IS LinkedIn's own terminology (base tag vs event-specific
  // conversions), and calling it a "page view" would understate it — the base
  // beacon also sets the cookie, builds retargeting audiences and underpins
  // conversion attribution.
  if (req.kind === 'library') {
    return {
      label: 'Tag script loaded',
      account: null,
      event: 'library',
      isConversion: false,
      conversionId: null,
      params: []
    };
  }

  let searchParams;
  try {
    searchParams = new URL(rawUrl).searchParams;
  } catch {
    searchParams = new URLSearchParams();
  }

  // The attribution ping is a separate call from the page-visit signal — labelling
  // it "Base Insight Tag" would show a marketer two page views for one page load.
  if (req.kind === 'attribution') {
    return {
      label: 'Attribution ping',
      account: req.pid,
      event: 'attribution',
      isConversion: false,
      conversionId: null,
      params: decodeParams(searchParams, KEYS)
    };
  }

  return {
    label: req.isConversion ? `Conversion #${req.conversionId}` : 'Base Insight Tag',
    account: req.pid,
    event: req.isConversion ? 'conversion' : 'page_view',
    isConversion: req.isConversion,
    conversionId: req.conversionId,
    params: decodeParams(searchParams, KEYS)
  };
}
