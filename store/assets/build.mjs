// Generates the Chrome Web Store marketing images as HTML files, which are then
// rendered to pixel-exact PNGs by a headless browser (see store/assets/README.md).
//
// Style follows a clean "headline + green-check bullets + product mockup" layout.
// The mockup reuses the real extension popup's visual language.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML_DIR = join(dirname(fileURLToPath(import.meta.url)), 'html');
mkdirSync(HTML_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{
  --blue:#0A66C2; --blue-dark:#084b8f;
  --ink:#0f1620; --ink2:#3f4a57; --muted:#6b7684;
  --line:#e6e9ec; --card:#ffffff;
  --ok:#177f4b; --ok-bg:#e7f6ee;
  --warn:#a86400; --warn-bg:#fdf3e3;
  --purple:#5b3fb0; --purple-bg:#efeafc; --blue-bg:#e9f0fb;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.stage{position:relative;overflow:hidden;background:linear-gradient(160deg,#f6f8fa 0%,#eef1f5 100%)}

/* Brand lockup */
.brand{display:flex;align-items:center;gap:13px}
.brand__mark{width:44px;height:44px;border-radius:11px;background:var(--blue);color:#fff;
  display:grid;place-items:center;font-weight:800;font-size:20px;letter-spacing:-1px;flex:none}
.brand__name{font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-.3px}

/* Copy */
.headline{font-size:56px;line-height:1.06;font-weight:800;color:var(--ink);letter-spacing:-1.4px}
.headline .accent{color:var(--blue)}
.sub{margin-top:20px;font-size:22px;line-height:1.4;color:var(--ink2);font-weight:500;max-width:620px}
.bullets{margin-top:38px;display:flex;flex-direction:column;gap:22px}
.bullet{display:flex;align-items:center;gap:15px;font-size:21px;color:var(--ink2);font-weight:500}
.bullet__check{width:30px;height:30px;border-radius:50%;background:var(--ok-bg);flex:none;display:grid;place-items:center}
.bullet__check svg{width:17px;height:17px;stroke:var(--ok);stroke-width:3.2;fill:none;stroke-linecap:round;stroke-linejoin:round}

/* Device / popup mockup */
.device{width:468px;border-radius:16px;background:var(--card);
  box-shadow:0 30px 70px -24px rgba(16,30,54,.34), 0 8px 22px -12px rgba(16,30,54,.22);
  border:1px solid #eceff2;overflow:hidden}
.device__bar{height:38px;background:linear-gradient(180deg,#fbe8d3,#f7ddc2);display:flex;align-items:center;
  justify-content:space-between;padding:0 13px}
.device__bar .b-left{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#7a4a12}
.device__bar .b-left .dot{width:16px;height:16px;border-radius:4px;background:var(--blue);color:#fff;
  font-size:9px;font-weight:800;display:grid;place-items:center}
.device__bar .b-right{display:flex;gap:12px;color:#b07a3c;font-size:14px}

.pw{padding:0 0 2px}
.pw__top{display:flex;align-items:center;gap:11px;padding:13px 15px;border-bottom:1px solid var(--line)}
.pw__top .mk{width:32px;height:32px;border-radius:8px;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;letter-spacing:-1px}
.pw__top h4{font-size:15px;font-weight:700;color:var(--ink)}
.pw__top p{font-size:12px;color:var(--muted);margin-top:1px}

.hero{display:flex;gap:12px;align-items:flex-start;margin:14px 15px;padding:14px;border-radius:12px}
.hero .hdot{width:12px;height:12px;border-radius:50%;margin-top:3px;flex:none}
.hero h3{font-size:16px;font-weight:700;margin-bottom:3px}
.hero p{font-size:13px;line-height:1.35}
.hero--ok{background:var(--ok-bg)} .hero--ok .hdot{background:var(--ok);box-shadow:0 0 0 5px rgba(23,127,75,.16)} .hero--ok h3{color:var(--ok)} .hero--ok p{color:#2c6a49}
.hero--warn{background:var(--warn-bg)} .hero--warn .hdot{background:var(--warn)} .hero--warn h3{color:var(--warn)} .hero--warn p{color:#7a5312}

.blk{padding:2px 15px 15px}
.blk__t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:9px}
.blk__t span{font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted);margin-left:6px}
.chip{display:inline-flex;align-items:center;padding:4px 11px;border-radius:999px;background:#f4f6f8;border:1px solid var(--line);
  font-weight:600;font-size:13px;color:var(--blue-dark);font-variant-numeric:tabular-nums}

.conv{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:7px}
.conv .cdot{width:9px;height:9px;border-radius:50%;background:var(--ok);flex:none}
.conv .cid{font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink);font-size:14px}
.conv .cmeta{margin-left:auto;display:flex;gap:6px}
.tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 7px;border-radius:6px}
.tag--lintrk{background:var(--blue-bg);color:var(--blue-dark)}
.tag--pixel{background:var(--purple-bg);color:var(--purple)}
.tag--fired{background:var(--ok-bg);color:var(--ok)}

.note{display:flex;gap:9px;padding:11px 12px;border-radius:10px;font-size:12.5px;line-height:1.42;margin-bottom:8px}
.note .ni{font-weight:800;flex:none}
.note--info{background:var(--blue-bg);color:#123a63} .note--info .ni{color:var(--blue)}
.note--warn{background:var(--warn-bg);color:#6a4400} .note--warn .ni{color:var(--warn)}

.pw__foot{padding:11px 15px;border-top:1px solid var(--line);background:#f7f9fb;font-size:11px;color:var(--muted)}

/* ---- Side panel: timeline ---- */
.blk__hint{font-size:11.5px;line-height:1.4;color:var(--muted);margin:-4px 0 10px}

.pagemark{display:flex;align-items:center;gap:8px;margin:4px 0 9px;padding-top:9px;border-top:1px dashed var(--line)}
.pagemark .pm__badge{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  padding:3px 7px;border-radius:6px;background:#eef1f4;color:var(--muted);flex:none}
.pagemark .pm__url{font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.ev{border:1px solid var(--line);border-radius:10px;margin-bottom:7px;background:#fff}
.ev__head{display:flex;align-items:center;gap:9px;padding:9px 11px}
.ev--open .ev__head{border-bottom:1px solid var(--line)}
.ev__label{font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev__meta{margin-left:auto;flex:none}

.prov{font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;flex:none;white-space:nowrap}
.prov--li{background:#e9f0fb;color:#084b8f}
.prov--ga4{background:#e6f4ea;color:#1e6b3a}
.prov--meta{background:#e8eefc;color:#2b4a9b}
.prov--gtm{background:#e8f0fe;color:#1a56b8}
.prov--hs{background:#ffefe6;color:#a1441a}
.prov--uet{background:#e4f2f1;color:#10646a}

.params{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
.params td{padding:5px 11px;vertical-align:top;border-bottom:1px solid #f4f6f8;word-break:break-word}
.params tr:last-child td{border-bottom:none}
.params .pn{width:44%;color:var(--muted);font-weight:600}
.params .pv{color:var(--ink);font-variant-numeric:tabular-nums}

/* ---- Action buttons ---- */
.acts{display:flex;gap:8px;padding:2px 15px 15px}
.btn{flex:1;padding:9px 10px;font-family:inherit;font-size:12.5px;font-weight:600;
  border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--ink);text-align:center}
.btn--pri{background:var(--blue);border-color:var(--blue);color:#fff}

/* ---- Vendor strip (logo-free wordmark row) ---- */
.vendors{margin-top:34px;display:flex;flex-wrap:wrap;gap:9px;max-width:600px}
.vendors span{font-size:14px;font-weight:600;color:var(--ink2);background:#fff;border:1px solid var(--line);
  padding:7px 13px;border-radius:999px}
`;

const check = `<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;

function brand() {
  return `<div class="brand"><div class="brand__mark">in</div><div class="brand__name">Insight Tag Checker</div></div>`;
}

function bullets(items) {
  return `<div class="bullets">${items
    .map((t) => `<div class="bullet"><span class="bullet__check">${check}</span><span>${t}</span></div>`)
    .join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Popup mockup
// ---------------------------------------------------------------------------
function popup(o) {
  const host = o.host || 'app.acme.com';
  const hero = o.hero
    ? `<div class="hero hero--${o.hero.kind}"><div class="hdot"></div><div><h3>${o.hero.title}</h3><p>${o.hero.desc}</p></div></div>`
    : '';
  const pidBlock = o.pids
    ? `<div class="blk"><div class="blk__t">Partner ID${o.pidNote ? `<span>${o.pidNote}</span>` : ''}</div>
        ${o.pids.map((p) => `<span class="chip">PID ${p}</span>`).join(' ')}</div>`
    : '';
  const convBlock = o.conversions
    ? `<div class="blk"><div class="blk__t">Event conversions<span>${o.convNote || ''}</span></div>
        ${o.conversions
          .map(
            (c) => `<div class="conv"><span class="cdot"></span><span class="cid">#${c.id}</span>
              <span class="cmeta"><span class="tag tag--${c.trigger}">${c.trigger}</span><span class="tag tag--fired">fired</span></span></div>`
          )
          .join('')}</div>`
    : '';
  const notes = o.notes
    ? `<div class="blk"><div class="blk__t">Notices</div>
        ${o.notes.map((n) => `<div class="note note--${n.level}"><span class="ni">${n.level === 'info' ? 'i' : '!'}</span><span>${n.text}</span></div>`).join('')}</div>`
    : '';
  const foot = o.foot
    ? `<div class="pw__foot">Reads network activity &amp; page data locally. Nothing leaves your browser.</div>`
    : '';
  const acts = o.actions ? actions(o.actions) : '';

  return `<div class="device"${o.width ? ` style="width:${o.width}px"` : ''}>
    <div class="device__bar"><div class="b-left"><span class="dot">in</span>Insight Tag Checker</div><div class="b-right"><span>&#128204;</span><span>&times;</span></div></div>
    <div class="pw">
      <div class="pw__top"><div class="mk">in</div><div><h4>Insight Tag Checker</h4><p>${host}</p></div></div>
      ${hero}${pidBlock}${convBlock}${notes}${acts}${foot}
    </div>
  </div>`;
}

function actions(list) {
  return `<div class="acts">${list
    .map((b, i) => `<span class="btn${i === 0 ? ' btn--pri' : ''}">${b}</span>`)
    .join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Side-panel mockup — the live decoded timeline
// ---------------------------------------------------------------------------
// entries: { prov, provClass, label, state, params?: [[name, value], …], open? }
//          | { page: '<url>' }  for a navigation boundary
function timeline(entries) {
  return entries
    .map((e) => {
      if (e.page) {
        return `<div class="pagemark"><span class="pm__badge">navigated</span><span class="pm__url">${e.page}</span></div>`;
      }
      const rows = (e.params || [])
        .map(([n, v]) => `<tr><td class="pn">${n}</td><td class="pv">${v}</td></tr>`)
        .join('');
      return `<div class="ev${e.open ? ' ev--open' : ''}">
        <div class="ev__head">
          <span class="prov prov--${e.provClass}">${e.prov}</span>
          <span class="ev__label">${e.label}</span>
          <span class="ev__meta"><span class="tag tag--${e.state === 'fired' ? 'fired' : 'pixel'}">${e.state}</span></span>
        </div>
        ${rows ? `<table class="params">${rows}</table>` : ''}
      </div>`;
    })
    .join('');
}

function panel(o) {
  const host = o.host || 'www.acme.com';
  const hero = o.hero
    ? `<div class="hero hero--${o.hero.kind}"><div class="hdot"></div><div><h3>${o.hero.title}</h3><p>${o.hero.desc}</p></div></div>`
    : '';
  return `<div class="device" style="width:${o.width || 430}px">
    <div class="device__bar"><div class="b-left"><span class="dot">in</span>Insight Tag Checker</div><div class="b-right"><span>&#128204;</span><span>&times;</span></div></div>
    <div class="pw">
      <div class="pw__top"><div class="mk">in</div><div><h4>Insight Tag Checker</h4><p>${host}</p></div></div>
      ${hero}
      <div class="blk">
        <div class="blk__t">Timeline<span>${o.count || ''}</span></div>
        ${o.hint ? `<div class="blk__hint">${o.hint}</div>` : ''}
        ${timeline(o.entries || [])}
      </div>
      ${o.actions ? actions(o.actions) : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Page templates
// ---------------------------------------------------------------------------
function shell(w, h, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
    .stage{width:${w}px;height:${h}px}</style></head><body>${inner}</body></html>`;
}

function screenshot({ headline, items, device, extra = '' }) {
  return shell(
    1280,
    800,
    `<div class="stage">
      <div style="position:absolute;top:58px;left:82px">${brand()}</div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;padding:80px 82px 0;gap:56px">
        <div style="flex:1 1 52%">
          <h1 class="headline">${headline}</h1>
          ${items ? bullets(items) : ''}
          ${extra}
        </div>
        <div style="flex:1 1 48%;display:flex;justify-content:flex-end">${device}</div>
      </div>
    </div>`
  );
}

function vendorStrip(names) {
  return `<div class="vendors">${names.map((n) => `<span>${n}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// The five screenshots
// ---------------------------------------------------------------------------
const shots = {
  // 1. The hook: the core verdict, unchanged in spirit.
  '01-firing': screenshot({
    headline: `Is your LinkedIn Insight&nbsp;Tag <span class="accent">actually firing?</span>`,
    items: [
      'Confirms the tag really fired — not just installed',
      'Shows every Partner ID on the page',
      'One click, works on any website'
    ],
    device: popup({
      host: 'www.acme.com',
      hero: { kind: 'ok', title: 'Insight Tag is firing', desc: 'The tag loaded and reached LinkedIn.' },
      pids: ['506388'],
      conversions: [{ id: '8931204', trigger: 'lintrk' }],
      convNote: '· 1/1 fired',
      foot: true
    })
  }),

  // 2. The headline new capability: conversions survive the navigation they cause.
  '02-conversions': screenshot({
    headline: `Conversions that navigate away <span class="accent">no longer vanish.</span>`,
    items: [
      'Form submits and CTA clicks stay readable',
      'A full timeline for the whole tab, split by page',
      'Still readable once the thank-you page loads'
    ],
    device: panel({
      host: 'www.acme.com/thank-you',
      count: '· 6',
      hint: 'Every tag request this tab has made, newest first. Kept across page loads.',
      entries: [
        { prov: 'LinkedIn Insight Tag', provClass: 'li', label: 'Base Insight Tag', state: 'fired' },
        { prov: 'LinkedIn Insight Tag', provClass: 'li', label: 'Tag script loaded', state: 'fired' },
        { page: 'www.acme.com/thank-you' },
        { prov: 'LinkedIn Insight Tag', provClass: 'li', label: 'Conversion #8931204', state: 'fired' },
        { prov: 'LinkedIn Insight Tag', provClass: 'li', label: 'Base Insight Tag', state: 'fired' }
      ],
      actions: ['Copy report', 'Export CSV', 'Clear']
    })
  }),

  // 3. The decoder — and the breadth that comes with it.
  '03-decoder': screenshot({
    headline: `Every tag request, <span class="accent">decoded.</span> No&nbsp;DevTools.`,
    items: [
      'Readable parameters for every request',
      'See what else fires alongside your Insight Tag',
      '17 platforms — ads, analytics, CRM and ABM'
    ],
    extra: vendorStrip([
      'LinkedIn',
      'Google Ads',
      'GA4',
      'Meta',
      'Microsoft UET',
      'TikTok',
      'HubSpot',
      '+10 more'
    ]),
    device: panel({
      host: 'www.acme.com',
      count: '· 12',
      entries: [
        {
          prov: 'LinkedIn Insight Tag',
          provClass: 'li',
          label: 'Conversion #8931204',
          state: 'fired',
          open: true,
          params: [
            ['Partner ID', '506388'],
            ['Conversion ID', '8931204'],
            ['Pixel Format', 'gif'],
            ['Page URL', 'www.acme.com/demo']
          ]
        },
        { prov: 'HubSpot', provClass: 'hs', label: 'HubSpot demo-request', state: 'fired' },
        { prov: 'Google Analytics 4', provClass: 'ga4', label: 'GA4 generate_lead', state: 'fired' },
        { prov: 'Meta Pixel', provClass: 'meta', label: 'Meta Lead', state: 'fired' },
        { prov: 'Google Tag Manager', provClass: 'gtm', label: 'GTM container load', state: 'fired' }
      ]
    })
  }),

  // 4. The original differentiator: it never cries "broken" by mistake.
  '04-truth': screenshot({
    headline: `It never mistakes <span class="accent">your own ad blocker</span> for a broken tag.`,
    items: [
      'Firing — the tag reached LinkedIn',
      'Present, not firing — installed but something stops it',
      'Blocked — your browser blocked it, not the site',
      'Not found — no tag at all'
    ],
    device: popup({
      host: 'www.acme.com',
      hero: {
        kind: 'warn',
        title: 'Tag present, not firing',
        desc: 'The tag is on the page but nothing fired.'
      },
      pids: ['543', '15939'],
      notes: [
        {
          level: 'info',
          text: 'OneTrust consent banner detected. It can block the Insight Tag until marketing cookies are accepted.'
        },
        { level: 'warn', text: 'Check for a consent gate, a malformed snippet, or a Partner ID mismatch.' }
      ]
    })
  }),

  // 5. Privacy + the deliverable a client can actually be sent.
  '05-local': screenshot({
    headline: `All local — and <span class="accent">proof you can send.</span>`,
    items: [
      'Copy a plain-language report for your client',
      'Or export the full request log as CSV',
      'No accounts, no sign-up, nothing leaves your browser'
    ],
    device: popup({
      host: 'www.acme.com',
      hero: { kind: 'ok', title: 'Insight Tag is firing', desc: 'The tag loaded and reached LinkedIn.' },
      pids: ['506388'],
      conversions: [
        { id: '8931204', trigger: 'lintrk' },
        { id: '7745120', trigger: 'pixel' }
      ],
      convNote: '· 2/2 fired',
      actions: ['Copy report', 'Open live panel'],
      foot: true
    })
  })
};

// ---------------------------------------------------------------------------
// Small promo tile (440x280)
// ---------------------------------------------------------------------------
const smallPromo = shell(
  440,
  280,
  `<div class="stage" style="display:flex;flex-direction:column;justify-content:center;padding:34px 36px">
    <div class="brand" style="margin-bottom:20px">
      <div class="brand__mark" style="width:52px;height:52px;border-radius:13px;font-size:24px">in</div>
      <div class="brand__name" style="font-size:26px">Insight Tag Checker</div>
    </div>
    <div style="font-size:27px;font-weight:800;line-height:1.15;letter-spacing:-.6px;color:var(--ink)">
      Is your LinkedIn<br>Insight Tag firing?</div>
    <div style="margin-top:16px;display:inline-flex;align-items:center;gap:9px;align-self:flex-start;
      background:var(--ok-bg);color:var(--ok);font-weight:700;font-size:15px;padding:8px 14px;border-radius:999px">
      <span style="width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(23,127,75,.16)"></span>
      Insight Tag is firing
    </div>
  </div>`
);

// ---------------------------------------------------------------------------
// Marquee (1400x560)
// ---------------------------------------------------------------------------
const marquee = shell(
  1400,
  560,
  `<div class="stage">
    <div style="position:absolute;top:52px;left:76px">${brand()}</div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 76px;gap:60px">
      <div style="flex:1 1 55%">
        <h1 class="headline" style="font-size:52px">Is your LinkedIn Insight&nbsp;Tag <span class="accent">actually firing?</span></h1>
        <p class="sub">Check your base tag, Partner IDs and conversions — then decode every other marketing tag on the page. Instantly, and 100% locally in your browser.</p>
      </div>
      <div style="flex:1 1 45%;display:flex;justify-content:flex-end">${popup({
        host: 'www.acme.com',
        hero: { kind: 'ok', title: 'Insight Tag is firing', desc: 'The tag loaded and reached LinkedIn.' },
        pids: ['506388'],
        conversions: [
          { id: '8931204', trigger: 'lintrk' },
          { id: '7745120', trigger: 'pixel' }
        ],
        convNote: '· 2/2 fired'
      })}</div>
    </div>
  </div>`
);

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
for (const [name, html] of Object.entries(shots)) {
  writeFileSync(join(HTML_DIR, `screenshot-${name}.html`), html);
}
writeFileSync(join(HTML_DIR, 'promo-small-440x280.html'), smallPromo);
writeFileSync(join(HTML_DIR, 'promo-marquee-1400x560.html'), marquee);

console.log('Wrote', Object.keys(shots).length + 2, 'HTML files to', HTML_DIR);
for (const n of Object.keys(shots)) console.log('  screenshot-' + n + '.html  (1280x800)');
console.log('  promo-small-440x280.html  (440x280)');
console.log('  promo-marquee-1400x560.html  (1400x560)');
