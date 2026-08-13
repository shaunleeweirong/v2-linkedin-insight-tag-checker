// Shared rendering for both surfaces.
//
// The popup and the side panel show the same verdict; only the side panel renders
// the full decoded timeline. Each surface passes in whichever elements it has, and
// render() skips the sections that aren't present.

import { deriveBaseStatus, deriveWarnings, getPartnerIds } from '../shared/state.js';

export const STATUS = {
  firing: {
    cls: 'hero--firing',
    title: 'Insight Tag is firing',
    desc: 'The tag sent a page-visit signal to LinkedIn.'
  },
  loaded: {
    cls: 'hero--present',
    title: 'Script loaded, nothing sent',
    desc: 'The Insight Tag script downloaded but never sent a page-visit signal. Usually a consent gate that was not accepted, or a missing/incorrect Partner ID.'
  },
  present: {
    cls: 'hero--present',
    title: 'Tag present, not firing',
    desc: 'The tag is on the page but nothing fired. Check for a consent gate, a malformed snippet, or a Partner ID mismatch.'
  },
  blocked: {
    cls: 'hero--blocked',
    title: 'Blocked in your browser',
    desc: 'LinkedIn requests were blocked — likely by your own ad or consent blocker. Disable it on this page to verify.'
  },
  'not-found': {
    cls: 'hero--not-found',
    title: 'No Insight Tag found',
    desc: 'No LinkedIn Insight Tag was detected on this page.'
  }
};

const PROVIDER_CLASS = {
  LINKEDIN: 'prov--linkedin',
  GA4: 'prov--ga4',
  GOOGLEADS: 'prov--googleads',
  GTM: 'prov--gtm',
  METAPIXEL: 'prov--meta',
  MSUET: 'prov--msuet',
  TIKTOK: 'prov--tiktok',
  PINTEREST: 'prov--pinterest',
  SNAPCHAT: 'prov--snapchat',
  TWITTER: 'prov--twitter',
  REDDIT: 'prov--reddit',
  ADOBEANALYTICS: 'prov--adobe',
  HUBSPOT: 'prov--hubspot',
  MARKETO: 'prov--marketo',
  PARDOT: 'prov--pardot',
  SIXSENSE: 'prov--sixsense',
  DEMANDBASE: 'prov--demandbase'
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function makeTag(text, cls) {
  return el('span', `tag ${cls}`, text);
}

function setHero(els, status) {
  const info = STATUS[status] || STATUS['not-found'];
  els.hero.className = `hero ${info.cls}`;
  els.heroTitle.textContent = info.title;
  els.heroDesc.textContent = info.desc;
}

function renderPartnerIds(els, state) {
  const pids = getPartnerIds(state);
  if (els.pidCount) els.pidCount.textContent = pids.length > 1 ? ` · ${pids.length} found` : '';

  els.pids.replaceChildren();
  if (!pids.length) {
    els.pids.appendChild(el('span', 'muted', 'Not detected yet.'));
    return;
  }
  for (const pid of pids) els.pids.appendChild(el('span', 'chip chip--pid', `PID ${pid}`));
}

function renderConversions(els, state) {
  const list = [...(state.conversions || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const firedCount = list.filter((c) => c.fired).length;
  if (els.convCount) {
    els.convCount.textContent = list.length ? ` · ${firedCount}/${list.length} fired` : '';
  }

  els.conversions.replaceChildren();
  if (!list.length) {
    els.conversions.appendChild(
      el('li', 'empty muted', 'No event-specific conversions captured yet.')
    );
    return;
  }

  for (const c of list) {
    const li = el('li', 'conv');
    const statusClass = c.error ? 'error' : c.fired ? 'fired' : 'pending';
    li.appendChild(el('span', `conv__status conv__status--${statusClass}`));
    li.appendChild(el('span', 'conv__id', `#${c.conversionId}`));

    const meta = el('span', 'conv__meta');
    if (c.viaLintrk) meta.appendChild(makeTag('lintrk', 'tag--lintrk'));
    if (c.viaNetwork && !c.viaLintrk) meta.appendChild(makeTag('pixel', 'tag--pixel'));

    if (c.error) meta.appendChild(makeTag('blocked', 'tag--pending'));
    else if (c.fired) meta.appendChild(makeTag('fired', 'tag--fired'));
    else meta.appendChild(makeTag('pending', 'tag--pending'));

    li.appendChild(meta);
    els.conversions.appendChild(li);
  }
}

function renderWarnings(els, state) {
  const warnings = deriveWarnings(state);
  els.warnings.replaceChildren();
  if (!warnings.length) {
    els.warningsBlock.hidden = true;
    return;
  }
  els.warningsBlock.hidden = false;

  for (const w of warnings) {
    const li = el('li', `warn-item warn-item--${w.level === 'info' ? 'info' : 'warn'}`);
    li.appendChild(el('span', 'warn-item__icon', w.level === 'info' ? 'ℹ' : '!'));
    li.appendChild(el('span', null, w.message));
    els.warnings.appendChild(li);
  }
}

// --- Timeline -------------------------------------------------------------

// The side panel re-polls once a second, and the timeline used to be rebuilt from
// scratch on every tick — which slammed shut whatever detail row the user had just
// opened, about a second after they opened it. Two things keep a row open now: the
// rebuild is skipped while the timeline is unchanged, and the expanded row is
// remembered by id so a genuine rebuild can restore it.
let openEntryId = null;
let timelineSig = null;
let timelineRoot = null;

/**
 * Forget the expanded row and the render cache.
 *
 * The side panel follows the active tab, so on a tab switch the cached signature
 * describes a timeline that is no longer on screen.
 */
export function resetTimelineView() {
  openEntryId = null;
  timelineSig = null;
  timelineRoot = null;
}

/** Stable per-entry key. Falls back for entries stored before ids existed. */
function entryKey(entry, index) {
  return entry.id || `${entry.kind}:${entry.seq ?? 0}:${entry.ts ?? 0}:${index}`;
}

// One detail panel at a time: opening a row collapses the previously open one, and
// clicking the open row again collapses it — the row stays put until then.
function onEntryToggle(ev) {
  const row = ev.currentTarget;
  const key = row.dataset.entryId;

  if (!row.open) {
    if (openEntryId === key) openEntryId = null;
    return;
  }

  openEntryId = key;
  if (!timelineRoot) return;
  for (const other of timelineRoot.querySelectorAll('details.event[open]')) {
    if (other !== row) other.open = false;
  }
}

/** Split the flat timeline into per-page groups, in chronological order. */
export function groupByPage(timeline = []) {
  const groups = [];
  let current = { page: null, entries: [] };

  for (const entry of timeline) {
    if (entry.kind === 'page') {
      groups.push(current);
      current = { page: entry, entries: [] };
    } else {
      current.entries.push(entry);
    }
  }
  groups.push(current);

  return groups.filter((g) => g.page || g.entries.length);
}

function resultTag(entry) {
  if (entry.kind === 'lintrk') return makeTag('intent', 'tag--lintrk');
  // An aborted beacon is normal when a click navigates — never call it "blocked".
  if (entry.errorKind === 'aborted') return makeTag('navigated', 'tag--pending');
  if (entry.errorKind) return makeTag(entry.errorKind, 'tag--error');
  if (entry.phase === 'completed') return makeTag('fired', 'tag--fired');
  return makeTag('pending', 'tag--pending');
}

function paramTable(params) {
  const table = el('table', 'params');
  for (const p of params) {
    const tr = el('tr');
    const name = el('td', 'params__name', p.name);
    if (p.name !== p.key) name.title = p.key;
    tr.appendChild(name);
    tr.appendChild(el('td', 'params__value', p.value));
    table.appendChild(tr);
  }
  return table;
}

function renderEntry(entry, key) {
  // Always lead the detail with the request URL. Without it a row like "Tag script
  // loaded" gives no way to see WHERE it loaded from — and rows with no query params
  // (the LinkedIn tag script) weren't expandable at all.
  const detail = [];
  if (entry.url) {
    detail.push({ key: '__url', name: 'Request URL', group: 'General', value: entry.url });
  }
  if (entry.params && entry.params.length) detail.push(...entry.params);

  const expandable = detail.length > 0;
  const row = el(expandable ? 'details' : 'div', 'event');
  row.dataset.entryId = key;

  const head = el(expandable ? 'summary' : 'div', 'event__head');
  head.appendChild(
    el('span', `prov ${PROVIDER_CLASS[entry.providerKey] || ''}`, entry.providerName || '—')
  );
  head.appendChild(el('span', 'event__label', entry.label || entry.event || 'request'));
  const meta = el('span', 'event__meta');
  meta.appendChild(resultTag(entry));
  head.appendChild(meta);
  row.appendChild(head);

  if (expandable) {
    if (key === openEntryId) row.open = true;
    row.addEventListener('toggle', onEntryToggle);
    row.appendChild(paramTable(detail));
  }
  return row;
}

function renderTimeline(els, state) {
  const timeline = state.timeline || [];
  const total = timeline.filter((e) => e.kind !== 'page').length;
  if (els.timelineCount) els.timelineCount.textContent = total ? ` · ${total}` : '';

  // The timeline is append-only, so its length plus its newest entry describe it
  // completely. Bailing out here is what stops a poll tick from rebuilding — and
  // collapsing — the row the user is reading.
  const last = timeline[timeline.length - 1];
  const sig = `${state.url || ''}|${timeline.length}|${last ? entryKey(last, timeline.length - 1) : ''}`;
  if (els.timeline === timelineRoot && sig === timelineSig) return;
  timelineRoot = els.timeline;
  timelineSig = sig;

  const keys = new Map(timeline.map((entry, i) => [entry, entryKey(entry, i)]));
  const groups = groupByPage(timeline);
  els.timeline.replaceChildren();

  if (!total) {
    els.timeline.appendChild(
      el(
        'p',
        'empty muted',
        'No tag requests captured yet. Reload the page, or click something that fires a conversion.'
      )
    );
    return;
  }

  // Newest page first so live activity stays at the top without scrolling.
  for (const group of groups.reverse()) {
    if (!group.entries.length && !group.page) continue;

    const section = el('section', 'pagegroup');
    if (group.page) {
      const header = el('div', 'pagegroup__head');
      header.appendChild(el('span', 'pagegroup__badge', 'navigated'));
      header.appendChild(el('span', 'pagegroup__url', group.page.url || ''));
      section.appendChild(header);
    }

    for (const entry of [...group.entries].reverse()) {
      section.appendChild(renderEntry(entry, keys.get(entry)));
    }
    els.timeline.appendChild(section);
  }
}

/** Render whichever sections this surface provides. */
export function render(els, state) {
  if (els.hero) setHero(els, deriveBaseStatus(state));
  if (els.pids) renderPartnerIds(els, state);
  if (els.conversions) renderConversions(els, state);
  if (els.warningsBlock && els.warnings) renderWarnings(els, state);
  if (els.timeline) renderTimeline(els, state);
}
