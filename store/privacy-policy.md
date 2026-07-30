# Privacy Policy — Insight Tag Checker for LinkedIn

_Last updated: 2026-07-30_

_A hosted HTML version for the Chrome Web Store listing lives at `docs/privacy-policy.html`. Keep the two in sync._

**Summary: this extension collects nothing, sends nothing, and stores nothing off your device.**

## What the extension does

Insight Tag Checker for LinkedIn is a developer/marketer diagnostic tool. It inspects
the page you are viewing to determine whether the LinkedIn Insight Tag and its
event-specific conversion beacons are installed and firing, and decodes the marketing
tag requests the page sends so you can read their parameters. To do this it:

- Observes network requests **to a fixed list of known marketing-tag endpoints only**,
  using the browser's `webRequest` API, reading the request URL and whether it
  completed or errored. That list is:
  - LinkedIn — `px.ads.linkedin.com`, `snap.licdn.com`
  - Google Analytics 4 — `google-analytics.com`, `analytics.google.com`
  - Google Ads — `googleads.g.doubleclick.net`, `www.googleadservices.com`
  - Meta Pixel — `facebook.com/tr`

  No other requests are observed. General browsing activity is never inspected,
  recorded or transmitted.
- Reads LinkedIn Insight Tag values already present in the page
  (`_linkedin_partner_id`, `_linkedin_data_partner_ids`) and observes calls the
  page makes to LinkedIn's own `lintrk()` function.

Only the LinkedIn Insight Tag is **diagnosed**. The other vendors are decoded and
listed purely as context, and never change the LinkedIn verdict.

## What data is collected

**None.** The extension does not collect, log, sell, or transmit any personal
information, browsing history, or website content.

## Where data goes

All analysis happens locally in your browser. Results — including the per-tab timeline
of decoded tag requests, which is retained across page loads so a conversion that
navigates away is still readable — are held only in `chrome.storage.session`
(in-memory session storage) keyed to the current tab, and are **discarded when the tab
is closed or the browser is restarted**. A tab's timeline can also be cleared at any
time from the side panel. No data is ever sent to us or to any third party. The
extension has no backend server and makes no network requests of its own.

## Permissions

See `permissions-justification.md`. Every permission exists solely to read local
signals for the diagnostic described above.

## Contact

Questions: shaunleeweirong@gmail.com
