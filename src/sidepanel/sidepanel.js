// Side panel — the roomy live working surface.
//
// Deliberately NOT a DevTools panel: capture happens in the service worker whether
// or not this is open, so docking the panel is optional rather than required.
// It follows the active tab, so clicking through a site keeps the view in sync.

import { render, resetTimelineView } from '../ui/render.js';
import { fetchState, hostFromUrl, copyReport, downloadCsv, flash } from '../ui/actions.js';

const els = {
  host: document.getElementById('host'),
  hero: document.getElementById('hero'),
  heroTitle: document.getElementById('hero-title'),
  heroDesc: document.getElementById('hero-desc'),
  pids: document.getElementById('pids'),
  pidCount: document.getElementById('pid-count'),
  conversions: document.getElementById('conversions'),
  convCount: document.getElementById('conv-count'),
  warningsBlock: document.getElementById('warnings-block'),
  warnings: document.getElementById('warnings'),
  timeline: document.getElementById('timeline'),
  timelineCount: document.getElementById('timeline-count'),
  copyReport: document.getElementById('copy-report'),
  exportCsv: document.getElementById('export-csv'),
  clear: document.getElementById('clear')
};

let currentState = null;
let currentHost = '';
let currentTabId = null;

async function tick() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (tab.id !== currentTabId) {
    // Following a different tab means a different timeline — drop the expanded row
    // and the render cache so the panel redraws from scratch.
    currentTabId = tab.id;
    resetTimelineView();
  }

  const host = hostFromUrl(tab.url);
  if (host !== currentHost) {
    currentHost = host;
    els.host.textContent = host;
  }

  const state = await fetchState(tab.id);
  if (!state) return;
  currentState = state;
  render(els, state);
}

els.copyReport.addEventListener('click', async () => {
  if (!currentState) return;
  try {
    await copyReport(currentState, currentHost);
    flash(els.copyReport, 'Copied ✓');
  } catch {
    flash(els.copyReport, 'Copy failed');
  }
});

els.exportCsv.addEventListener('click', () => {
  if (!currentState) return;
  downloadCsv(currentState.timeline || [], currentHost);
});

els.clear.addEventListener('click', async () => {
  if (currentTabId == null) return;
  resetTimelineView();
  try {
    await chrome.runtime.sendMessage({ type: 'clear', tabId: currentTabId });
  } catch {
    /* worker may be waking; the next tick re-renders regardless */
  }
  await tick();
});

tick();
setInterval(tick, 1000);
