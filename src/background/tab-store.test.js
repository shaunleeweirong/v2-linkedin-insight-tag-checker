import { describe, it, expect } from 'vitest';
import { createTabStore } from './tab-store.js';
import { deriveBaseStatus, getPartnerIds } from '../shared/state.js';
import { parseInsightRequest } from '../shared/beacon-parse.js';
import { decodeRequest } from '../shared/providers/index.js';

// A stand-in for chrome.storage.session: survives a "worker restart", because a
// restart only clears the worker's memory, never session storage.
function fakeSessionStorage() {
  const data = new Map();
  return {
    data,
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : undefined;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async remove(key) {
      data.delete(key);
    }
  };
}

const req = (url, phase = 'completed', extra = {}) => ({
  type: 'request',
  req: parseInsightRequest(url),
  decoded: decodeRequest(url),
  phase,
  statusCode: 200,
  ...extra
});

const LIB = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
const COLLECT = 'https://px.ads.linkedin.com/collect?v=2&fmt=js&pid=843739';
const GA4 = 'https://www.google-analytics.com/g/collect?v=2&tid=G-XYZ&en=scroll';

const TAB = 7;

describe('tab store', () => {
  it('folds events into a per-tab state and persists them', async () => {
    const storage = fakeSessionStorage();
    const store = createTabStore({ storage });

    await store.reset(TAB, 'https://endowus.com/');
    await store.apply(TAB, req(COLLECT));

    const state = await store.get(TAB);
    expect(getPartnerIds(state)).toEqual(['843739']);
    expect(await storage.get('tab:' + TAB)).toBeTruthy();
  });

  it('ignores events with no owning tab', async () => {
    const store = createTabStore({ storage: fakeSessionStorage() });
    expect(await store.apply(-1, req(COLLECT))).toBeNull();
  });

  // The regression this store exists to prevent.
  //
  // MV3 terminates an idle worker after ~30s. The next event restarts it with an
  // EMPTY memory map. Reading only that map meant the event folded into a blank
  // state, which was then persisted OVER the good one — so a page whose Partner
  // ID had been captured minutes earlier came back with nothing.
  describe('after the service worker restarts', () => {
    async function primed() {
      const storage = fakeSessionStorage();
      const before = createTabStore({ storage });
      await before.reset(TAB, 'https://endowus.com/');
      await before.apply(TAB, req(LIB));
      await before.apply(TAB, req(COLLECT));
      expect(getPartnerIds(await before.get(TAB))).toEqual(['843739']);
      // A restart clears the worker's memory but not session storage: a brand new
      // store over the same storage is exactly that.
      return { storage, after: createTabStore({ storage }) };
    }

    it('keeps the partner ID when an unrelated beacon wakes the worker', async () => {
      const { after } = await primed();
      await after.apply(TAB, req(GA4)); // a GA4 ping — nothing to do with LinkedIn
      expect(getPartnerIds(await after.get(TAB))).toEqual(['843739']);
    });

    it('keeps the verdict too', async () => {
      const { after } = await primed();
      await after.apply(TAB, req(GA4));
      expect(deriveBaseStatus(await after.get(TAB))).toBe('firing');
    });

    it('does not overwrite stored state with a blank one', async () => {
      const { storage, after } = await primed();
      await after.apply(TAB, req(GA4));
      const persisted = await storage.get('tab:' + TAB);
      expect(persisted.baseBeacon).not.toBeNull();
      expect(persisted.baseBeacon.pid).toBe('843739');
    });
  });

  it('loses no updates when events for one tab overlap', async () => {
    const storage = fakeSessionStorage();
    const store = createTabStore({ storage });
    await store.reset(TAB, 'https://endowus.com/');

    // Fired together, deliberately not awaited in turn — the real listener does
    // exactly this when several beacons land in the same tick.
    await Promise.all([
      store.apply(TAB, req(LIB)),
      store.apply(TAB, req(COLLECT)),
      store.apply(TAB, req(GA4))
    ]);

    const state = await store.get(TAB);
    expect(getPartnerIds(state)).toEqual(['843739']);
    expect(state.library.fired).toBe(true);
    expect(state.timeline.filter((e) => e.kind === 'request')).toHaveLength(3);
  });

  it('starts a navigation from a clean slate rather than hydrating the old page', async () => {
    const storage = fakeSessionStorage();
    const store = createTabStore({ storage });
    await store.reset(TAB, 'https://endowus.com/');
    await store.apply(TAB, req(COLLECT));

    await store.reset(TAB, 'https://endowus.com/other');
    const state = await store.get(TAB);
    expect(state.baseBeacon).toBeNull();
    expect(getPartnerIds(state)).toEqual([]);
  });

  it('forgets a tab when it closes', async () => {
    const storage = fakeSessionStorage();
    const store = createTabStore({ storage });
    await store.reset(TAB, 'https://endowus.com/');
    await store.remove(TAB);
    expect(await storage.get('tab:' + TAB)).toBeUndefined();
  });

  it('reports each new state so the badge can follow along', async () => {
    const seen = [];
    const store = createTabStore({
      storage: fakeSessionStorage(),
      onChange: (tabId, state) => seen.push([tabId, deriveBaseStatus(state)])
    });
    await store.reset(TAB, 'https://endowus.com/');
    await store.apply(TAB, req(COLLECT));
    expect(seen).toEqual([
      [TAB, 'not-found'],
      [TAB, 'firing']
    ]);
  });
});
