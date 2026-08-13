# Diagnostics — evidence for `FINDINGS-firing-without-pid.md`

Captured 2026-08-12 against the shipped **0.4.3** build at
`~/Downloads/insight-tag-checker-0.4.3`. Scripts need `npm i playwright` and a Chromium at
`~/Library/Caches/ms-playwright/chromium-1228/...` (edit `executablePath` if yours differs).

| File | What it does |
|---|---|
| `sweep.mjs` | Loads the real unpacked extension into Chromium, visits every site in `sites.json`, and records LinkedIn requests (incl. POST bodies), page globals, and the extension's own state read from `chrome.storage.session`. → `results.json` |
| `analyze.mjs` | Turns `results.json` into the site matrix + the scriptVersion/`/collect` correlation. → `matrix.txt` |
| `clobber-test.mjs` | Reproduces the service-worker-restart state clobber using the **shipped** reducer. Prints the exact `FIRING` + `«Not detected yet»` panel state. No browser needed. |
| `repro.mjs` | Repeat-visit probe for one site (does `/collect` still fire on visits 2, 3…). |
| `verify.mjs` | Confirms the `/wa/` POST wire format (`postDataBuffer()` → `H4sI…`) and probes tabId attribution from inside the extension's own service worker. |
| `sia.mjs` | Dumps all of `chrome.storage.session` plus main-frame navigations for singaporeair.com (Finding 4). |
| `parse-check.mjs` | Imports the shipped `parseInsightRequest` and runs candidate LinkedIn URL shapes through it — shows which real endpoints it drops. |
| `compare.mjs` | Diffs the extension's verdict per site before vs after the fix (old bundle's reducer vs the repo's). → `before-after.txt` |
| `e2e.mjs` / `e2e2.mjs` | Post-fix end-to-end checks against the freshly built `dist/`: network counts vs what the extension recorded, and the derived status/PIDs. `e2e2` also aborts `/collect` + `/wa/` to exercise the new `loaded` verdict. |
| `results*.json` | Raw 32-site captures. **Git-ignored** (~2MB each) — regenerate with `sweep.mjs`. |
| `before-after.txt` | The per-site before/after verdict table (hubspot fixed, 0 regressions). |
| `restart3.mjs` | Terminates the extension's service worker over CDP, then wakes it with a non-LinkedIn beacon — the exact sequence that used to wipe a tab. Run with `EXT=` pointed at the old build to see the bug, at `dist/` to see it fixed. |

Run order:

```sh
node sweep.mjs sites.json results.json    # ~12 min, opens a visible browser
node analyze.mjs results.json             # matrix
node clobber-test.mjs                     # instant, no browser
```

**Caveat on most browser runs here:** Playwright attaches a debugger to the extension's service
worker, which keeps it alive, so Finding 3 (the restart clobber) cannot occur incidentally during a
sweep. It is proved three other ways instead: `clobber-test.mjs` against the shipped reducer, the
`tab-store.test.js` unit tests, and `restart3.mjs`, which forces a real worker termination over CDP:

```
EXT=~/Downloads/insight-tag-checker-0.4.3 LABEL="OLD" node restart3.mjs   # -> not-found []
LABEL=v0.5.0 node restart3.mjs                                            # -> firing ["843739"]
```
