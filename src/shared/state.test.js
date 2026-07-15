import { describe, it, expect } from 'vitest';
import {
  initialTabState,
  reduce,
  deriveBaseStatus,
  deriveWarnings,
  getPartnerIds
} from './state.js';
import { parseInsightRequest } from './beacon-parse.js';

// Convenience: run a list of events through the reducer.
function run(events, start = null) {
  return events.reduce((s, e, i) => reduce(s, e, i + 1), start);
}

const domEvent = (globals) => ({ type: 'dom', globals });
const requestEvent = (url, phase, extra = {}) => ({
  type: 'request',
  req: parseInsightRequest(url),
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

describe('navigation resets state', () => {
  it('clears prior evidence on navigation', () => {
    const s = run([
      domEvent({ partnerIds: ['123'], hasLintrk: true, scriptPresent: true }),
      { type: 'navigation', url: 'https://new.example.com' }
    ]);
    expect(s.url).toBe('https://new.example.com');
    expect(s.domGlobals).toBeNull();
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
