// Shared UI actions: fetching state, and exporting evidence.

import { formatReport, timelineToCsv } from '../shared/report.js';

/** Ask the service worker for a tab's current state. */
export async function fetchState(tabId) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getState', tabId });
    return res && res.state ? res.state : null;
  } catch {
    return null; // worker may be waking — the next poll retries
  }
}

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '—';
  }
}

/** Briefly swap a button's label to confirm an action fired. */
export function flash(button, message, ms = 1400) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, ms);
}

export async function copyReport(state, host) {
  const text = formatReport(state, { host, now: Date.now() });
  await navigator.clipboard.writeText(text);
  return text;
}

/**
 * Save the decoded log as CSV.
 *
 * Uses an object URL + <a download> rather than chrome.downloads so the extension
 * doesn't have to request the "downloads" permission for a local file save.
 */
export function downloadCsv(timeline, host) {
  const csv = timelineToCsv(timeline);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `insight-tag-${(host || 'page').replace(/[^a-z0-9.-]/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Give the click a tick to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
