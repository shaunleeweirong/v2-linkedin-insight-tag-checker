import {
  deriveBaseStatus,
  deriveWarnings,
  getPartnerIds,
  isTagPresent
} from '../shared/state.js';

const els = {
  host: document.getElementById('host'),
  hero: document.getElementById('hero'),
  heroTitle: document.getElementById('hero-title'),
  heroDesc: document.getElementById('hero-desc'),
  pids: document.getElementById('pids'),
  pidCount: document.getElementById('pid-count'),
  conversions: document.getElementById('conversions'),
  convCount: document.getElementById('conv-count'),
  warningsBlock: document.getElementById('warnings-block'),
  warnings: document.getElementById('warnings')
};

const STATUS = {
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

function setHero(status) {
  const info = STATUS[status] || STATUS['not-found'];
  els.hero.className = `hero ${info.cls}`;
  els.heroTitle.textContent = info.title;
  els.heroDesc.textContent = info.desc;
}

function renderPartnerIds(state) {
  const pids = getPartnerIds(state);
  els.pidCount.textContent = pids.length > 1 ? ` · ${pids.length} found` : '';
  if (!pids.length) {
    els.pids.innerHTML = '<span class="muted">Not detected yet.</span>';
    return;
  }
  els.pids.innerHTML = '';
  for (const pid of pids) {
    const chip = document.createElement('span');
    chip.className = 'chip chip--pid';
    chip.textContent = `PID ${pid}`;
    els.pids.appendChild(chip);
  }
}

function renderConversions(state) {
  const list = [...state.conversions].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const firedCount = list.filter((c) => c.fired).length;
  els.convCount.textContent = list.length
    ? ` · ${firedCount}/${list.length} fired`
    : '';

  if (!list.length) {
    els.conversions.innerHTML =
      '<li class="empty muted">No event-specific conversions captured yet.</li>';
    return;
  }

  els.conversions.innerHTML = '';
  for (const c of list) {
    const li = document.createElement('li');
    li.className = 'conv';

    const dot = document.createElement('span');
    const statusClass = c.error ? 'error' : c.fired ? 'fired' : 'pending';
    dot.className = `conv__status conv__status--${statusClass}`;
    li.appendChild(dot);

    const id = document.createElement('span');
    id.className = 'conv__id';
    id.textContent = `#${c.conversionId}`;
    li.appendChild(id);

    const meta = document.createElement('span');
    meta.className = 'conv__meta';

    if (c.viaLintrk) meta.appendChild(makeTag('lintrk', 'tag--lintrk'));
    if (c.viaNetwork && !c.viaLintrk) meta.appendChild(makeTag('pixel', 'tag--pixel'));

    if (c.error) {
      meta.appendChild(makeTag('blocked', 'tag--pending'));
    } else if (c.fired) {
      meta.appendChild(makeTag('fired', 'tag--fired'));
    } else {
      meta.appendChild(makeTag('pending', 'tag--pending'));
    }

    li.appendChild(meta);
    els.conversions.appendChild(li);
  }
}

function makeTag(text, cls) {
  const t = document.createElement('span');
  t.className = `tag ${cls}`;
  t.textContent = text;
  return t;
}

function renderWarnings(state) {
  const warnings = deriveWarnings(state);
  if (!warnings.length) {
    els.warningsBlock.hidden = true;
    els.warnings.innerHTML = '';
    return;
  }
  els.warningsBlock.hidden = false;
  els.warnings.innerHTML = '';
  for (const w of warnings) {
    const li = document.createElement('li');
    li.className = `warn-item warn-item--${w.level === 'info' ? 'info' : 'warn'}`;
    const icon = document.createElement('span');
    icon.className = 'warn-item__icon';
    icon.textContent = w.level === 'info' ? 'ℹ' : '!';
    const msg = document.createElement('span');
    msg.textContent = w.message;
    li.append(icon, msg);
    els.warnings.appendChild(li);
  }
}

function render(state) {
  setHero(deriveBaseStatus(state));
  renderPartnerIds(state);
  renderConversions(state);
  renderWarnings(state);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '—';
  }
}

async function refresh(tabId) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getState', tabId });
    if (res && res.state) render(res.state);
  } catch {
    /* worker may be waking; next poll will retry */
  }
}

async function init() {
  const tab = await getActiveTab();
  if (!tab) {
    els.host.textContent = 'No active tab';
    return;
  }
  els.host.textContent = hostFromUrl(tab.url);

  await refresh(tab.id);
  // Poll so live conversions (fired after opening the popup) show up.
  setInterval(() => refresh(tab.id), 1000);
}

init();
