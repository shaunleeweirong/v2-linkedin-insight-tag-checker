// Service worker — the reliable spine of the extension.
//
// It observes LinkedIn Insight Tag network beacons via chrome.webRequest, folds
// them (plus DOM/lintrk evidence relayed from content scripts) into a per-tab
// state, and answers the popup's getState requests.
//
// MV3 note: this top level runs again every time the worker wakes from sleep, so
// listeners MUST be registered synchronously here (not inside async callbacks),
// and state is mirrored to chrome.storage.session so it survives a restart.

import { parseInsightRequest } from '../shared/beacon-parse.js';
import { decodeWaPayload, readWaSignal, waSignalOverlay } from '../shared/wa-payload.js';
import { ALL_REQUEST_FILTERS, decodeRequest } from '../shared/providers/index.js';
import { deriveBaseStatus } from '../shared/state.js';
import { createTabStore } from './tab-store.js';

// Per-tab state lives here. The store hydrates from chrome.storage.session on a
// memory miss, which is what makes the evidence survive an MV3 worker restart —
// see tab-store.js for why that matters.
const store = createTabStore({
  storage: {
    get: (key) => chrome.storage.session.get(key).then((got) => got[key]),
    set: (key, value) => chrome.storage.session.set({ [key]: value }),
    remove: (key) => chrome.storage.session.remove(key)
  },
  onChange: updateBadge
});

// ---------------------------------------------------------------------------
// /wa/ payload buffer.
//
// The partner IDs of the current Insight Tag live in the POST body, which is only
// readable from onBeforeRequest — but "it reached LinkedIn" is only knowable from
// onResponseStarted. So the decode is kicked off on the way out and awaited on the
// way back in, correlated by requestId.
//
// Values are PROMISES: onResponseStarted can fire before the async gunzip settles.
// ---------------------------------------------------------------------------
const pendingWaPayloads = new Map();
const PENDING_WA_CAP = 50;

function stashWaPayload(requestId, promise) {
  // A request that never produces a response (cancelled, worker restarted
  // mid-flight) would otherwise leak an entry, so evict oldest-first.
  if (pendingWaPayloads.size >= PENDING_WA_CAP) {
    const oldest = pendingWaPayloads.keys().next().value;
    pendingWaPayloads.delete(oldest);
  }
  pendingWaPayloads.set(requestId, promise);
}

async function takeWaSignal(requestId) {
  const pending = pendingWaPayloads.get(requestId);
  if (!pending) return null;
  pendingWaPayloads.delete(requestId);
  try {
    return readWaSignal(await pending);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Badge — a quick health signal without opening the popup.
// Three plain states: ✓ firing, ! needs attention, blank when there's no tag.
// The hover tooltip spells out the details.
// ---------------------------------------------------------------------------
function updateBadge(tabId, state) {
  const status = deriveBaseStatus(state);

  let text = '';
  let color = '#16a34a';
  let title = 'LinkedIn Insight Tag Checker';

  if (status === 'firing') {
    text = '✓';
    color = '#16a34a';
    title = 'Insight Tag: firing';
  } else if (status === 'present' || status === 'blocked' || status === 'loaded') {
    text = '!';
    color = '#f59e0b';
    title =
      status === 'blocked'
        ? 'Insight Tag: requests blocked in your browser'
        : status === 'loaded'
          ? 'Insight Tag: script loaded but sent no signal'
          : 'Insight Tag: present but not firing';
  } else {
    title = 'Insight Tag: not found';
  }

  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (text) {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' }).catch(() => {});
  }
  chrome.action.setTitle({ tabId, title }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Network observation (registered synchronously at top level)
// ---------------------------------------------------------------------------
// Listens across every registered vendor. LinkedIn is still the only provider that
// feeds the diagnostic; the rest only populate the timeline.
const FILTER = { urls: ALL_REQUEST_FILTERS };

// Use onResponseStarted (not onCompleted) for the "fired" signal. LinkedIn's base
// /collect beacon 302-redirects through a cookie-sync chain; onCompleted only
// fires for the FINAL response in that chain, so a beacon whose chain doesn't end
// on a /collect URL would be missed. onResponseStarted fires the moment LinkedIn
// responds to EACH request (including the 302s), which is the true "it fired and
// reached LinkedIn" signal. The reducer is idempotent, so repeat events are safe.
// Capture the /wa/ request BODY on the way out. This is the only place Chrome
// exposes it, and on tags that have migrated off /collect it is the only place a
// Partner ID appears on the network at all.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const req = parseInsightRequest(details.url);
    if (!req || req.kind !== 'wa') return;
    const raw = details.requestBody && details.requestBody.raw;
    if (!raw || !raw.length || !raw[0].bytes) return;
    stashWaPayload(details.requestId, decodeWaPayload(raw[0].bytes));
  },
  { urls: ['*://px.ads.linkedin.com/wa/*'] },
  ['requestBody']
);

chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    const decoded = decodeRequest(details.url);
    if (!decoded) return;
    const req = parseInsightRequest(details.url); // null for the observed-only vendors

    const emit = (overlay) =>
      store.apply(details.tabId, {
        type: 'request',
        req: overlay ? { ...req, kind: overlay.kind, pid: overlay.pid } : req,
        // decodeRequest() runs off the URL and cannot know what the body said, so
        // a /wa/ row would otherwise show a blank account — and a click would be
        // labelled as a page view.
        decoded: overlay
          ? {
              ...decoded,
              account: overlay.pid ?? decoded.account,
              label: overlay.label ?? decoded.label,
              event: overlay.event
            }
          : decoded,
        phase: 'completed',
        statusCode: details.statusCode
      });

    if (req && req.kind === 'wa') {
      // Await the body decode started in onBeforeRequest, then fold the ids in.
      // Still records the beacon if the payload can't be read — reaching LinkedIn
      // is a fact worth keeping even when the partner IDs aren't recoverable.
      takeWaSignal(details.requestId).then((signal) => emit(waSignalOverlay(signal)));
      return;
    }

    emit(null);
  },
  FILTER
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const decoded = decodeRequest(details.url);
    if (!decoded) return;
    pendingWaPayloads.delete(details.requestId); // no response coming; don't leak
    store.apply(details.tabId, {
      type: 'request',
      req: parseInsightRequest(details.url),
      decoded,
      phase: 'error',
      error: details.error
    });
  },
  FILTER
);

// ---------------------------------------------------------------------------
// Messages from content scripts and the popup
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : msg.tabId;

  switch (msg && msg.type) {
    case 'navigation':
      // A fresh document load resets the tab's per-page evidence.
      store.reset(tabId, msg.url);
      return; // no async response

    case 'dom':
      store.apply(tabId, { type: 'dom', globals: msg.globals });
      return;

    case 'lintrk':
      store.apply(tabId, { type: 'lintrk', conversionId: msg.conversionId });
      return;

    case 'clear':
      // Explicit user reset from the side panel — drops the session timeline too.
      store.clear(tabId, msg.url || null).then(() => sendResponse({ ok: true }));
      return true;

    case 'getState':
      store.get(msg.tabId).then((state) => {
        sendResponse({ state, status: deriveBaseStatus(state) });
      });
      return true; // keep the channel open for the async response

    default:
      return;
  }
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener((tabId) => store.remove(tabId));
