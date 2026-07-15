// Service worker — the reliable spine of the extension.
//
// It observes LinkedIn Insight Tag network beacons via chrome.webRequest, folds
// them (plus DOM/lintrk evidence relayed from content scripts) into a per-tab
// state, and answers the popup's getState requests.
//
// MV3 note: this top level runs again every time the worker wakes from sleep, so
// listeners MUST be registered synchronously here (not inside async callbacks),
// and state is mirrored to chrome.storage.session so it survives a restart.

import { parseInsightRequest, REQUEST_FILTERS } from '../shared/beacon-parse.js';
import { initialTabState, reduce, deriveBaseStatus } from '../shared/state.js';

const tabStates = new Map();
const STORAGE_PREFIX = 'tab:';

// ---------------------------------------------------------------------------
// Persistence (survive worker sleep)
// ---------------------------------------------------------------------------
function persist(tabId, state) {
  chrome.storage.session.set({ [STORAGE_PREFIX + tabId]: state }).catch(() => {});
}

async function hydrate(tabId) {
  if (tabStates.has(tabId)) return tabStates.get(tabId);
  const key = STORAGE_PREFIX + tabId;
  let state;
  try {
    const got = await chrome.storage.session.get(key);
    state = got[key];
  } catch {
    state = null;
  }
  state = state || initialTabState();
  tabStates.set(tabId, state);
  return state;
}

function apply(tabId, event) {
  if (tabId == null || tabId < 0) return null;
  const prev = tabStates.get(tabId) || initialTabState();
  const next = reduce(prev, event, Date.now());
  tabStates.set(tabId, next);
  persist(tabId, next);
  updateBadge(tabId, next);
  return next;
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
  } else if (status === 'present' || status === 'blocked') {
    text = '!';
    color = '#f59e0b';
    title =
      status === 'blocked'
        ? 'Insight Tag: requests blocked in your browser'
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
const FILTER = { urls: REQUEST_FILTERS };

// Use onResponseStarted (not onCompleted) for the "fired" signal. LinkedIn's base
// /collect beacon 302-redirects through a cookie-sync chain; onCompleted only
// fires for the FINAL response in that chain, so a beacon whose chain doesn't end
// on a /collect URL would be missed. onResponseStarted fires the moment LinkedIn
// responds to EACH request (including the 302s), which is the true "it fired and
// reached LinkedIn" signal. The reducer is idempotent, so repeat events are safe.
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    const req = parseInsightRequest(details.url);
    if (!req) return;
    apply(details.tabId, {
      type: 'request',
      req,
      phase: 'completed',
      statusCode: details.statusCode
    });
  },
  FILTER
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const req = parseInsightRequest(details.url);
    if (!req) return;
    apply(details.tabId, { type: 'request', req, phase: 'error', error: details.error });
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
      // A fresh document load resets the tab's evidence.
      if (tabId != null && tabId >= 0) {
        const next = reduce(null, { type: 'navigation', url: msg.url }, Date.now());
        tabStates.set(tabId, next);
        persist(tabId, next);
        updateBadge(tabId, next);
      }
      return; // no async response

    case 'dom':
      apply(tabId, { type: 'dom', globals: msg.globals });
      return;

    case 'lintrk':
      apply(tabId, { type: 'lintrk', conversionId: msg.conversionId });
      return;

    case 'getState':
      hydrate(msg.tabId).then((state) => {
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
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  chrome.storage.session.remove(STORAGE_PREFIX + tabId).catch(() => {});
});
