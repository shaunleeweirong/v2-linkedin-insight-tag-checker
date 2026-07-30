# LinkedIn Insight Tag Checker

A Chrome extension (Manifest V3) that checks whether the **LinkedIn Insight Tag**
and its **event-specific conversions** are installed and firing on any website —
in real time, entirely locally — and **decodes** the marketing tag requests the page
sends so you can read their parameters without opening the Network tab.

Most tag debuggers are decoders with no diagnosis: when nothing fires you get an empty
list, which looks identical whether the tag is missing, broken, or eaten by your own ad
blocker. This one does both — it decodes *and* tells you what's wrong.

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
- **Adjacent vendor tags** — Google Analytics 4, Google Ads and the Meta Pixel are
  decoded into the same timeline for context. They are **observed, never diagnosed**:
  a Meta pixel firing can't make the LinkedIn verdict look healthy.

## Nothing gets lost

A conversion that fires on click and then navigates away — a form submit to a
thank-you page, i.e. most lead-gen conversions — used to be erased before you could
read its ID, because a fresh document reset the tab's state.

The **session timeline** fixes this: it is append-only for the life of the tab, marked
with a page boundary at each navigation, while the per-page diagnostic still resets so
the verdict never goes stale. Click, navigate, then open the panel — the conversion ID
is still there under the previous page.

It distinguishes four states so it never lies to you:

| State | Meaning |
| --- | --- |
| **Firing** | A beacon completed — the tag is live. |
| **Present, not firing** | Tag is in the DOM but no beacon fired (consent gate, malformed snippet, PID mismatch). |
| **Blocked** | Beacons errored — likely *your own* ad/consent blocker, not the site. |
| **Not found** | No trace of the Insight Tag. |

Error strings are classified rather than lumped together: `ERR_BLOCKED_BY_CLIENT` (and
DNS-level blocking) means **Blocked**, but `ERR_ABORTED` — a beacon cancelled by the
navigation it triggered — is normal and must never read as blocked. See
`classifyError()` in `src/shared/beacon-parse.js`.

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
3. **ISOLATED-world content script** (`src/content/content.js`) — signals navigation
   and relays the MAIN script's messages to the worker.

Every observed request is run through the **provider registry**
(`src/shared/providers/`), which matches it to a vendor and decodes its parameters.
Known params get friendly names; **unknown params pass through raw**, because LinkedIn
and Google both ship undocumented ones and dropping them would defeat the decoder.
Only LinkedIn is `tier: 'diagnosed'`.

Two UI surfaces share one renderer (`src/ui/render.js`):

- **Popup** — the fast verdict glance, plus Copy report.
- **Side panel** — the roomy live timeline with expandable decoded params, CSV export
  and Clear.

Deliberately **not** a DevTools panel: capture happens in the service worker whether or
not any UI is open, so the panel is optional rather than required.

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
3. **The navigating conversion** (the case this tool exists for): open the live panel
   from the popup, click *"Fire conversion #55550000 → go to thank-you page"*. After
   the thank-you page loads, `#55550000` must still be readable in the timeline under
   the previous page's marker, and the verdict must **not** say "Blocked" — the beacon
   was cancelled by the navigation, not by a blocker.
4. **Decoder**: click the Meta / GA4 / Google Ads buttons → each appears in the
   timeline with decoded params, and the LinkedIn verdict is unchanged.
5. **Export**: Copy report gives a pasteable verdict; Export CSV downloads the log.
6. Turn on an ad blocker and reload → confirm it reports **Blocked**, not
   "not found".

## Project layout

```
manifest.json            MV3 manifest
vite.config.js           @crxjs/vite-plugin build
src/shared/              pure, unit-tested logic (beacon parse, state reducer, report)
src/shared/providers/    vendor registry + parameter decoding
src/background/          service worker (webRequest spine)
src/content/             MAIN + ISOLATED content scripts
src/ui/                  renderer + actions shared by popup and side panel
src/popup/               popup UI (vanilla JS)
src/sidepanel/           live decoded timeline
scripts/gen-icons.mjs    dependency-free PNG icon generator
store/                   Chrome Web Store deliverables
test-page/               local test harness (index.html + thankyou.html)
```

## Privacy

No data is collected or transmitted. All analysis is local; per-tab results and the
decoded timeline live in `chrome.storage.session` and are cleared on tab close.

`webRequest` listeners are filtered to a **fixed list of vendor tag endpoints**
(LinkedIn, GA4, Google Ads, Meta) — general browsing is never observed. The full list
is in `store/permissions-justification.md`; if you add a provider you must update that
table, `store/privacy-policy.md` **and** `docs/privacy-policy.html`, which are the
hosted and store-facing copies of the same promise.
