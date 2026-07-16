# Chrome Web Store Submission Guide — Insight Tag Checker

Everything you need to fill in the Chrome Web Store dashboard, plus which asset
file goes in which slot. Copy-paste ready.

---

## 1. Store listing tab

### Item name / title
**Insight Tag Checker for LinkedIn**

> Trademark note: leading with a plain "LinkedIn …" name can draw extra review.
> The `… for LinkedIn` convention is the accepted pattern for compatible tools
> (e.g. the existing "Insight Tag Checker for LinkedIn"). The manifest currently
> says `LinkedIn Insight Tag Checker` — consider aligning `manifest.json` → `name`
> to match whatever title you submit. The marketing assets already use the
> brand-safe product name **"Insight Tag Checker"**.

### Summary (max 132 characters)
```
Check if your LinkedIn Insight Tag & conversion events are firing — live, on any site, 100% local.
```
(98 characters. This maps to `manifest.json` → `description`, which is currently
different — update the manifest to match if you want them identical.)

### Category
**Developer Tools**

### Language
**English (United States)**

### Detailed description (paste as-is; plain text)
```
Is your LinkedIn Insight Tag actually firing — or just sitting in the page?

Insight Tag Checker inspects any website and tells you, in plain language, whether your LinkedIn Ads tracking really works. No more guessing, no more digging through the Network tab.

WHAT IT CHECKS
✔ Base Insight Tag — confirms the tag loaded AND its request reached LinkedIn, not just that the code is on the page.
✔ Partner IDs — shows every Partner ID (PID) on the page and flags duplicate or multiple tags.
✔ Event conversions — captures each conversion the moment it fires, with its conversion ID, and whether it came from a lintrk() JavaScript call or an image pixel. Click a button or submit a form with the popup open and watch it appear live.
✔ Consent gates — detects OneTrust, Cookiebot, Usercentrics, TrustArc and more, and tells you when a consent banner is holding your tag back until cookies are accepted.

IT TELLS THE TRUTH
Most checkers cry "broken" the moment they see nothing. This one knows the difference between:
• Firing — the tag fired and reached LinkedIn.
• Present, not firing — the tag is on the page but something is stopping it.
• Blocked — your OWN ad or consent blocker blocked the request (not a site problem).
• Not found — no tag at all.
So you never mistake your own ad blocker, or a consent banner, for a broken install.

PRIVATE BY DESIGN
Everything runs locally in your browser. No accounts, no sign-up, and no data ever leaves your device. It only watches requests to LinkedIn's own tag endpoints.

WHO IT'S FOR
Performance marketers, agencies, and web teams QA-ing LinkedIn Ads conversion tracking.

Not affiliated with, or endorsed by, LinkedIn.
```

---

## 2. Graphic assets tab — which file goes where

All files live in `store/assets/`. All are the exact required dimensions.

| Dashboard slot | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128 |
| Screenshot 1 | `screenshot-01-firing.png` | 1280×800 |
| Screenshot 2 | `screenshot-02-conversions.png` | 1280×800 |
| Screenshot 3 | `screenshot-03-consent.png` | 1280×800 |
| Screenshot 4 | `screenshot-04-blocked.png` | 1280×800 |
| Screenshot 5 | `screenshot-05-local.png` | 1280×800 |
| Small promo tile (required) | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee-1400x560.png` | 1400×560 |

To regenerate or tweak them, see `store/assets/README.md`.

---

## 3. Privacy practices tab

### Single purpose (one sentence)
```
Verify that the LinkedIn Insight Tag and its event-specific conversions are correctly installed and firing on the current page.
```

### Permission justifications
Copy from `store/permissions-justification.md`. Summary:
- **webRequest** — read-only observation of whether the Insight Tag's requests fire and complete. No blocking or modification.
- **Host access to `px.ads.linkedin.com` and `snap.licdn.com`** — scopes that observation to LinkedIn's tag endpoints only.
- **Content scripts on all sites** — the tool must audit any website the user chooses; the scripts only read LinkedIn Insight Tag signals and send nothing off-device.
- **storage** — holds per-tab results in session storage (cleared on tab close).
- **activeTab** — lets the popup read the active tab's URL to label the report.
- **Remote code** — none. No remotely hosted code is used.

### Data usage (checkboxes)
- Personally identifiable information: **No**
- Health, financial, authentication, personal communications, location, web history, user activity: **No**
- The three certifications (not selling data, not using for unrelated purposes, not transferring for creditworthiness): **check all three** — they are all true.

### Privacy policy URL (required)
Host `store/privacy-policy.md` at a public URL and paste it here. Easiest option:
enable **GitHub Pages** on the repo (or drop the file in a `/docs` folder) and use
that link, e.g. `https://<user>.github.io/<repo>/privacy-policy`.

---

## 4. Distribution
- **Visibility:** Public (or Unlisted while you test).
- **Regions:** All.
- No paid features / in-app purchases.

## 5. Pre-submit checklist
- [ ] `npm run build` → upload the zipped **`dist/`** folder (not the repo root).
- [ ] `manifest.json` name/description aligned with the title/summary above (optional but tidy).
- [ ] Privacy policy hosted and URL added.
- [ ] All 5 screenshots + small promo tile uploaded.
- [ ] Single purpose + permission justifications filled in.
