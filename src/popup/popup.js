// Popup — the fast "is it firing?" glance.
//
// Rendering and exports live in ../ui so the side panel shows an identical verdict.

import { render } from '../ui/render.js';
import { fetchState, hostFromUrl, copyReport, flash } from '../ui/actions.js';

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
  openPanel: document.getElementById('open-panel'),
  copyReport: document.getElementById('copy-report')
};

let currentState = null;
let currentHost = '';

async function refresh(tabId) {
  const state = await fetchState(tabId);
  if (!state) return;
  currentState = state;
  render(els, state);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    els.host.textContent = 'No active tab';
    return;
  }

  currentHost = hostFromUrl(tab.url);
  els.host.textContent = currentHost;

  els.openPanel.addEventListener('click', async () => {
    try {
      // Must be called in the same turn as the click — it needs a user gesture.
      // Deliberately no window.close(): the popup dismisses itself once focus moves
      // to the panel, and closing it explicitly here can cancel the open mid-flight.
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch {
      flash(els.openPanel, "Couldn't open panel");
    }
  });

  els.copyReport.addEventListener('click', async () => {
    if (!currentState) return;
    try {
      await copyReport(currentState, currentHost);
      flash(els.copyReport, 'Copied ✓');
    } catch {
      flash(els.copyReport, 'Copy failed');
    }
  });

  await refresh(tab.id);
  // Poll so live conversions (fired after opening the popup) show up.
  setInterval(() => refresh(tab.id), 1000);
}

init();
