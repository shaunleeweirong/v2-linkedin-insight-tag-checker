// MAIN-world content script.
//
// Runs in the page's own JS context (document_start) so it can read the Insight
// Tag globals and wrap window.lintrk. This is an ENHANCEMENT layer — it adds
// trigger/intent context — but detection never depends on it; the service worker
// sees every beacon via chrome.webRequest regardless.
//
// It can't call chrome.* APIs, so it reports out via window.postMessage, which
// the ISOLATED-world content script relays to the service worker.

(function () {
  const SOURCE = 'li-itc-main';

  function post(payload) {
    try {
      window.postMessage({ __liItc: true, source: SOURCE, ...payload }, '*');
    } catch {
      /* ignore */
    }
  }

  // --- Wrap window.lintrk, surviving the library reassigning it -------------
  //
  // The page snippet defines a placeholder lintrk with a `.q` queue; once
  // insight.min.js loads it REPLACES window.lintrk with the real function. To
  // keep capturing post-load button/form conversions we intercept the setter.
  function wrapLintrk(fn) {
    if (typeof fn !== 'function' || fn.__liItcWrapped) return fn;
    const wrapped = function (action, data) {
      try {
        if (action === 'track' && data && data.conversion_id != null) {
          post({ kind: 'lintrk', conversionId: String(data.conversion_id) });
        }
      } catch {
        /* never break the host page */
      }
      return fn.apply(this, arguments);
    };
    wrapped.__liItcWrapped = true;
    try {
      // Preserve the queue the bootstrap snippet pushes onto.
      wrapped.q = fn.q || [];
    } catch {
      /* ignore */
    }
    return wrapped;
  }

  let current = window.lintrk;
  try {
    Object.defineProperty(window, 'lintrk', {
      configurable: true,
      get() {
        return current;
      },
      set(value) {
        current = wrapLintrk(value);
      }
    });
    if (current) current = wrapLintrk(current);
  } catch {
    // Fallback: best-effort direct wrap if the property is locked.
    try {
      if (window.lintrk) window.lintrk = wrapLintrk(window.lintrk);
    } catch {
      /* ignore */
    }
  }

  // --- Detect a consent management platform (CMP) --------------------------
  // A consent tool is the most common reason a correctly-installed tag doesn't
  // fire until the visitor accepts marketing cookies.
  function detectCmp() {
    try {
      if (window.OneTrust || typeof window.OnetrustActiveGroups !== 'undefined') return 'OneTrust';
      if (window.Cookiebot || window.Cookiebot === null) return 'Cookiebot';
      if (window.truste) return 'TrustArc';
      if (window.UC_UI || window.usercentrics) return 'Usercentrics';
      if (window.Osano) return 'Osano';
      if (window.Didomi || window.didomiOnReady) return 'Didomi';
      if (window.Cookielaw) return 'OneTrust';
      if (typeof window.__tcfapi === 'function') return 'A consent tool (IAB TCF)';
    } catch {
      /* ignore */
    }
    return null;
  }

  // --- Read page globals / DOM presence ------------------------------------
  function readGlobals() {
    let partnerIds = [];
    try {
      if (Array.isArray(window._linkedin_data_partner_ids)) {
        partnerIds = window._linkedin_data_partner_ids.map(String);
      }
      const single = window._linkedin_partner_id;
      if (single != null && single !== '' && !partnerIds.includes(String(single))) {
        partnerIds.push(String(single));
      }
    } catch {
      /* ignore */
    }

    let scriptPresent = false;
    let noscriptPixel = false;
    try {
      scriptPresent = !!document.querySelector(
        'script[src*="snap.licdn.com/li.lms-analytics"]'
      );
      noscriptPixel = Array.from(document.querySelectorAll('noscript')).some((n) =>
        /px\.ads\.linkedin\.com\/collect/.test(n.textContent || n.innerHTML || '')
      );
    } catch {
      /* ignore */
    }

    return {
      partnerIds,
      hasLintrk: typeof window.lintrk === 'function',
      scriptPresent,
      noscriptPixel,
      cmp: detectCmp()
    };
  }

  function report() {
    post({ kind: 'globals', globals: readGlobals() });
  }

  // Report early and again later — tag managers often inject the tag well after
  // the initial load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', report, { once: true });
  } else {
    report();
  }
  window.addEventListener('load', report, { once: true });
  setTimeout(report, 1500);
  setTimeout(report, 4000);
})();
