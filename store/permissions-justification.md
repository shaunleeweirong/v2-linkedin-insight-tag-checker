# Permissions Justification — Insight Tag Checker for LinkedIn

For the Chrome Web Store reviewer. The extension is a local-only diagnostic; the
guiding principle is **all processing happens in the browser and nothing is ever
transmitted.**

| Permission | Why it is needed |
| --- | --- |
| `webRequest` | To observe (read-only) whether marketing tag requests actually fire and complete. We do **not** block or modify requests. This is the only reliable way to tell "installed and firing" from "present but silent." |
| `host_permissions: <all_urls>` | Required for `webRequest` to work at all: Chrome only exposes a request to an extension if it has host access to **both** the request URL **and** the page that initiated it. Since users audit their own (arbitrary) websites, the initiating site can be any origin. The `webRequest` listeners themselves remain filtered to the fixed vendor endpoint list below — no other requests are observed, nothing is blocked or modified, and nothing leaves the device. |
| `storage` | Stores per-tab diagnostic results and the decoded request timeline in `chrome.storage.session` (in-memory, cleared on tab close). No sync, no persistent storage. |
| `activeTab` | Lets the popup read the active tab's URL/host to label the report and query that tab's results when you click the toolbar icon. |
| `sidePanel` | Shows the live decoded timeline in a side panel next to the page, so a conversion that fires on click can be watched as it happens. Displays the same locally-computed data as the popup. |
| Content scripts on `<all_urls>` | The tool must be able to audit **any** website the user chooses to check, so the small read-only content scripts (which read the page's existing LinkedIn tag globals and observe `lintrk()` calls) must be allowed to run on arbitrary sites. They read only LinkedIn Insight Tag signals and send nothing off-device. |

## Observed endpoints (the complete list)

The `webRequest` listeners are filtered to these patterns and nothing else:

| Vendor | Endpoints |
| --- | --- |
| LinkedIn Insight Tag | `px.ads.linkedin.com/collect*`, `snap.licdn.com/li.lms-analytics/*` |
| Google Analytics 4 | `*.google-analytics.com/g/collect*`, `analytics.google.com/g/collect*` |
| Google Ads | `googleads.g.doubleclick.net/pagead/*conversion*`, `www.googleadservices.com/pagead/conversion*` |
| Meta Pixel | `*.facebook.com/tr*` |

General browsing activity is never inspected. Only the LinkedIn Insight Tag is
*diagnosed*; the other vendors are decoded and displayed as context.

## Single purpose

Inspect the marketing tag requests a page sends — diagnosing whether the LinkedIn
Insight Tag and its event-specific conversions are correctly installed and firing,
and decoding each observed request's parameters for review.

## Data handling declarations (for the store form)

- Does **not** sell or share user data.
- Does **not** collect personally identifiable information, health, financial,
  authentication, personal communications, location, or web-history data.
- All data stays on the user's device.
