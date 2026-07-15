# Privacy Policy — LinkedIn Insight Tag Checker

_Last updated: 2026-07-14_

**Summary: this extension collects nothing, sends nothing, and stores nothing off your device.**

## What the extension does

LinkedIn Insight Tag Checker is a developer/marketer diagnostic tool. It inspects
the page you are viewing to determine whether the LinkedIn Insight Tag and its
event-specific conversion beacons are installed and firing. To do this it:

- Observes network requests **to LinkedIn's tag endpoints only**
  (`px.ads.linkedin.com` and `snap.licdn.com`) using the browser's `webRequest`
  API, reading the request URL and whether it completed or errored.
- Reads LinkedIn Insight Tag values already present in the page
  (`_linkedin_partner_id`, `_linkedin_data_partner_ids`) and observes calls the
  page makes to LinkedIn's own `lintrk()` function.

## What data is collected

**None.** The extension does not collect, log, sell, or transmit any personal
information, browsing history, or website content.

## Where data goes

All analysis happens locally in your browser. Results are held only in
`chrome.storage.session` (in-memory session storage) keyed to the current tab,
and are **discarded when the tab is closed or the browser is restarted**. No data
is ever sent to us or to any third party. The extension has no backend server and
makes no network requests of its own.

## Permissions

See `permissions-justification.md`. Every permission exists solely to read local
signals for the diagnostic described above.

## Contact

Questions: shaunleeweirong@gmail.com
