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
    desc: 'The tag loaded and reached LinkedIn.'
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
  TWITTER: 'prov--twitter'
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

function renderEntry(entry) {
  const hasParams = entry.params && entry.params.length;
  const row = el(hasParams ? 'details' : 'div', 'event');

  const head = el(hasParams ? 'summary' : 'div', 'event__head');
  head.appendChild(
    el('span', `prov ${PROVIDER_CLASS[entry.providerKey] || ''}`, entry.providerName || '—')
  );
  head.appendChild(el('span', 'event__label', entry.label || entry.event || 'request'));
  const meta = el('span', 'event__meta');
  meta.appendChild(resultTag(entry));
  head.appendChild(meta);
  row.appendChild(head);

  if (hasParams) row.appendChild(paramTable(entry.params));
  return row;
}

function renderTimeline(els, state) {
  const groups = groupByPage(state.timeline);
  els.timeline.replaceChildren();

  const total = (state.timeline || []).filter((e) => e.kind !== 'page').length;
  if (els.timelineCount) els.timelineCount.textContent = total ? ` · ${total}` : '';

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
      section.appendChild(renderEntry(entry));
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
