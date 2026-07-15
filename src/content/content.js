// ISOLATED-world content script.
//
// Two jobs:
//   1. Signal a fresh document load so the service worker resets this tab's
//      state (this is our navigation trigger — no extra permission needed).
//   2. Relay the MAIN-world script's window.postMessage reports to the worker.

(function () {
  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // Context can be invalidated during navigation/reload — ignore.
    }
  }

  // Fresh document → reset the tab's evidence.
  send({ type: 'navigation', url: location.href });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__liItc !== true || data.source !== 'li-itc-main') return;

    if (data.kind === 'globals') {
      send({ type: 'dom', globals: data.globals });
    } else if (data.kind === 'lintrk') {
      send({ type: 'lintrk', conversionId: data.conversionId });
    }
  });
})();
