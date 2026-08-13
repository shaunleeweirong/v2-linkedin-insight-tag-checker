// Per-tab state ownership, isolated from chrome.* so it can be unit-tested.
//
// The subtle part is MV3's lifecycle. An idle service worker is terminated after
// ~30s and restarted by the next event, with its memory wiped. The previous
// version read only the in-memory map and fell back to a FRESH state on a miss,
// then persisted that — so the first beacon after a restart silently erased a
// Partner ID captured minutes earlier. Any of the 17 tracked vendors could
// trigger it, not just LinkedIn, which is why the panel appeared to flap at
// random on long-lived tabs.
//
// So: a memory miss falls back to session storage, never to a blank state. And
// because that read is async, writes for a tab are serialised through a promise
// chain — otherwise two beacons landing in the same tick would both hydrate the
// same prior state and the second would overwrite the first.

import { initialTabState, reduce } from '../shared/state.js';

const STORAGE_PREFIX = 'tab:';

/**
 * @param {object} opts
 * @param {{get(k):Promise<any>, set(k,v):Promise<void>, remove(k):Promise<void>}} opts.storage
 * @param {() => number} [opts.now]
 * @param {(tabId:number, state:object) => void} [opts.onChange]
 */
export function createTabStore({ storage, now = () => Date.now(), onChange = () => {} }) {
  const memory = new Map();
  const queues = new Map();

  const key = (tabId) => STORAGE_PREFIX + tabId;
  const owned = (tabId) => tabId != null && tabId >= 0;

  // Serialise per tab. Errors are swallowed so one bad event can't poison the
  // chain and stall every later event for that tab.
  function enqueue(tabId, work) {
    const next = (queues.get(tabId) || Promise.resolve()).then(work, work);
    queues.set(
      tabId,
      next.then(
        () => {},
        () => {}
      )
    );
    return next;
  }

  async function load(tabId) {
    if (memory.has(tabId)) return memory.get(tabId);
    let stored = null;
    try {
      stored = await storage.get(key(tabId));
    } catch {
      stored = null;
    }
    const state = stored || initialTabState();
    memory.set(tabId, state);
    return state;
  }

  async function commit(tabId, state) {
    memory.set(tabId, state);
    try {
      await storage.set(key(tabId), state);
    } catch {
      /* session storage is best-effort; memory still has it */
    }
    onChange(tabId, state);
    return state;
  }

  return {
    /** Fold one event into a tab's state. Resolves to the new state, or null if unowned. */
    apply(tabId, event) {
      if (!owned(tabId)) return Promise.resolve(null);
      return enqueue(tabId, async () => commit(tabId, reduce(await load(tabId), event, now())));
    },

    /**
     * Start a fresh page for this tab. Deliberately does NOT hydrate — a new
     * document must not inherit the previous page's verdict. (The reducer still
     * carries the session timeline across; that's its job, not ours.)
     */
    reset(tabId, url = null) {
      if (!owned(tabId)) return Promise.resolve(null);
      return enqueue(tabId, async () =>
        commit(tabId, reduce(await load(tabId), { type: 'navigation', url }, now()))
      );
    },

    /** Explicit user reset — drops the session timeline too. */
    clear(tabId, url = null) {
      if (!owned(tabId)) return Promise.resolve(null);
      return enqueue(tabId, async () => {
        const fresh = initialTabState(url);
        fresh.updatedAt = now();
        return commit(tabId, fresh);
      });
    },

    /** Read a tab's state, hydrating from storage if the worker has restarted. */
    get(tabId) {
      if (!owned(tabId)) return Promise.resolve(initialTabState());
      return enqueue(tabId, () => load(tabId));
    },

    /** Drop everything for a closed tab. */
    remove(tabId) {
      memory.delete(tabId);
      queues.delete(tabId);
      return storage.remove(key(tabId)).catch(() => {});
    }
  };
}
