// Decoding for the /wa/ signal endpoint.
//
// LinkedIn's current Insight Tag (scriptVersion 1000010+) no longer announces a
// page view with `GET px.ads.linkedin.com/collect?pid=…`. It POSTs to
// `px.ads.linkedin.com/wa/` instead, and the partner IDs live in the request
// BODY:
//
//   {"pids":[843739],"scriptVersion":308,"time":…,"domain":"endowus.com",
//    "url":"https://endowus.com/","signalType":"PAGE_VISIT", …}
//
// Wire format, verified against captured bytes: the body is literally base64
// ASCII text (it begins "H4sI") whose decoded bytes are gzip. So the pipeline is
//
//   bytes -> ASCII -> base64-decode -> gunzip -> JSON
//
// Kept dependency-free and side-effect-free so it unit-tests without a browser.
// DecompressionStream is available in an MV3 service worker and in Node 18+.

/** Turn whatever chrome.webRequest hands us (ArrayBuffer | view | string) into a string. */
function toText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  try {
    if (raw instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(raw));
    if (ArrayBuffer.isView(raw)) return new TextDecoder().decode(raw);
  } catch {
    return '';
  }
  return '';
}

function base64ToBytes(text) {
  // atob is present in service workers; Buffer is not, so don't reach for it.
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode a captured /wa/ request body into its JSON payload.
 *
 * Returns null — never throws — for anything that isn't a well-formed body, so a
 * format change on LinkedIn's side degrades to "no PID from this source" rather
 * than breaking the listener.
 *
 * @param {ArrayBuffer|ArrayBufferView|string|null} raw
 * @returns {Promise<object|null>}
 */
export async function decodeWaPayload(raw) {
  const text = toText(raw).trim();
  if (!text) return null;

  try {
    const gz = base64ToBytes(text);
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    const json = await new Response(stream).json();
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/**
 * Read the bits of a /wa/ payload the diagnostic cares about.
 *
 * NOTE: only PAGE_VISIT has been observed on the wire. Conversion signals are
 * deliberately NOT mapped here — inventing field names we have never seen would
 * put made-up conversion IDs in front of the user. Conversions continue to be
 * captured from `/collect?conversionId=…` and from the wrapped `lintrk()` call.
 *
 * @param {object|null} payload
 * @returns {null | { pids: string[], signalType: string|null, isConversion: boolean }}
 */
export function readWaSignal(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const pids = Array.isArray(payload.pids)
    ? payload.pids.map((p) => String(p)).filter(Boolean)
    : [];

  return {
    pids,
    signalType: payload.signalType || null,
    isConversion: false
  };
}

/**
 * Turn a decoded signal into the overrides the service worker lays over the
 * URL-derived request, which cannot know what the body said.
 *
 * LinkedIn's tag defines exactly two:
 *   EVENT_TYPE: { PAGE_VISIT: "PAGE_VISIT", CLICK: "CLICK" }
 *
 * A CLICK proves the tag is alive and carries the same partner IDs, but it is
 * NOT the page-visit beacon — letting one satisfy "the tag fired" would report a
 * page whose base tag never reported as healthy. Unknown types fall back to the
 * base beacon so a future signal type isn't silently dropped.
 *
 * @param {ReturnType<typeof readWaSignal>} signal
 * @returns {null | { kind: 'wa'|'wa-click', pid: string|null, label: string|null, event: string }}
 */
export function waSignalOverlay(signal) {
  if (!signal) return null;

  const isClick = signal.signalType === 'CLICK';
  return {
    kind: isClick ? 'wa-click' : 'wa',
    pid: signal.pids.length ? signal.pids.join(',') : null,
    label: isClick ? 'Click signal' : null, // null → keep the provider's own label
    event: isClick ? 'click' : 'page_view'
  };
}
