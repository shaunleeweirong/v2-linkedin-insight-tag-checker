import { describe, it, expect } from 'vitest';
import {
  initialTabState,
  reduce,
  deriveBaseStatus,
  deriveWarnings,
  getPartnerIds,
  TIMELINE_CAP
} from './state.js';
import { parseInsightRequest } from './beacon-parse.js';
import { decodeRequest } from './providers/index.js';

// Convenience: run a list of events through the reducer.
function run(events, start = null) {
  return events.reduce((s, e, i) => reduce(s, e, i + 1), start);
}

const domEvent = (globals) => ({ type: 'dom', globals });
const requestEvent = (url, phase, extra = {}) => ({
  type: 'request',
  req: parseInsightRequest(url),
  decoded: decodeRequest(url),
  phase,
  ...extra
});

describe('deriveBaseStatus trichotomy', () => {
  it('is not-found on an empty state', () => {
    expect(deriveBaseStatus(initialTabState())).toBe('not-found');
  });

  it('is present when the tag is in the DOM but nothing fired', () => {
    const s = run([domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true })]);
    expect(deriveBaseStatus(s)).toBe('present');
  });

  it('is firing when the base beacon completes', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'completed', {
        statusCode: 200
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('firing');
  });

  it('is blocked when the beacon errors (auditor\'s own blocker)', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'error', {
        error: 'net::ERR_BLOCKED_BY_CLIENT'
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('blocked');
  });

  it('prefers firing over blocked when at least one beacon completed', () => {
    const s = run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'error', {
        error: 'net::ERR_BLOCKED_BY_CLIENT'
      }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'completed', {
        statusCode: 200
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('firing');
  });
});

describe('conversions', () => {
  it('captures an image-pixel conversion via the network only', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/collect/?pid=175804&conversionId=107612&fmt=img', 'completed', {
        statusCode: 200
      })
    ]);
    expect(s.conversions).toHaveLength(1);
    expect(s.conversions[0]).toMatchObject({
      conversionId: '107612',
      fired: true,
      viaNetwork: true
    });
  });

  it('merges a lintrk intent with its network beacon into one conversion', () => {
    const s = run([
      { type: 'lintrk', conversionId: 12345 },
      requestEvent('https://px.ads.linkedin.com/collect/?pid=1&conversionId=12345&fmt=gif', 'completed', {
        statusCode: 200
      })
    ]);
    expect(s.conversions).toHaveLength(1);
    expect(s.conversions[0]).toMatchObject({
      conversionId: '12345',
      fired: true,
      viaLintrk: true,
      viaNetwork: true
    });
  });

  it('records a lintrk call that has not yet produced a beacon', () => {
    const s = run([{ type: 'lintrk', conversionId: 999 }]);
    expect(s.conversions[0]).toMatchObject({ conversionId: '999', fired: false, viaLintrk: true });
    expect(s.lintrkCalls).toHaveLength(1);
  });
});

describe('navigation resets the diagnostic but keeps the timeline', () => {
  it('clears prior evidence on navigation', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      { type: 'navigation', url: 'https://new.example.com' }
    ]);
    expect(s.url).toBe('https://new.example.com');
    expect(s.domGlobals).toBeNull();
    expect(s.conversions).toHaveLength(0);
  });

  // The bug this whole feature exists to fix: a conversion that fires on click and
  // then navigates (form submit → thank-you page) used to be erased before the
  // marketer could read its ID.
  it('keeps a conversion ID readable after the click navigates away', () => {
    const s = run([
      { type: 'lintrk', conversionId: 12345678 },
      requestEvent('https://px.ads.linkedin.com/collect/?pid=1&conversionId=12345678&fmt=gif', 'completed', {
        statusCode: 200
      }),
      { type: 'navigation', url: 'https://example.com/thank-you' }
    ]);

    // Per-page diagnostic is correctly reset...
    expect(s.conversions).toHaveLength(0);
    // ...but the evidence survives on the timeline.
    const ids = s.timeline.filter((e) => e.conversionId).map((e) => e.conversionId);
    expect(ids).toContain('12345678');
  });

  it('appends a page marker and increments pageSeq', () => {
    const s = run([
      { type: 'navigation', url: 'https://a.example.com' },
      { type: 'navigation', url: 'https://b.example.com' }
    ]);
    const pages = s.timeline.filter((e) => e.kind === 'page');
    expect(pages.map((p) => p.url)).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(s.pageSeq).toBe(2);
  });

  // The side panel keeps an expanded detail row open across its 1s re-render by
  // matching entries on `id`, so ids must be unique and must not restart on
  // navigation — position can't stand in for identity once the cap starts dropping
  // entries off the front.
  it('gives every timeline entry a unique id that survives navigation', () => {
    const s = run([
      { type: 'lintrk', conversionId: 111 },
      requestEvent('https://px.ads.linkedin.com/collect/?pid=1&fmt=gif', 'completed', {
        statusCode: 200
      }),
      { type: 'navigation', url: 'https://example.com/next' },
      { type: 'lintrk', conversionId: 222 }
    ]);

    const ids = s.timeline.map((e) => e.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(s.timeline.length);
  });

  it('caps the timeline, dropping the oldest entries', () => {
    const events = Array.from({ length: TIMELINE_CAP + 25 }, (_, i) => ({
      type: 'navigation',
      url: `https://example.com/${i}`
    }));
    const s = run(events);
    expect(s.timeline).toHaveLength(TIMELINE_CAP);
    expect(s.timeline[0].url).not.toBe('https://example.com/0');
  });
});

describe('error classification', () => {
  it('does NOT report blocked when navigation cancels the beacon', () => {
    // ERR_ABORTED is what Chrome reports for an in-flight beacon killed by a
    // navigation — normal behaviour, not the user's ad blocker.
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&conversionId=9&fmt=gif', 'error', {
        error: 'net::ERR_ABORTED'
      })
    ]);
    expect(deriveBaseStatus(s)).not.toBe('blocked');
    expect(s.blockedCount).toBe(0);
    expect(deriveWarnings(s).map((w) => w.code)).not.toContain('beacons-blocked');
  });

  it('still reports blocked for a genuine ad-blocker hit', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'error', {
        error: 'net::ERR_BLOCKED_BY_CLIENT'
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('blocked');
  });

  it('treats DNS-level blocking (Pi-hole and friends) as blocked', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'error', {
        error: 'net::ERR_NAME_NOT_RESOLVED'
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('blocked');
  });

  it('records the aborted beacon on the timeline anyway', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/collect/?pid=1&conversionId=5&fmt=gif', 'error', {
        error: 'net::ERR_ABORTED'
      })
    ]);
    expect(s.timeline.find((e) => e.kind === 'request')).toMatchObject({ errorKind: 'aborted' });
  });
});

describe('observed (non-LinkedIn) vendors', () => {
  it('logs them on the timeline without touching the LinkedIn verdict', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://www.facebook.com/tr/?id=999&ev=Lead', 'completed', { statusCode: 200 })
    ]);
    expect(s.timeline.some((e) => e.providerKey === 'METAPIXEL')).toBe(true);
    // A Meta pixel firing must never make the LinkedIn tag look like it fired.
    expect(deriveBaseStatus(s)).toBe('present');
    expect(s.conversions).toHaveLength(0);
  });
});

describe('partner IDs & warnings', () => {
  it('collects PIDs from DOM and beacons, de-duplicated', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'completed', { statusCode: 200 }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=456&conversionId=7&fmt=img', 'completed', {
        statusCode: 200
      })
    ]);
    expect(getPartnerIds(s).sort()).toEqual(['123', '456']);
  });

  it('splits a comma-joined beacon pid instead of treating it as a third PID (Salesforce bug)', () => {
    // LinkedIn batches multiple tags into one beacon: pid=15939,543
    const s = run([
      domEvent({ partnerIds: ['543', '15939'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect?v=2&fmt=js&pid=15939,543', 'completed', {
        statusCode: 200
      })
    ]);
    expect(getPartnerIds(s).sort()).toEqual(['15939', '543']);
  });

  it('treats multiple distinct PIDs as informational, not a warning', () => {
    const s = run([domEvent({ partnerIds: ['123', '456'], hasLintrk: true, scriptPresent: true })]);
    const w = deriveWarnings(s).find((x) => x.code === 'multiple-pids');
    expect(w).toBeTruthy();
    expect(w.level).toBe('info');
  });

  it('names the consent tool when a CMP is present and the tag is not firing', () => {
    const s = run([domEvent({ partnerIds: [], hasLintrk: false, scriptPresent: false, cmp: 'OneTrust' })]);
    const w = deriveWarnings(s).find((x) => x.code === 'consent-gate');
    expect(w).toBeTruthy();
    expect(w.message).toContain('OneTrust');
  });

  it('does not nag about consent once the tag is firing', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true, cmp: 'OneTrust' }),
      requestEvent('https://px.ads.linkedin.com/collect?pid=123&fmt=js', 'completed', { statusCode: 200 })
    ]);
    const codes = deriveWarnings(s).map((w) => w.code);
    expect(codes).not.toContain('consent-gate');
  });

  it('warns present-not-firing when the tag is on the page but silent', () => {
    const s = run([domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true })]);
    const codes = deriveWarnings(s).map((w) => w.code);
    expect(codes).toContain('present-not-firing');
  });

  it('surfaces a blocked-beacons info message rather than a false negative', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      requestEvent('https://px.ads.linkedin.com/collect/?pid=123&fmt=js', 'error', {
        error: 'net::ERR_BLOCKED_BY_CLIENT'
      })
    ]);
    const codes = deriveWarnings(s).map((w) => w.code);
    expect(codes).toContain('beacons-blocked');
  });
});

// ---------------------------------------------------------------------------
// The /wa/ signal endpoint. LinkedIn's current tag POSTs its page-visit signal
// here with the partner IDs in a gzipped body; on fully-migrated sites the
// legacy GET /collect never fires, so this is the ONLY network PID source.
// The service worker decodes the body and hands the ids over as `pid`.
// ---------------------------------------------------------------------------
const waEvent = (pids, phase, extra = {}) => {
  const url = 'https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g';
  return {
    type: 'request',
    req: { ...parseInsightRequest(url), pid: pids.join(',') },
    decoded: decodeRequest(url),
    phase,
    ...extra
  };
};

describe('the /wa/ page-visit signal', () => {
  it('counts as the tag firing', () => {
    const s = run([waEvent(['843739'], 'completed', { statusCode: 204 })]);
    expect(deriveBaseStatus(s)).toBe('firing');
  });

  it('surfaces the partner IDs carried in its body', () => {
    const s = run([waEvent(['64448', '4629393'], 'completed', { statusCode: 204 })]);
    expect(getPartnerIds(s)).toEqual(['64448', '4629393']);
  });

  it('is enough on its own — no /collect and no DOM globals needed', () => {
    const s = run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'completed', {
        statusCode: 200
      }),
      waEvent(['843739'], 'completed', { statusCode: 204 })
    ]);
    expect(deriveBaseStatus(s)).toBe('firing');
    expect(getPartnerIds(s)).toEqual(['843739']);
  });
});

describe('the attribution_trigger ping', () => {
  it('contributes its partner ID', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/attribution_trigger?pid=843739', 'completed', {
        statusCode: 200
      })
    ]);
    expect(getPartnerIds(s)).toEqual(['843739']);
  });

  it('does not by itself mean the page-visit signal fired', () => {
    const s = run([
      requestEvent('https://px.ads.linkedin.com/attribution_trigger?pid=843739', 'completed', {
        statusCode: 200
      })
    ]);
    expect(deriveBaseStatus(s)).not.toBe('firing');
  });
});

// ---------------------------------------------------------------------------
// Downloading insight.min.js proves the SCRIPT loaded — not that the tag sent
// anything. Reporting that as "firing" produced a green tick next to an empty
// Partner ID, which is the contradiction users reported.
// ---------------------------------------------------------------------------
describe('script loaded but no signal sent', () => {
  const libraryOnly = () =>
    run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'completed', {
        statusCode: 200
      })
    ]);

  it('is NOT reported as firing', () => {
    expect(deriveBaseStatus(libraryOnly())).not.toBe('firing');
  });

  it('is reported as loaded', () => {
    expect(deriveBaseStatus(libraryOnly())).toBe('loaded');
  });

  it('still counts as firing once a real signal follows', () => {
    const s = run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'completed', {
        statusCode: 200
      }),
      requestEvent('https://px.ads.linkedin.com/collect?pid=123&fmt=js', 'completed', {
        statusCode: 200
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('firing');
  });

  it('reports blocked rather than loaded when the beacon was blocked', () => {
    const s = run([
      requestEvent('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'completed', {
        statusCode: 200
      }),
      requestEvent('https://px.ads.linkedin.com/collect?pid=123&fmt=js', 'error', {
        error: 'net::ERR_BLOCKED_BY_CLIENT'
      })
    ]);
    expect(deriveBaseStatus(s)).toBe('blocked');
  });

  it('warns that the script loaded but sent nothing', () => {
    const codes = deriveWarnings(libraryOnly()).map((w) => w.code);
    expect(codes).toContain('loaded-no-signal');
  });
});

describe('unrecognised LinkedIn request kinds', () => {
  it('are ignored rather than silently treated as the base beacon', () => {
    const s = run([
      {
        type: 'request',
        req: { kind: 'something-new', pid: '999', isConversion: false },
        decoded: null,
        phase: 'completed',
        statusCode: 200
      }
    ]);
    expect(getPartnerIds(s)).toEqual([]);
    expect(deriveBaseStatus(s)).toBe('not-found');
  });
});

describe('a /wa/ CLICK signal', () => {
  const clickEvent = (pids) => {
    const url = 'https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g';
    return {
      type: 'request',
      req: { ...parseInsightRequest(url), kind: 'wa-click', pid: pids.join(',') },
      decoded: decodeRequest(url),
      phase: 'completed',
      statusCode: 204
    };
  };

  it('contributes its partner IDs', () => {
    expect(getPartnerIds(run([clickEvent(['9171308'])]))).toEqual(['9171308']);
  });

  it('does not on its own mean the page-visit beacon fired', () => {
    expect(deriveBaseStatus(run([clickEvent(['9171308'])]))).not.toBe('firing');
  });

  it('does not mask a real page visit that follows', () => {
    const url = 'https://px.ads.linkedin.com/wa/?medium=fetch&fmt=g';
    const s = run([
      clickEvent(['9171308']),
      { type: 'request', req: { ...parseInsightRequest(url), pid: '9171308' },
        decoded: decodeRequest(url), phase: 'completed', statusCode: 204 }
    ]);
    expect(deriveBaseStatus(s)).toBe('firing');
  });
});
