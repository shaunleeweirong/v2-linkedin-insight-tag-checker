// Per-tab state shape + a pure reducer for the LinkedIn Insight Tag Checker.
//
// The service worker owns one state object per tab and feeds it three kinds of
// evidence:
//   1. `dom`     — page globals & DOM presence (from the MAIN-world script)
//   2. `request` — network beacons observed via chrome.webRequest (the SPINE)
//   3. `lintrk`  — intent captured from wrapping window.lintrk (enhancement)
//
// Everything here is pure so it can be unit-tested without a browser.

/** @returns {object} a fresh, empty state for a tab. */
export function initialTabState(url = null) {
  return {
    url,
    domGlobals: null, // { partnerIds:[], hasLintrk, scriptPresent, noscriptPixel }
    library: null, // { fired, error, statusCode }
    baseBeacon: null, // { fired, error, statusCode, pid, fmt, ts }
    conversions: [], // merged per conversionId (see normaliseConversion)
    lintrkCalls: [], // raw intent log: { conversionId, ts }
    blockedCount: 0, // beacons that errored (likely the auditor's own blocker)
    updatedAt: 0
  };
}

/**
 * Fold a single event into a tab's state. Returns a new state object.
 *
 * @param {object|null} state  prior state (null → fresh)
 * @param {object} event
 * @param {number} now  timestamp to stamp onto the result
 */
export function reduce(state, event, now = 0) {
  if (event.type === 'navigation') {
    const fresh = initialTabState(event.url);
    fresh.updatedAt = now;
    return fresh;
  }

  const s = { ...(state || initialTabState()) };
  s.conversions = [...(s.conversions || [])];
  s.lintrkCalls = [...(s.lintrkCalls || [])];
  s.updatedAt = now;

  switch (event.type) {
    case 'dom':
      s.domGlobals = event.globals || null;
      return s;

    case 'request': {
      const { req, phase, statusCode = null, error = null } = event;
      if (!req) return s;

      if (req.kind === 'library') {
        s.library = mergePhase(s.library, phase, statusCode, error);
        if (error) s.blockedCount += 1;
        return s;
      }

      // kind === 'collect'
      if (req.isConversion) {
        s.conversions = upsertConversion(s.conversions, {
          conversionId: req.conversionId,
          pid: req.pid,
          fmt: req.fmt,
          phase,
          statusCode,
          error,
          trigger: 'network',
          ts: now
        });
        if (error) s.blockedCount += 1;
      } else {
        const prev = s.baseBeacon || {};
        s.baseBeacon = {
          pid: req.pid || prev.pid || null,
          fmt: req.fmt || prev.fmt || null,
          fired: phase === 'completed' ? true : !!prev.fired,
          error: error != null ? error : prev.error || null,
          statusCode: statusCode != null ? statusCode : prev.statusCode ?? null,
          ts: now
        };
        if (error) s.blockedCount += 1;
      }
      return s;
    }

    case 'lintrk': {
      const conversionId = String(event.conversionId);
      s.lintrkCalls = [...s.lintrkCalls, { conversionId, ts: now }];
      s.conversions = upsertConversion(s.conversions, {
        conversionId,
        trigger: 'lintrk',
        ts: now
      });
      return s;
    }

    default:
      return s;
  }
}

function mergePhase(prev, phase, statusCode, error) {
  const base = prev || { fired: false, error: null, statusCode: null };
  return {
    fired: phase === 'completed' ? true : base.fired,
    error: error != null ? error : base.error,
    statusCode: statusCode != null ? statusCode : base.statusCode
  };
}

function normaliseConversion(incoming) {
  return {
    conversionId: incoming.conversionId,
    pid: incoming.pid || null,
    fmt: incoming.fmt || null,
    fired: incoming.phase === 'completed',
    error: incoming.error ?? null,
    statusCode: incoming.statusCode ?? null,
    viaLintrk: incoming.trigger === 'lintrk',
    viaNetwork: incoming.trigger === 'network',
    ts: incoming.ts ?? 0
  };
}

function upsertConversion(list, incoming) {
  const idx = list.findIndex((c) => c.conversionId === incoming.conversionId);
  if (idx === -1) return [...list, normaliseConversion(incoming)];

  const merged = { ...list[idx] };
  if (incoming.pid) merged.pid = incoming.pid;
  if (incoming.fmt) merged.fmt = incoming.fmt;
  if (incoming.trigger === 'lintrk') merged.viaLintrk = true;
  if (incoming.trigger === 'network') merged.viaNetwork = true;
  if (incoming.phase === 'completed') merged.fired = true;
  if (incoming.error != null) merged.error = incoming.error;
  if (incoming.statusCode != null) merged.statusCode = incoming.statusCode;
  merged.ts = incoming.ts ?? merged.ts;

  return list.map((c, i) => (i === idx ? merged : c));
}

/** True when the page shows any sign of the Insight Tag in its DOM/globals. */
export function isTagPresent(state) {
  const g = state.domGlobals;
  return !!(
    g &&
    ((g.partnerIds && g.partnerIds.length) || g.hasLintrk || g.scriptPresent || g.noscriptPixel)
  );
}

/** Did any Insight Tag beacon complete without error? */
function anyBeaconFired(state) {
  return !!(
    (state.baseBeacon && state.baseBeacon.fired) ||
    (state.library && state.library.fired) ||
    state.conversions.some((c) => c.fired)
  );
}

/** Did any Insight Tag beacon error out (blocked / network failure)? */
function anyBeaconErrored(state) {
  return !!(
    (state.baseBeacon && state.baseBeacon.error) ||
    (state.library && state.library.error) ||
    state.conversions.some((c) => c.error) ||
    state.blockedCount > 0
  );
}

/**
 * The core trichotomy (+ not-found):
 *   'firing'    — a beacon completed → the tag is live
 *   'blocked'   — beacons were attempted but errored → likely the auditor's own
 *                 ad/consent blocker, NOT a broken site
 *   'present'   — tag is in the DOM but nothing fired → genuine install problem
 *   'not-found' — no trace of the Insight Tag at all
 */
export function deriveBaseStatus(state) {
  if (anyBeaconFired(state)) return 'firing';
  if (anyBeaconErrored(state)) return 'blocked';
  if (isTagPresent(state)) return 'present';
  return 'not-found';
}

// A `pid` value can be a comma-joined list (e.g. "15939,543") when a page runs
// several Insight Tags — LinkedIn batches them into one beacon. Split them back
// out so each Partner ID surfaces as its own distinct value.
function splitPids(value) {
  return String(value)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All distinct Partner IDs seen, from both the DOM and the beacons. */
export function getPartnerIds(state) {
  const raw = [];
  const fromDom = (state.domGlobals && state.domGlobals.partnerIds) || [];
  for (const v of fromDom) raw.push(...splitPids(v));
  if (state.baseBeacon && state.baseBeacon.pid) raw.push(...splitPids(state.baseBeacon.pid));
  for (const c of state.conversions) if (c.pid) raw.push(...splitPids(c.pid));
  return [...new Set(raw)];
}

/** Human-facing warnings derived from the state. */
export function deriveWarnings(state) {
  const warnings = [];
  const g = state.domGlobals;
  const rawPids = ((g && g.partnerIds) || []).flatMap(splitPids);
  const uniquePids = [...new Set(rawPids)];
  const status = deriveBaseStatus(state);

  // Multiple DISTINCT tags is normal for larger orgs → informational, not a warning.
  if (uniquePids.length > 1) {
    warnings.push({
      level: 'info',
      code: 'multiple-pids',
      message: `This page runs ${uniquePids.length} Insight Tags (PIDs ${uniquePids.join(', ')}). That's common for larger orgs — just confirm each is intentional.`
    });
  }
  // The SAME id appearing twice is a real misconfiguration → warn.
  if (rawPids.length > uniquePids.length) {
    warnings.push({
      level: 'warn',
      code: 'duplicate-pid',
      message: 'The same Partner ID appears more than once (duplicate Insight Tag).'
    });
  }

  // A consent tool is the most common reason a correctly-installed tag isn't
  // firing, so name it explicitly when we can.
  const cmp = g && g.cmp;
  if (cmp && status !== 'firing') {
    warnings.push({
      level: 'info',
      code: 'consent-gate',
      message: `${cmp} consent banner detected. If marketing/advertising cookies aren't accepted, it can block the Insight Tag from loading — accept cookies and reload to re-check.`
    });
  }

  if (status === 'blocked') {
    warnings.push({
      level: 'info',
      code: 'beacons-blocked',
      message:
        'LinkedIn requests are being blocked in your browser (ad blocker or consent tool). Disable it on this page to verify the tag.'
    });
  }
  if (status === 'present') {
    warnings.push({
      level: 'warn',
      code: 'present-not-firing',
      message:
        'The Insight Tag is on the page but nothing fired. Check for a consent gate, a malformed snippet, or a Partner ID mismatch.'
    });
  }

  if (g && g.partnerIds && g.partnerIds.length && !g.hasLintrk && status !== 'blocked') {
    warnings.push({
      level: 'warn',
      code: 'no-lintrk',
      message: 'Partner ID found but lintrk() is missing — the Insight Tag library may not have loaded.'
    });
  }

  return warnings;
}
