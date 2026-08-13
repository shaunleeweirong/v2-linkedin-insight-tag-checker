import { describe, it, expect } from 'vitest';
import { decodeWaPayload, readWaSignal, waSignalOverlay } from './wa-payload.js';

// A REAL body captured from px.ads.linkedin.com/wa/ on endowus.com (2026-08-12).
// The request body is literally base64 ASCII text whose decoded bytes are gzip —
// verified against the wire bytes, which begin 0x48 0x34 0x73 0x49 ("H4sI").
const REAL_BODY =
  'H4sIAAAAAAAAE02Q3UrDQBSEX2U51xubNM2Pe1ekDQEFMUEvRGSze9IsbjYxe0Iote8utSheDjN8M8wJRqM9iNd8E2fx7RsHryYz0jNO3gwORBzmHMj0CCLK8jSJozRJsyzmoIdeGgcC0Olhmf2NGnrgME8WBHREoxer1T9vBRxGecDakEUQUEzDwqS17DjME3tBaalji6GOUYfsbnCtNYqCdkJk+5nmCdnQ/uYepJMH7NER+2K7awmrCuCwYOMNYWUOTton/JzRU6lBQBTqUK03aSBVowPVNGGgG5RBk6skTKIs1dkaOBhfT9J5Kwk1iFZajxys2csrBS6iMNLRVfTGKxAnGH1TkSQEEWzOF8q9cR+oS7cdxz9Mhz0IN1vLwf/sq4/j5YrHbbF7fy6rsobzN/KFzdOSAQAA';

describe('decodeWaPayload', () => {
  it('decodes a real captured /wa/ body into its JSON payload', async () => {
    const payload = await decodeWaPayload(REAL_BODY);
    expect(payload).toMatchObject({
      pids: [843739],
      signalType: 'PAGE_VISIT',
      domain: 'endowus.com'
    });
  });

  it('accepts the raw bytes chrome.webRequest hands over, not just a string', async () => {
    const bytes = new TextEncoder().encode(REAL_BODY);
    const payload = await decodeWaPayload(bytes.buffer);
    expect(payload.pids).toEqual([843739]);
  });

  it('returns null for a body that is not base64 gzip', async () => {
    expect(await decodeWaPayload('definitely not base64 gzip')).toBeNull();
  });

  it('returns null rather than throwing on empty input', async () => {
    expect(await decodeWaPayload('')).toBeNull();
    expect(await decodeWaPayload(null)).toBeNull();
  });
});

describe('readWaSignal', () => {
  it('extracts partner IDs as strings so they match the /collect path', () => {
    const sig = readWaSignal({ pids: [64448, 4629393], signalType: 'PAGE_VISIT' });
    expect(sig.pids).toEqual(['64448', '4629393']);
  });

  it('marks a PAGE_VISIT as the base beacon, not a conversion', () => {
    const sig = readWaSignal({ pids: [1], signalType: 'PAGE_VISIT' });
    expect(sig.isConversion).toBe(false);
  });

  it('tolerates a payload with no pids', () => {
    expect(readWaSignal({ signalType: 'PAGE_VISIT' }).pids).toEqual([]);
  });

  it('returns null for a non-payload', () => {
    expect(readWaSignal(null)).toBeNull();
  });
});

// /wa/ carries two event types, per LinkedIn's own tag source:
//   EVENT_TYPE: { PAGE_VISIT: "PAGE_VISIT", CLICK: "CLICK" }
// A click proves the tag is alive but is NOT the page-visit beacon, so it must
// contribute its partner IDs without satisfying "the tag fired".
describe('waSignalOverlay', () => {
  it('treats a PAGE_VISIT as the base beacon', () => {
    const o = waSignalOverlay({ pids: ['123'], signalType: 'PAGE_VISIT' });
    expect(o).toMatchObject({ kind: 'wa', pid: '123' });
  });

  it('marks a CLICK as its own kind so it cannot stand in for a page visit', () => {
    const o = waSignalOverlay({ pids: ['123'], signalType: 'CLICK' });
    expect(o.kind).toBe('wa-click');
  });

  it('still harvests the partner IDs from a CLICK', () => {
    expect(waSignalOverlay({ pids: ['123', '456'], signalType: 'CLICK' }).pid).toBe('123,456');
  });

  it('labels a click row distinctly for the timeline', () => {
    expect(waSignalOverlay({ pids: ['1'], signalType: 'CLICK' }).label).toBe('Click signal');
    expect(waSignalOverlay({ pids: ['1'], signalType: 'PAGE_VISIT' }).label).toBeNull();
  });

  it('falls back to the base beacon for an unknown signal type', () => {
    expect(waSignalOverlay({ pids: ['1'], signalType: 'SOMETHING_NEW' }).kind).toBe('wa');
  });

  it('returns null when there is no signal to overlay', () => {
    expect(waSignalOverlay(null)).toBeNull();
  });
});
