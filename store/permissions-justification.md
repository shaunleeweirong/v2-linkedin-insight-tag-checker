# Permissions Justification — LinkedIn Insight Tag Checker

For the Chrome Web Store reviewer. The extension is a local-only diagnostic; the
guiding principle is **all processing happens in the browser and nothing is ever
transmitted.**

| Permission | Why it is needed |
| --- | --- |
| `webRequest` | To observe (read-only) whether the Insight Tag's beacons actually fire and complete. We do **not** block or modify requests. This is the only reliable way to tell "installed and firing" from "present but silent." |
| `host_permissions: <all_urls>` | Required for `webRequest` to work at all: Chrome only exposes a request to an extension if it has host access to **both** the request URL **and** the page that initiated it. Since users audit their own (arbitrary) websites, the initiating site can be any origin. The `webRequest` listeners themselves remain filtered to LinkedIn's two tag endpoints (`px.ads.linkedin.com/collect*`, `snap.licdn.com/li.lms-analytics/*`) — no other requests are observed, nothing is blocked or modified, and nothing leaves the device. |
| `storage` | Stores per-tab diagnostic results in `chrome.storage.session` (in-memory, cleared on tab close). No sync, no persistent storage. |
| `activeTab` | Lets the popup read the active tab's URL/host to label the report and query that tab's results when you click the toolbar icon. |
| Content scripts on `<all_urls>` | The tool must be able to audit **any** website the user chooses to check, so the small read-only content scripts (which read the page's existing LinkedIn tag globals and observe `lintrk()` calls) must be allowed to run on arbitrary sites. They read only LinkedIn Insight Tag signals and send nothing off-device. |

## Single purpose

Verify that the LinkedIn Insight Tag and its event-specific conversions are
correctly installed and firing on the current page — nothing else.

## Data handling declarations (for the store form)

- Does **not** sell or share user data.
- Does **not** collect personally identifiable information, health, financial,
  authentication, personal communications, location, or web-history data.
- All data stays on the user's device.
