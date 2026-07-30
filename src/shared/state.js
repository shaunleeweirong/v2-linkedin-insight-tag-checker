// Per-tab state shape + a pure reducer for the LinkedIn Insight Tag Checker.
//
// The service worker owns one state object per tab and feeds it three kinds of
// evidence:
//   1. `dom`     — page globals & DOM presence (from the MAIN-world script)
//   2. `request` — network beacons observed via chrome.webRequest (the SPINE)
//   3. `lintrk`  — intent captured from wrapping window.lintrk (enhancement)
//
// Everything here is pure so it can be unit-tested without a browser.

import { classifyError, isBlockingError } from './beacon-parse.js';

// The timeline is session-scoped and append-only, so it needs a ceiling. 300 entries
// is far more than a QA pass produces while staying well inside the session-storage
// quota once several tabs are open.
export const TIMELINE_CAP = 300;

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

    // --- Session-scoped: these SURVIVE navigation (see the navigation branch) ---
    timeline: [], // append-only decoded log, page markers included
    pageSeq: 0, // increments once per committed navigation

    updatedAt: 0
  };
}

/** Append to the timeline, dropping the oldest entries once the cap is reached. */
function appendTimeline(timeline, entry) {
  const next = [...(timeline || []), entry];
  return next.length > TIMELINE_CAP ? next.slice(next.length - TIMELINE_CAP) : next;
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
    // Reset the PER-PAGE diagnostic (so the verdict never goes stale) but carry the
    // session timeline across, marked with a page boundary.
    //
    // This is the fix for the tool's worst failure mode: a conversion that fires on
    // click and then navigates — a form submit to a thank-you page, i.e. most
    // lead-gen conversions — used to be erased before the marketer could read its
    // conversion ID.
    const prev = state || initialTabState();
    const fresh = initialTabState(event.url);
    fresh.pageSeq = (prev.pageSeq || 0) + 1;
    fresh.timeline = appendTimeline(prev.timeline, {
      kind: 'page',
      seq: fresh.pageSeq,
      url: event.url || null,
      ts: now
    });
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
      const { req, phase, statusCode = null, error = null, decoded = null } = event;

      const errorKind = classifyError(error);
      // Only a genuine block counts against the verdict. A navigation-cancelled
      // beacon (ERR_ABORTED) is normal and must never read as "blocked".
      const blocking = isBlockingError(errorKind);
      const blockingError = blocking ? error : null;

      // Every observed vendor request lands on the timeline — LinkedIn or not.
      if (decoded) {
        s.timeline = appendTimeline(s.timeline, {
          kind: 'request',
          seq: s.pageSeq || 0,
          ts: now,
          providerKey: decoded.providerKey,
          providerName: decoded.providerName,
          tier: decoded.tier,
          label: decoded.label,
          account: decoded.account,
          event: decoded.event,
          isConversion: decoded.isConversion,
          conversionId: decoded.conversionId,
          params: decoded.params,
          url: decoded.url || null,
          phase,
          statusCode,
          errorKind
        });
      }

      // Diagnostics are LinkedIn-only: everything below this line stays first-class.
      if (!req) return s;

      if (req.kind === 'library') {
        s.library = mergePhase(s.library, phase, statusCode, blockingError);
        if (blocking) s.blockedCount += 1;
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
          error: blockingError,
          errorKind,
          trigger: 'network',
          ts: now
        });
        if (blocking) s.blockedCount += 1;
      } else {
        const prev = s.baseBeacon || {};
        s.baseBeacon = {
          pid: req.pid || prev.pid || null,
          fmt: req.fmt || prev.fmt || null,
          fired: phase === 'completed' ? true : !!prev.fired,
          error: blockingError != null ? blockingError : prev.error || null,
          errorKind: errorKind != null ? errorKind : prev.errorKind || null,
          statusCode: statusCode != null ? statusCode : prev.statusCode ?? null,
          ts: now
        };
        if (blocking) s.blockedCount += 1;
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
      // Log the intent too: if a click navigates before its beacon is observed, the
      // lintrk() call may be the only surviving evidence the conversion happened.
      s.timeline = appendTimeline(s.timeline, {
        kind: 'lintrk',
        seq: s.pageSeq || 0,
        ts: now,
        providerKey: 'LINKEDIN',
        providerName: 'LinkedIn Insight Tag',
        tier: 'diagnosed',
        label: `lintrk('track') #${conversionId}`,
        conversionId,
        isConversion: true,
        params: []
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
    errorKind: incoming.errorKind ?? null,
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
  if (incoming.errorKind != null) merged.errorKind = incoming.errorKind;
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
