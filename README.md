# LinkedIn Insight Tag Checker

A Chrome extension (Manifest V3) that checks whether the **LinkedIn Insight Tag**
and its **event-specific conversions** are installed and firing on any website —
in real time, entirely locally.

## What it detects

- **Base Insight Tag** — installed *and actually firing* (not just present in the
  HTML), via the beacon to `px.ads.linkedin.com/collect`.
- **Partner ID(s)** — from `_linkedin_partner_id` / `_linkedin_data_partner_ids`
  and the beacon `pid` param, with duplicate/multiple-tag warnings.
- **Event-specific conversions** — `window.lintrk('track', { conversion_id })`
  calls and hardcoded image pixels, captured with their **conversion ID**,
  trigger type, and whether the beacon completed.
- **Consent gates** — detects common CMPs (OneTrust, Cookiebot, TrustArc,
  Usercentrics, Osano, Didomi, IAB TCF) and, when the tag isn't firing, tells you
  the consent tool may be blocking it until marketing cookies are accepted.

It distinguishes four states so it never lies to you:

| State | Meaning |
| --- | --- |
| **Firing** | A beacon completed — the tag is live. |
| **Present, not firing** | Tag is in the DOM but no beacon fired (consent gate, malformed snippet, PID mismatch). |
| **Blocked** | Beacons errored — likely *your own* ad/consent blocker, not the site. |
| **Not found** | No trace of the Insight Tag. |

> **Scope:** event-specific conversions (fully observable client-side). Server-side
> URL-rule conversions are matched inside LinkedIn and their conversion ID is never
> visible in the browser — out of scope by design.

## How it works

Three cooperating contexts, aggregated per-tab in the service worker:

1. **Service worker + `chrome.webRequest`** — the reliable spine. Observes every
   `/collect` beacon and the library load, capturing `pid`, `conversionId`,
   `fmt`, and completion/error. A conversion is discriminated from the base
   beacon by the **presence of `conversionId`**.
2. **MAIN-world content script** (`src/content/inject-main.js`) — reads page
   globals and wraps `window.lintrk` (surviving the library reassigning it) to
   capture post-load button/form conversions. Enhancement only; detection never
   depends on it.
3. **ISOLATED-world content script** (`src/content/content.js`) — resets state on
   navigation and relays the MAIN script's messages to the worker.

Popup UI polls the worker so live conversions appear as they fire.

## Develop

```bash
npm install
npm run icons     # generate icons/*.png (no dependencies)
npm test          # vitest — pure logic in src/shared
npm run build     # vite build → dist/  (loadable unpacked extension)
```

Load in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `dist/`.

## Verify

1. `npm test` — parsing + state trichotomy (automated).
2. Live check in Chrome:
   1. `npm run build`, then load `dist/` unpacked (`chrome://extensions` → Load unpacked).
   2. Serve the test page over **HTTP** (content scripts don't run on `file://`
      unless you enable "Allow access to file URLs" for the extension):
      `npx serve test-page` or `python3 -m http.server -d test-page 8080`.
   3. Open the served page and **reload it** (a tab already open when the
      extension loaded won't be instrumented until reloaded).
   4. Open the popup → base tag shows **Firing** + PID `0000000`.
   5. Click both buttons → conversions `#12345678` and `#87654321` appear as
      **fired**. (The lintrk one _should_ be tagged `lintrk`; if it shows as
      `pixel` that's fine — the beacon is the source of truth, the label is a
      best-effort enhancement.)
3. Turn on an ad blocker and reload → confirm it reports **Blocked**, not
   "not found".

## Project layout

```
manifest.json            MV3 manifest
vite.config.js           @crxjs/vite-plugin build
src/shared/              pure, unit-tested logic (beacon parse + state reducer)
src/background/          service worker (webRequest spine)
src/content/             MAIN + ISOLATED content scripts
src/popup/               popup UI (vanilla JS)
scripts/gen-icons.mjs    dependency-free PNG icon generator
store/                   Chrome Web Store deliverables
test-page/               local test harness
```

## Privacy

No data is collected or transmitted. All analysis is local; per-tab results live
in `chrome.storage.session` and are cleared on tab close. See
`store/privacy-policy.md`.
