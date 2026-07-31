# Chrome Web Store Submission Guide — Insight Tag Checker

Everything you need to fill in the Chrome Web Store dashboard, plus which asset
file goes in which slot. Copy-paste ready.

---

## 1. Store listing tab

### Item name / title
**Insight Tag Checker for LinkedIn** — already set in `manifest.json` → `name`.

> The `… for LinkedIn` convention is the accepted pattern for compatible tools and
> avoids the extra review that leading with a plain "LinkedIn …" name can draw. The
> marketing assets use the brand-safe product name **"Insight Tag Checker"**.

### Summary (max 132 characters)
```
Check if your LinkedIn Insight Tag & conversions are firing, and decode every tag request — live, on any site, 100% local.
```
(122 characters — already set in `manifest.json` → `description`, so they match.)

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

NOTHING GETS LOST
Conversions that fire on a click and then navigate away — form submits, CTA clicks, the ones that matter most — used to vanish before you could read them. The live panel keeps a timeline of every tag request for the whole tab session, grouped by page, so the conversion ID is still there after the thank-you page loads.

A DECODER, NOT JUST A LIGHT
Open the live side panel to see every tag request decoded into readable parameters — no Network tab, no DevTools required. Alongside the LinkedIn Insight Tag it decodes 16 more:
• Ads — Google Ads, Meta Pixel, Microsoft Advertising UET, TikTok, Pinterest, Snapchat, X (Twitter), Reddit
• Analytics & tag management — Google Analytics 4, Google Tag Manager, Adobe Analytics
• B2B marketing automation & ABM — HubSpot, Marketo, Salesforce Account Engagement (Pardot), 6sense, Demandbase
So you can see the whole tagging picture on one page — including whether a LinkedIn lead actually reached your CRM. Only the LinkedIn tag is diagnosed; the rest is context.

EVIDENCE YOU CAN SEND
One click copies a clean, plain-language report you can paste into an email or a ticket, or exports the full request log as CSV.

IT TELLS THE TRUTH
Most checkers cry "broken" the moment they see nothing. This one knows the difference between:
• Firing — the tag fired and reached LinkedIn.
• Present, not firing — the tag is on the page but something is stopping it.
• Blocked — your OWN ad or consent blocker blocked the request (not a site problem).
• Not found — no tag at all.
So you never mistake your own ad blocker, or a consent banner, for a broken install.

PRIVATE BY DESIGN
Everything runs locally in your browser. No accounts, no sign-up, and no data ever leaves your device. It only watches requests to a fixed list of known marketing tag endpoints — never your general browsing.

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
| Screenshot 3 | `screenshot-03-decoder.png` | 1280×800 |
| Screenshot 4 | `screenshot-04-truth.png` | 1280×800 |
| Screenshot 5 | `screenshot-05-local.png` | 1280×800 |

Upload them in this order — they tell a sequence: *does it fire → nothing gets
lost → everything decoded → it tells the truth → local, and you can send the proof.*
| Small promo tile (required) | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee-1400x560.png` | 1400×560 |

To regenerate or tweak them, see `store/assets/README.md`.

### Additional fields (same tab, all optional)
- **YouTube video:** leave blank.
- **Official URL:** leave blank (verified publishers only).
- **Homepage URL:** your GitHub repo URL (once pushed).
- **Support URL:** your GitHub repo `/issues` URL, or `mailto:shaunleeweirong@gmail.com`.
- **Mature content:** No.

---

## 3. Privacy practices tab

### Single purpose (one sentence)
```
Inspect the marketing tag requests a page sends — diagnosing whether the LinkedIn Insight Tag and its event-specific conversions are correctly installed and firing, and decoding each observed request's parameters for review.
```

### Permission justifications
Copy from `store/permissions-justification.md`. Summary:
- **webRequest** — read-only observation of whether marketing tag requests fire and complete. No blocking or modification.
- **host_permissions `<all_urls>`** — Chrome only dispatches a `webRequest` event when the extension has host access to **both** the request URL and the initiating page, and users audit arbitrary sites. The listeners themselves stay filtered to a fixed vendor endpoint list — see the full table in `permissions-justification.md`.
- **Content scripts on all sites** — the tool must audit any website the user chooses; the scripts only read LinkedIn Insight Tag signals and send nothing off-device.
- **storage** — holds per-tab results and the decoded timeline in session storage (cleared on tab close).
- **activeTab** — lets the popup read the active tab's URL to label the report.
- **sidePanel** — shows the live decoded timeline beside the page; same local data as the popup.
- **Remote code** — none. No remotely hosted code is used.

### Data usage (checkboxes)
- Personally identifiable information: **No**
- Health, financial, authentication, personal communications, location, web history, user activity: **No**
- The three certifications (not selling data, not using for unrelated purposes, not transferring for creditworthiness): **check all three** — they are all true.

### Privacy policy URL (required)
A ready-to-host page already exists at **`docs/privacy-policy.html`**. Push the repo
to GitHub, enable **GitHub Pages** (Settings → Pages → Source: `main` / `/docs`), and
paste this URL:
```
https://<your-github-username>.github.io/<repo-name>/privacy-policy.html
```

---

## 4. Distribution
- **Payments:** Free.
- **Visibility:** Public (or **Unlisted** while you test — only people with the link see it).
- **Distribution regions:** All regions.
- **In-app purchases / paid features:** None.

## 5. Account-level, one-time (required to publish)
- **Verified contact email:** verify `shaunleeweirong@gmail.com` (Account tab → add + confirm).
- **Trader status (EU DSA):** the store forces a choice:
  - **Non-trader** — an individual publishing a free tool, not in a business/professional capacity. No public contact address required.
  - **Trader** — publishing for/through a business or agency, or planning to monetise. Requires a public contact address + phone.
  - For a free personal project, **Non-trader** is the usual pick. Choose **Trader** if this is for your company/agency.

## 6. Pre-submit checklist
- [ ] Upload `insight-tag-checker-0.4.2.zip` (built `dist/`, manifest at the zip root).
- [ ] All 5 screenshots + small promo tile uploaded (regenerated for 0.4.x — they
      show the side panel, decoded timeline and export buttons).
- [ ] Description, summary, category (Developer Tools), language filled in.
- [ ] Single purpose + every permission justification filled in.
- [ ] Data-usage: no categories checked, all 3 certifications checked.
- [ ] Privacy policy hosted and URL added.
- [ ] Contact email verified + trader status chosen.
