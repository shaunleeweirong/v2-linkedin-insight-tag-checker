# "Insight Tag is firing" + "Partner ID: Not detected yet" — root cause analysis

**Date:** 2026-08-12
**Version tested:** 0.4.3 (`~/Downloads/insight-tag-checker-0.4.3`, the shipped build)
**Method:** the real 0.4.3 unpacked extension loaded into Chrome for Testing via Playwright, 32 sites
visited, and for each site three layers captured — (1) every LinkedIn network request incl. POST bodies,
(2) the page's Insight Tag globals, (3) the extension's own recorded state read straight out of
`chrome.storage.session`.

---

## Status

Findings 1, 2 and 3 are **fixed** and shipped in **v0.5.0** (see "Fixes applied" at the end).
Findings 4 and 5 are **open**.

The source of the shipped build was confirmed to be `origin/main` @ `b5b26aa` (tag `v0.4.3`):
`npm run build` on that commit reproduces the shipped bundle byte-for-byte (identical vite content
hashes). The analysis below was originally done against the beautified shipped bundles and then
re-confirmed line-by-line against that source.

---

## The short version

The extension has exactly **two** ways to learn a Partner ID, and on modern sites both fail
independently:

| Source | How it reads it | Why it fails today |
|---|---|---|
| Network beacon | `pid` **URL query param** on `GET px.ads.linkedin.com/collect` | LinkedIn's current tag posts the page-visit signal to **`POST px.ads.linkedin.com/wa/`** with a **gzip+base64 JSON body**. The extension matches neither the endpoint nor reads bodies. |
| Page DOM | `window._linkedin_data_partner_ids` | **12 of 26** tagged sites never expose it. And it is only read at DOMContentLoaded, `load`, +1.5s and **+4s** — after that the extension stops looking, so consent-gated / GTM-injected tags are missed. |

Meanwhile **"firing" is derived from the tag *library* merely downloading** — `anyBeaconFired()`
returns true on `library.fired`, and library requests are constructed with `pid: null` by design.

So `snap.licdn.com/li.lms-analytics/insight.min.js` loading is enough to paint the green
*"Insight Tag is firing — the tag loaded and reached LinkedIn"*, while both PID sources come up
empty → **"Partner ID: Not detected yet."** The two halves of the panel are computed from
different evidence and nothing reconciles them.

---

## Evidence

### Finding 1 — LinkedIn moved the page-visit beacon to `POST /wa/` (primary cause)

Decoded body of `POST https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g` on hubspot.com.
The wire bytes were checked directly (`postDataBuffer()`): the body starts `0x48 0x34 0x73 0x49`
= ASCII `"H4sI"`, i.e. the request body is **literally base64 text** whose decoded bytes are gzip.
So the decode pipeline is **bytes → ASCII → base64-decode → gunzip → JSON**:

```json
{"pids":[64448,4629393],"scriptVersion":1000010,"time":1786531796097,
 "domain":"hubspot.com","url":"https://hubspot.com/","signalType":"PAGE_VISIT"}
```

The Partner IDs are right there — in the **request body**, on an endpoint the extension never
watches. `parseInsightRequest()` only ever reads `url.searchParams`, and `REQUEST_FILTERS` is:

```js
['*://px.ads.linkedin.com/collect*', '*://snap.licdn.com/li.lms-analytics/*']
```

**24 of 26** tagged sites in the sweep now send `/wa/`. Two LinkedIn tag generations are live in the
wild right now:

```
scriptVersion 308        7 sites   sends /collect: 7    sends ONLY /wa/: 0
scriptVersion 1000010   17 sites   sends /collect: 16   sends ONLY /wa/: 1
```

Most sites still send the legacy `/collect` **as well**, which is the only reason the extension works
at all today. **hubspot.com has already stopped** — and it reproduces the screenshot exactly:

```
www.hubspot.com   lib=2  collect=0  wa=2
  page globals   : dataPartnerIds ["4629393","64448"], lintrk: function, scriptPresent: true
  ext domGlobals : { partnerIds: [], scriptPresent: false, hasLintrk: false }
  ext library    : { fired: true, statusCode: 200 }
  ext baseBeacon : null
  → STATUS "firing"   PARTNER IDS «none»          *** the screenshot ***
```

This is a migration, not a one-off. As sites roll onto scriptVersion 1000010 and LinkedIn drops the
legacy `/collect`, **this failure goes from rare to universal.**

Also unmatched and carrying the pid in plain sight in its query string:
`GET px.ads.linkedin.com/attribution_trigger?pid=…`, which commonly fires alongside `/collect`.

### Finding 2 — the 4-second DOM window closes before consent/GTM tags arrive

`inject-main.js` reports globals at DOMContentLoaded, `load`, +1500ms, +4000ms — then never again.
No `MutationObserver`, no polling. On hubspot.com the tag was injected after the cookie banner was
accepted; the extension's last read still shows `scriptPresent: false, partnerIds: []` while the page
at +14s had both partner IDs. This is what removes the DOM fallback exactly when Finding 1 removes the
network one.

### Finding 3 — per-tab state is wiped whenever the MV3 worker restarts

`service-worker.js`:

```js
function apply(tabId, event) {
  if (tabId == null || tabId < 0) return null;
  const prev = tabStates.get(tabId) || initialTabState();   // ← in-memory Map ONLY
  const next = reduce(prev, event, Date.now());
  tabStates.set(tabId, next);
  persist(tabId, next);                                     // ← then overwrites storage
}
```

`hydrate()` (the storage-backed read) is used **only** by the popup's `getState`. `apply()` never
touches storage. So the first event after the worker idles out starts from a blank state *and
persists it over the good one*.

0.4.3 made this far more likely: the webRequest listener now fires for **all 17 providers**, so a
routine GA4 / GTM / Meta / HubSpot beacon — not just a LinkedIn one — is enough to wake the worker and
wipe the tab.

Reproduced with the shipped reducer (`diagnostics/clobber-test.mjs`):

```
popup opened immediately:          status=FIRING    PARTNER ID=843739
--- 30s idle: MV3 terminates the service worker ---
--- a GA4 beacon (not LinkedIn) wakes it back up ---
popup opened after wake:           status=NOT-FOUND PARTNER ID=«Not detected yet»
--- now a LinkedIn library re-request (SPA route / cache revalidation) ---
popup after library re-request:    status=FIRING    PARTNER ID=«Not detected yet»   ← the screenshot
```

This is the best explanation for the **intermittency** — "Mandai showed it earlier, it's fine now."
Note that mandai.com and endowus.com both expose **no** `_linkedin_data_partner_ids`, so their PID has
a single point of failure: one `/collect` observation. Lose it and the panel goes into exactly this
state.

### Finding 4 — a reproducible false negative on a service-worker-proxied site (mechanism not fully pinned)

**singaporeair.com** is controlled by an Akamai service worker (`akam-sw.js`, confirmed via
`navigator.serviceWorker.controller`) which proxies its third-party tags. On one clean run the page
demonstrably fired **16 LinkedIn requests** (10× `insight.min.js`, `/collect?pid=3616420,640979`,
`POST /wa/`) — and the extension recorded **none of them**:

```
extension storage for that tab:
  library: null   baseBeacon: null   domGlobals: {partnerIds: [], scriptPresent: false}
  timeline: [page]                     ← zero request entries recorded
→ panel reads "No LinkedIn Insight Tag was detected on this page"
```

The LinkedIn `<script>` is never in the DOM here either (`scriptPresent: false`), so the DOM path dies
too. Reproduced across 2 consecutive clean visits.

**Caveat on the mechanism.** A later instrumented run (a probe listener registered inside the
extension's own service worker) recorded 158 `webRequest` events for this site but **zero** LinkedIn
ones — because on that run the page fired no LinkedIn requests at all. So the tag load here is
itself inconsistent between visits, and I could not capture a single run where the requests fired
*and* the probe was attached. What is established:

- the false negative is real and reproducible (tag firing, extension reports "not found");
- this site does generate `tabId: -1` events — the probe saw tabIds `[148595244, -1]`;
- `apply()` unconditionally drops them: `if (tabId == null || tabId < 0) return null;`

`tabId: -1` (page service workers, web workers, prefetch/prerender) is therefore the leading
candidate and is a genuine blind spot by code inspection, but treat the specific attribution for
singaporeair as **unconfirmed** — it could also be the Akamai worker serving the scripts from Cache
Storage, which produces no network event at all.

### Finding 5 — the `onResponseStarted` comment is factually wrong

`beacon-parse.js` / `service-worker.js` claim `onResponseStarted` "fires the moment LinkedIn responds
to EACH request (including the 302s)". It does not — a redirected request emits `onBeforeRedirect`, and
`onResponseStarted` fires only for the **final** response.

Observed on endowus.com: 3 `/collect` requests (302 → 302 → 200) produced exactly **one** timeline
entry. LinkedIn's beacon redirects through `www.linkedin.com/px/li_sync`, which is **not** in the
filter — so if a sync chain ever terminates off `/collect`, the beacon becomes invisible. The
"blocked" detection rests on the same assumption.

---

## Site matrix (32 sites, 26 with an Insight Tag)

Full table in `diagnostics/matrix.txt`; raw capture in `diagnostics/results.json`. Headline numbers:

```
sites visited                    : 32
with a LinkedIn Insight Tag      : 26
  FIRING but NO PARTNER ID       : 1  (www.hubspot.com)      ← the reported bug, live
  complete false negative        : 1  (www.singaporeair.com) ← Finding 4
  using the /wa/ POST endpoint   : 24
  /wa/ with NO /collect at all   : 1  (www.hubspot.com)
  exposing DOM partner-id globals: 14 / 26 — the other 12 depend 100% on the beacon
```

The 12 "beacon-only" sites (endowus, mandai, datadog, snowflake, mongodb, okta, docusign, servicenow,
notion, figma, semrush, 6sense) are the fragile population: one missed `/collect` and they show the
reported symptom. **endowus.com and mandai.com are both in it** — which is exactly why they were the
two sites that surfaced this.

`segment.com` shows `NO-STATE` in the matrix — it 301s to `twilio.com/en-us/segment`, so the harness's
host match missed the tab. Harness artifact, not an extension defect.

**Important caveat on these numbers.** Playwright attaches a debugger to the extension's service
worker, which *keeps it alive*. Finding 3 (the restart clobber) therefore **cannot occur during this
sweep** — the sweep measures Findings 1, 2 and 4 only. In the user's normal Chrome the worker does
idle out after ~30s, so the real-world rate of "firing but no PID" is higher than the 1/26 measured
here. That is why the symptom looks intermittent in daily use but rare in the matrix.

---

## What the app actually does (capability review)

MV3 extension, no network egress of its own, no analytics — the "100% local" claim holds. `<all_urls>`
host permission is genuinely required (Chrome only dispatches `webRequest` when the extension has host
access to both the request URL **and** the initiating page).

- **Service worker** — the spine. Listens on `webRequest.onResponseStarted` / `onErrorOccurred`,
  folds events into a per-tab state via a pure reducer, mirrors to `chrome.storage.session`, drives the
  toolbar badge (`✓` firing / `!` present-or-blocked / blank).
- **Two content scripts** — a MAIN-world script that reads the Insight Tag globals and wraps
  `window.lintrk` (surviving the library's reassignment via a property setter) to catch
  `lintrk('track', {conversion_id})`, plus an ISOLATED-world relay. `all_frames: false`, so
  iframe-hosted tags are invisible to the DOM layer.
- **Tag decoder (new in 0.4.x)** — 17 providers: LinkedIn, GA4, GTM, Adobe Analytics, Google Ads,
  Meta, Microsoft UET, TikTok, Pinterest, Snapchat, X, Reddit, HubSpot, Marketo, Pardot, 6sense,
  Demandbase. Each contributes URL filters, a matcher, and a parameter dictionary that renames raw
  params to human labels. LinkedIn is tier `diagnosed`; the rest are `observed`.
- **Popup** — status hero, Partner IDs, conversions, warnings, copy report, open side panel.
- **Side panel** — adds a live 300-entry timeline, CSV export, and clear. Conversions that navigate
  away survive here.
- **Warnings** — multiple/duplicate PIDs, consent-gate (CMP detection covers OneTrust, Cookiebot,
  TrustArc, Usercentrics, Osano, Didomi, IAB TCF), blocked beacons, present-not-firing, missing
  `lintrk`.
- **Error classification** — `BLOCKED_BY_CLIENT` etc. → "blocked", distinguishing the auditor's own ad
  blocker from a broken install. Good idea, well executed.

The architecture is sound: pure reducer, network as the source of truth, DOM as enhancement, unit
tests on the pure layer. The defects above are all in the **evidence-gathering edges**, not the core.

---

## Recommended fixes, in priority order

1. **Match `/wa/` and parse its body.** Add `*://px.ads.linkedin.com/wa/*` and
   `*://px.ads.linkedin.com/attribution_trigger*` to the filters. `webRequest` cannot read request
   bodies on `onResponseStarted` — use `onBeforeRequest` with `extraInfoSpec: ['requestBody']` and
   decode `details.requestBody.raw[0].bytes` as **ASCII text → base64-decode → gunzip → JSON**, then
   read `.pids` (verified wire format: the body literally begins with the ASCII `"H4sI"` gzip-base64
   preamble). `DecompressionStream('gzip')` is available in an MV3 service worker, so no library is
   needed:
   ```js
   const text = new TextDecoder().decode(details.requestBody.raw[0].bytes);
   const gz   = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
   const json = await new Response(
     new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
   ).json();          // -> { pids: [...], signalType: 'PAGE_VISIT', ... }
   ```
   Treat `signalType: "PAGE_VISIT"` as the base beacon and `"CONVERSION"` as a conversion. Keep
   `/collect` for the legacy tag. *This alone fixes the reported bug.*
2. **Stop calling a library download "firing."** Split the status: the library loading is
   `library-loaded`, not `firing`. Reserve "firing" for an actual page-visit signal (`/collect` or
   `/wa/`). A tag whose script loads but sends no signal is a real, reportable finding — surface it as
   *"Tag script loaded but no page-visit signal sent"* rather than a green tick with a blank PID.
3. **Make `apply()` async and hydrate from `chrome.storage.session` on a Map miss** — with a
   per-tab in-flight promise so concurrent events don't race. Removes the clobber and the
   intermittency.
4. **Handle `tabId === -1`.** Don't drop it. Fall back to `details.initiator` / `documentId` and
   attribute to the matching tab, or at minimum surface a "beacons seen but not attributable to this
   tab" note so service-worker-proxied sites (Akamai, Cloudflare Zaraz) stop reading as "not found".
5. **Keep watching the DOM past 4s** — a `MutationObserver` on `<head>`/`<script>` plus a longer
   backstop, and re-read on consent acceptance. Cheap, and restores the fallback exactly when the
   network path is weakest.
6. **Fix the `onResponseStarted` comment** and add `*://www.linkedin.com/px/*` to the filters so the
   cookie-sync chain is visible.

---

## Fixes applied (Findings 1 and 2)

Test-driven: every change below had a failing test written and watched fail first.
Suite went **81 → 109 tests, all passing**.

### Finding 1 — read the `/wa/` signal

| File | Change |
|---|---|
| `src/shared/beacon-parse.js` | `REQUEST_FILTERS` gains `*://px.ads.linkedin.com/wa/*` and `*://px.ads.linkedin.com/attribution_trigger*`. `parseInsightRequest()` gains `kind: 'wa'` and `kind: 'attribution'`. The `/wa` path test is exact (`=== '/wa'` or `startsWith('/wa/')`) so it can't claim `/wallet` or `/watch`. |
| `src/shared/wa-payload.js` *(new)* | `decodeWaPayload()` — bytes → ASCII → base64-decode → gunzip (`DecompressionStream`) → JSON. Returns `null` instead of throwing on anything malformed, so a LinkedIn format change degrades to "no PID from this source". `readWaSignal()` pulls `pids` out as strings. |
| `src/background/service-worker.js` | New `onBeforeRequest` listener with `['requestBody']` scoped to `/wa/` — the only place Chrome exposes the body. The decode promise is stashed by `requestId` and awaited in `onResponseStarted`, so the PIDs (body-only) and "it reached LinkedIn" (response-only) are joined on the same request. Buffer is capped at 50 and cleaned up on error. |
| `src/shared/state.js` | Reducer handles `kind: 'wa'` alongside `'collect'`; `'attribution'` contributes a PID **without** ever setting `fired`; unknown kinds are now dropped instead of silently folded into the base beacon. |
| `src/shared/providers/linkedin.js` | `/attribution_trigger` gets its own timeline label ("Attribution ping") so one page load doesn't show two page views. |

**Deliberately not done:** `/wa/` conversion signals. Only `signalType: "PAGE_VISIT"` has been observed
on the wire — an attempt to capture a `CONVERSION` payload via `lintrk('track', …)` produced no `/wa/`
request. Mapping fields we have never seen would put invented conversion IDs in front of the user.
Conversions still come from `/collect?conversionId=` and the wrapped `lintrk()`. Revisit when a real
conversion payload can be captured.

### Finding 2 — a library download is no longer "firing"

`anyBeaconFired()` no longer counts `library.fired`. New verdict `'loaded'` sits between `blocked`
and `present`: *"Script loaded, nothing sent"*, with a `loaded-no-signal` warning naming the two usual
causes (unaccepted consent gate, missing/incorrect Partner ID). Wired through `render.js` (hero),
`report.js` (copied report) and the toolbar badge (amber `!`).

### Verification

- `npm test` → **109 passed**.
- Full 32-site sweep re-run against the rebuilt extension and diffed against the pre-fix run
  (`diagnostics/compare.mjs`): **hubspot.com `firing/—` → `firing/4629393,64448`**, one site gained
  IDs, 25 unchanged, **0 regressions**.
- Live re-check on hubspot.com (`collect=0, wa=1`): `baseBeacon.pid = 64448,4629393` — sourced purely
  from the decoded POST body. No service-worker errors.
- `'loaded'` verified end-to-end by aborting `/collect` and `/wa/` on datadoghq.com → status `loaded`,
  PID still recovered from the attribution ping.

### Finding 3 — state survives a service-worker restart

The clobber is gone. `src/background/tab-store.js` *(new)* owns per-tab state and, on a memory miss,
hydrates from `chrome.storage.session` instead of falling back to a blank state. Because that read is
async, writes are **serialised per tab** through a promise chain — otherwise two beacons landing in the
same tick would both hydrate the same prior state and the second would overwrite the first.

The store is injected with a storage adapter, so it unit-tests without a browser: creating a second
store over the same fake storage *is* a worker restart. Nine tests cover it, three of which fail if
the old memory-only read is put back (verified by reverting it temporarily).

`service-worker.js` now delegates all state ownership to the store — `apply`/`persist`/`hydrate` and the
raw `tabStates` map are gone.

**Proven in a real browser**, terminating the extension's worker over CDP and waking it with a
non-LinkedIn (GA4) beacon — the exact sequence that used to wipe a tab:

```
[OLD 0.4.3] BEFORE restart : firing ["843739"]
[OLD 0.4.3] AFTER  restart : not-found []          ← Partner ID wiped
[v0.5.0   ] BEFORE restart : firing ["843739"]
[v0.5.0   ] AFTER  restart : firing ["843739"]     ← survives
```

See `diagnostics/restart3.mjs`.

### Finding 2b — /wa/ CLICK signals

LinkedIn's tag source (both `insight.old.min.js` v308 and `insight.beta.min.js` v1000010) defines:

```js
URLS:       { SEND_EVENT: "/wa/" }
EVENT_TYPE: { PAGE_VISIT: "PAGE_VISIT", CLICK: "CLICK" }
```

So `/wa/` carries page views **and clicks**. A click was being recorded as a page-visit beacon. It now
gets `kind: 'wa-click'`, labelled "Click signal" in the timeline: it contributes its Partner IDs but
never satisfies "the page-visit beacon fired" on its own.

**This also settles the conversion question.** `/wa/` has no conversion event type at all — in both tag
generations conversions are still assembled as query params on `/collect`
(`conversion_id → conversionId`, `conversion_value → val`, `order_id → oid`, …). So event-specific
conversions remain entirely on the old path and the existing capture is correct. Nothing is missed,
and there was never a `/wa/` conversion payload to map.

### Still open

Findings 4 (service-worker-proxied sites like singaporeair.com) and 5 (the `onResponseStarted` redirect
comment + a `www.linkedin.com/px/*` filter).
