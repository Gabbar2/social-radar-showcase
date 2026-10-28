// Linktree card — your Instagram link-in-bio, shown as the same phone preview Linktree uses, with an editor beside it.
// "Publish" puts the page live on your own address (<your site>/links, served by api/links.js) with click counting, so this card is the only
// place you edit. Linktree itself can't be changed by other apps, so "Import" is just a way to bring your old links across once.
import { h, I, toast, uid, nowIso, copyText, api, fill } from './core.js';

const SOCIALS = [
  ['instagram', 'Instagram', 'https://instagram.com/'], ['facebook', 'Facebook', 'https://facebook.com/'], ['youtube', 'YouTube', 'https://youtube.com/@'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@'], ['linkedin', 'LinkedIn', 'https://linkedin.com/company/'], ['whatsapp', 'WhatsApp', 'https://wa.me/'],
];
const SOC_SVG = {
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M13.6 21v-7.6h2.5l.4-2.9h-2.9V8.7c0-.8.3-1.4 1.5-1.4h1.5V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8.2v2.9h2.5V21"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5.5" width="18" height="13" rx="4"/><path fill="currentColor" stroke="none" d="M10.2 9.3v5.4l4.6-2.7z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.2a3.6 3.6 0 1 1-3.6-3.6M14 4c.3 2.4 1.9 4 4.4 4.2"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.5V16"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19z"/><path d="M9.5 8.8c.3 2.6 2.4 5 5 5.7l1.2-1.2-1.8-1-.8.7c-.9-.4-1.7-1.200-2.100-2.100l.7-.8-1-1.800z" fill="currentColor" stroke="none"/></svg>',
};
const ASTERISK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10.6 2h2.8v6.4l4.5-4.5 2 2-4.5 4.5H22v2.800h-6.600l4.500 4.500-2 2-4.500-4.500V22h-2.800v-6.300l-4.500 4.500-2-2 4.500-4.500H2v-2.800h6.300L3.900 7.9l2-2 4.700 4.600z"/></svg>';
const DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>';
const BGS = [['#b4c3c4', '#2b4345'], ['#e8ecee', '#7f8f8f'], ['#1479b8', '#27c9a2'], ['#f6d365', '#fda085'], ['#a18cd1', '#fbc2eb'], ['#0f2f73', '#2f8fe0'], ['#232526', '#414345'], ['#06433a', '#22b39c'], ['#ffecd2', '#fcb69f']];
const PILLS = ['#ffffff', '#f4f4f2', '#11a8ff', '#5b9dbf', '#e0379f', '#1b1b1b'];
const INKS = ['#ffffff', '#0b9bd9', '#1b1b1b', '#e0379f', '#22b39c'];
const CARDS = ['#4a7f98', '#0f2f73', '#1b1b1b', '#e0379f', '#22b39c'];
const TH = ['#1428a0', '#6e3df0', '#0f9d8a', '#e0379f', '#e0a83a', '#1b1b1b', '#0066cc'];

export const DEFAULT_LT = () => ({
  handle: 'Acme_Studio', name: 'Acme Studio', tagline: 'We are passionate about sound, music, and technology.', avatar: null, hero: null, pill: '#ffffff', ink: '#ffffff', card: '#4a7f98', anim: false, bg: BGS[0], dark: true,
  socials: { instagram: '', facebook: '' },
  links: [
    ['Shop the new collection', 0], ['Nimbus Fold 8 | Pre-order now', 0], ['Nimbus Watch | Pre-order now', 4],
    ['Nimbus Phone 26 | Buy now', 3], ['Aurora Boom 5', 5], ['Aurora Clip', 1], ['Nimbus Buds Pro | Buy now', 2],
  ].map(([title, c]) => ({ id: uid(), title, url: '', thumb: null, color: TH[c], on: true, recent: true, upd: null })),
  at: null,
});

let qrPromise;
function loadQr() {
  return (qrPromise ||= new Promise((res, rej) => {
    if (window.QRCode) return res();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = () => { qrPromise = null; rej(new Error('qr')); };
    document.head.append(s);
  }));
}
function shrink(file, size = 320) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const i = new Image();
    i.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
      const s = Math.max(size / i.width, size / i.height);
      g.drawImage(i, (size - i.width * s) / 2, (size - i.height * s) / 2, i.width * s, i.height * s);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    i.src = url;
  });
}
// wide hero picture: crop to 900x560
function shrinkHero(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const i = new Image();
    i.onload = () => {
      const W = 900, H = 560, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const k = Math.max(W / i.width, H / i.height);
      g.drawImage(i, (W - i.width * k) / 2, (H - i.height * k) / 2, i.width * k, i.height * k);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8));
    };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    i.src = url;
  });
}

// Picture cropper: drag to move, slider to zoom, or "Fit whole picture" so nothing is cut off. Resolves with a JPEG data URL (null = cancelled).
function cropDialog(file, { w, h: H0, title }) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image', 'err'); resolve(null); };
    img.onload = () => {
      const S0 = { fit: false, z: 1, ox: 0, oy: 0 }, DW = Math.min(320, w), DH = Math.round(DW * H0 / w);
      const cv = h('canvas', { class: 'lt-cv', width: DW, height: DH });
      const draw = (c, W, H, k) => {
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        const base = S0.fit ? Math.min(W / img.width, H / img.height) : Math.max(W / img.width, H / img.height), sc = base * S0.z, dw = img.width * sc, dh = img.height * sc;
        const bx = Math.max(0, (dw - W) / 2), by = Math.max(0, (dh - H) / 2);
        const ox = Math.max(-bx, Math.min(bx, S0.ox * k)), oy = Math.max(-by, Math.min(by, S0.oy * k));
        g.drawImage(img, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
      };
      const paint = () => draw(cv, DW, DH, 1);
      let drag = null;
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, ox: S0.ox, oy: S0.oy }; });
      cv.addEventListener('pointermove', (e) => { if (!drag) return; S0.ox = drag.ox + (e.clientX - drag.x); S0.oy = drag.oy + (e.clientY - drag.y); paint(); });
      const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      const zoom = h('input', { type: 'range', min: 1, max: 4, step: 0.02, value: 1, class: 'lt-zoom', oninput: (e) => { S0.z = Number(e.target.value); paint(); } });
      const fit = h('input', { type: 'checkbox', onchange: (e) => { S0.fit = e.target.checked; S0.ox = S0.oy = 0; paint(); } });
      const done = (v) => { URL.revokeObjectURL(url); dlg.close(); dlg.remove(); resolve(v); };
      const dlg = h('dialog', { class: 'lt-crop' },
        h('b', {}, title || 'Crop picture'),
        h('p', { class: 'muted xs' }, 'Drag the picture to move it, use the slider to zoom. Tick “Fit whole picture” to show all of it with white around it.'),
        cv, h('label', { class: 'lt-f' }, 'Zoom', zoom), h('label', { class: 'tog' }, fit, 'Fit whole picture (nothing cut off)'),
        h('div', { class: 'row' }, h('span', { class: 'grow' }),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => done(null) }, 'Cancel'),
          h('button', { class: 'btn primary sm', type: 'button', onclick: () => { const out = document.createElement('canvas'); out.width = w; out.height = H0; draw(out, w, H0, w / DW); done(out.toDataURL('image/jpeg', 0.85)); } }, 'Use this crop')));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      document.body.append(dlg); dlg.showModal(); paint();
    };
    img.src = url;
  });
}
const readable = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#0b1b26'; const n = parseInt(m[1], 16), L = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return L > 0.5 ? '#0b1b26' : '#ffffff'; };
// 'linktr.ee/Acme_Studio', 'https://linktr.ee/Acme_Studio?x=1', '@Acme_Studio' → 'Acme_Studio' (and a bare 'linktr.ee' means nothing was entered)
export const cleanHandle = (v) => String(v || '').trim().replace(/^(https?:\/\/)?(www\.)?linktr\.ee\/?/i, '').replace(/^@/, '').split(/[/?#\s]/)[0];
const publicUrl = (d) => (d.handle ? 'https://linktr.ee/' + d.handle : '');
const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

export function createLinktree(ctx) {
  const { S, save } = ctx;
  const st = { sel: new Set(), tab: 'edit', open: null, qr: false, busy: false, pubBusy: false, counts: null };
  let root = null;
  const D = () => { const d = S.linktree; if (d && !d.v2) { d.v2 = true; d.pill = d.pill || '#11a8ff'; if (d.anim === undefined) d.anim = true; if (d.hero === undefined) d.hero = null; if (d.bg && d.bg[0] === '#8a9a9b') d.bg = BGS[0]; (d.links || []).forEach((l) => { if (l.featured === undefined) l.featured = false; }); save(); }
    if (d && !d.v3) { d.v3 = true; d.bg = BGS[0]; d.pill = '#ffffff'; d.ink = '#0b9bd9'; d.card = '#4a7f98'; d.anim = false; d.dark = false; (d.links || []).forEach((l) => { if (l.recent === undefined) l.recent = true; }); save(); }
    if (d && !d.v4) { d.v4 = true; d.bg = BGS[0]; d.pill = '#ffffff'; d.ink = '#ffffff'; save(); }
    if (d && !d.v6) { d.v6 = true; d.bg = BGS[0]; d.pill = '#ffffff'; d.ink = '#ffffff'; d.card = d.card || '#4a7f98'; d.dark = true; save(); }
    return d; };
  const touch = () => { D().at = nowIso(); save(); schedulePub(); render(); };
  const liveUrl = () => location.origin + '/l';
  const pubLinks = () => D().links.filter((l) => l.on && safeHref(l.url) && (l.title || '').trim());
  // the 5 most recently updated links (newest first) that are switched on, have an address and are not opted out
  const recentIds = () => pubLinks().filter((l) => l.recent !== false).map((l, i) => ({ l, i })).sort((a, b) => (new Date(b.l.upd || 0) - new Date(a.l.upd || 0)) || (a.i - b.i)).slice(0, 5).map((x) => x.l.id);
  const dirty = () => { const d = D(); return !d.pub || !d.pub.at || new Date(d.at || 0) > new Date(d.pub.at); };
  let pubTimer = null;
  function schedulePub() { const bar = root && root.querySelector('.lt-pub'); if (bar) bar.replaceWith(pubBar()); const d = D(); if (!d.pub || d.auto === false) return; clearTimeout(pubTimer); pubTimer = setTimeout(() => publish(true), 5000); }
  async function publish(quiet) {
    const d = D(); clearTimeout(pubTimer);
    if (st.pubBusy) return; st.pubBusy = true; render();
    try {
      const page = { name: d.name, tagline: d.tagline, avatar: d.avatar, hero: d.hero, pill: d.pill, ink: d.ink, card: d.card, anim: d.anim === true, bg: d.bg, dark: d.dark, socials: d.socials, recent: recentIds(), links: pubLinks().map((l) => ({ id: l.id, title: l.title, url: l.url, thumb: l.thumb, color: l.color })) };
      const r = await api('/api/links', { body: { page } });
      d.pub = { at: r.at || nowIso(), url: liveUrl() }; if (d.auto === undefined) d.auto = true; save();
      if (!quiet) toast(r.demo ? 'Demo mode — nothing was published' : `Published ${r.links ?? page.links.length} links — live at ${liveUrl().replace(/^https?:\/\//, '')}`);
      loadCounts();
    } catch (e) { toast(e.message, 'err'); } finally { st.pubBusy = false; render(); }
  }
  async function loadCounts() { try { const r = await api('/api/links?stats=1'); st.counts = r.counts || {}; render(); } catch { /* counts are optional */ } }

  function preview() {
    const d = D();
    const on = d.links.filter((l) => l.on);
    const tile = (l, cls) => (l.thumb ? h('img', { class: cls, src: l.thumb, alt: '' }) : h('span', { class: cls + ' ph', style: { background: l.color } }, (l.title || '?')[0].toUpperCase()));
    const phone = h('div', { class: 'lt-phone' + (d.hero ? ' has-hero' : ''), style: { '--bg0': d.bg[0], '--bg1': d.bg[1], '--pill': d.pill || '#ffffff', '--pilltx': readable(d.pill || '#ffffff'), '--ink': d.ink || '#ffffff', '--card': d.card || '#4a7f98' } },
      d.hero ? h('div', { class: 'lt-hero' }, h('img', { src: d.hero, alt: '' })) : h('div', { class: 'lt-avatar' }, d.avatar ? h('img', { src: d.avatar, alt: '' }) : h('span', {}, (d.name || 'H')[0].toUpperCase())),
      h('div', { class: 'lt-name' }, d.name || 'Your name'),
      d.tagline ? h('div', { class: 'lt-tag' }, d.tagline) : null,
      h('div', { class: 'lt-soc' }, SOCIALS.filter(([k]) => safeHref(d.socials[k]) || (d.socials[k] === '' && (k === 'instagram' || k === 'facebook'))).map(([k, n]) => {
        const href = safeHref(d.socials[k]);
        return h(href ? 'a' : 'span', { class: 'lt-s', svg: SOC_SVG[k], title: n, href, target: href ? '_blank' : null, rel: href ? 'noopener' : null });
      })),
      (() => { const f = recentIds().map((id) => on.find((l) => l.id === id)).filter(Boolean); return f.length ? h('div', { class: 'lt-feat' }, f.map((l) => h('div', { class: 'lt-fc' }, tile(l, 'lt-fi'), h('span', { class: 'lt-ft' }, h('span', {}, l.title || 'Untitled'), h('i', { svg: DOTS }))))) : null; })(),
      h('div', { class: 'lt-links' }, on.map((l, i) => {
        const href = safeHref(l.url);
        return h(href ? 'a' : 'div', { class: 'lt-pill' + (d.anim !== false && i === 0 ? ' anim' : ''), href, target: href ? '_blank' : null, rel: href ? 'noopener' : null },
          tile(l, 'lt-th'), h('span', { class: 'lt-pt' }, l.title || 'Untitled link'), h('span', { class: 'lt-dots', svg: DOTS }));
      })),
      on.length ? null : h('div', { class: 'lt-empty' }, 'No links yet'));
    return h('div', { class: 'lt-stage' }, phone);
  }

  function linkRow(l, i, all) {
    const open = st.open === l.id;
    const set = (k) => (e) => { l[k] = e.target.value; l.upd = nowIso(); D().at = nowIso(); save(); schedulePub(); const pv = root && root.querySelector('.lt-stage'); if (pv) pv.replaceWith(preview()); };
    const move = (dir) => { const j = i + dir; if (j < 0 || j >= all.length) return; [all[i], all[j]] = [all[j], all[i]]; touch(); };
    const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const c = await cropDialog(f, { w: 320, h: 320, title: 'Crop the link picture' }); if (c) { l.thumb = c; l.upd = nowIso(); touch(); } } catch (x) { toast(x.message, 'err'); } } });
    return h('div', { class: 'lt-row' + (l.on ? '' : ' off') + (st.sel.has(l.id) ? ' sel' : '') },
      h('div', { class: 'lt-rowhead' },
        h('input', { type: 'checkbox', class: 'lt-chk', title: 'Select this link', checked: st.sel.has(l.id), onchange: (e) => { e.target.checked ? st.sel.add(l.id) : st.sel.delete(l.id); render(); } }),
        l.thumb ? h('img', { class: 'lt-rth', src: l.thumb, alt: '' }) : h('span', { class: 'lt-rth ph', style: { background: l.color } }, (l.title || '?')[0].toUpperCase()),
        h('button', { class: 'lt-rt', type: 'button', onclick: () => { st.open = open ? null : l.id; render(); } }, l.title || 'Untitled link', h('small', {}, (l.url ? l.url.replace(/^https?:\/\/(www\.)?/, '') : 'No URL yet — won\'t be published') + (st.counts && st.counts[l.id] ? ` · ${st.counts[l.id]} click${st.counts[l.id] === 1 ? '' : 's'}` : ''))),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move up', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move down', onclick: () => move(1) }, '↓'),
        h('label', { class: 'lt-sw', title: l.on ? 'Visible — click to hide' : 'Hidden — click to show' }, h('input', { type: 'checkbox', checked: l.on, onchange: (e) => { l.on = e.target.checked; l.upd = nowIso(); touch(); } }), h('span'))),
      open ? h('div', { class: 'lt-edit' },
        h('input', { class: 'inp', placeholder: 'Title, e.g. Nimbus Phone 26 | Buy now', value: l.title, oninput: set('title') }),
        h('input', { class: 'inp', placeholder: 'https://…', value: l.url, oninput: set('url'), inputmode: 'url' }),
        h('label', { class: 'tog', title: 'The live page shows your 5 most recently updated links as picture cards at the top' }, h('input', { type: 'checkbox', checked: l.recent !== false, onchange: (e) => { l.recent = e.target.checked; touch(); } }), 'Can appear in the Recent updates row (needs a picture to look good)'),
        h('div', { class: 'row' }, pick,
          h('button', { class: 'btn sm', type: 'button', onclick: () => pick.click() }, l.thumb ? 'Change picture' : 'Add picture'),
          l.thumb ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { l.thumb = null; touch(); } }, 'Remove picture') : null,
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => copyText(l.url || '').then(() => toast('Link copied')) }, 'Copy URL'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn ghost sm danger', type: 'button', onclick: () => { D().links = D().links.filter((x) => x.id !== l.id); st.open = null; touch(); } }, 'Delete'))) : null);
  }

  async function doImport() {
    const d = D();
    const hd = cleanHandle(d.handle) || 'Acme_Studio'; // an empty or broken saved name falls back to the Acme Studio page
    if (hd !== d.handle) { d.handle = hd; save(); }
    st.busy = true; render();
    try {
      const r = await api('/api/linktree?handle=' + encodeURIComponent(hd));
      if (!r.imported || !r.links.length) { toast(r.imported ? 'No links found on that page' : 'Nothing to import in demo mode', 'err'); return; }
      if (!confirm(`Replace the ${d.links.length} links here with the ${r.links.length} found on linktr.ee/${r.handle}?`)) return;
      d.handle = r.handle; if (r.name) d.name = r.name; if (r.tagline) d.tagline = r.tagline;
      for (const [k, v] of Object.entries(r.socials || {})) d.socials[k] = v;
      const old = new Map(d.links.map((l) => [l.url, l]));
      d.links = r.links.map((l, i) => ({ id: uid(), title: l.title, url: l.url, thumb: (old.get(l.url) || {}).thumb || null, color: TH[i % TH.length], on: true }));
      d.at = nowIso(); save(); schedulePub(); toast('Imported ' + d.links.length + ' links');
    } catch (e) { toast(e.message, 'err'); } finally { st.busy = false; render(); }
  }

  function addFromPosts() {
    const posts = Object.values(S.stats || {}).flatMap((s) => (s && s.posts) || []).filter((p) => p.url && p.platform === 'ig').slice(0, 12);
    if (!posts.length) return toast('No Instagram posts loaded yet — connect Instagram and refresh', 'err');
    st.picker = !st.picker; render();
  }

  function pubBar() {
    const d = D(), missing = d.links.filter((l) => l.on && !(safeHref(l.url) && (l.title || '').trim())).length;
    const state = !d.pub ? 'Not published yet' : (dirty() ? 'Unpublished changes' : 'Live');
    return h('div', { class: 'lt-pub' + (!d.pub ? ' new' : dirty() ? ' dirty' : ' live') },
      h('div', { class: 'lt-pubtxt' }, h('b', {}, state), h('small', {}, d.pub ? liveUrl().replace(/^https?:\/\//, '') + (missing ? ` · ${missing} link${missing === 1 ? ' has' : 's have'} no URL and won't show` : '') : (missing ? `${missing} link${missing === 1 ? ' has' : 's have'} no URL and won't show` : 'Your own link-in-bio page, with click counts'))),
      d.pub ? h('label', { class: 'tog', title: 'Publish a few seconds after each change' }, h('input', { type: 'checkbox', checked: d.auto !== false, onchange: (e) => { d.auto = e.target.checked; save(); if (d.auto && dirty()) schedulePub(); } }), 'Auto-publish') : null,
      h('button', { class: 'btn sm primary', type: 'button', disabled: st.pubBusy, onclick: () => publish(false) }, st.pubBusy ? 'Publishing…' : d.pub ? 'Publish now' : 'Publish page'));
  }

  function build() {
    const d = new Proxy({}, { get: (_, k) => D()[k], set: (_, k, v) => { D()[k] = v; return true; } });
    const handleIn = h('input', { class: 'inp', placeholder: 'your-linktree-name', value: d.handle, oninput: (e) => { d.handle = cleanHandle(e.target.value); d.at = nowIso(); save(); schedulePub(); } });
    const heroIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const c = await cropDialog(f, { w: 900, h: 560, title: 'Crop the hero image' }); if (c) { d.hero = c; touch(); } } catch (x) { toast(x.message, 'err'); } } });
    const swatches = (label, list, key, def) => h('div', { class: 'lt-f' }, label, h('div', { class: 'lt-bgs' }, list.map((c) => h('button', { type: 'button', class: 'lt-bg' + (String(d[key] || def).toLowerCase() === c ? ' on' : ''), title: c, style: { background: c }, onclick: () => { d[key] = c; touch(); } })),
      h('input', { type: 'color', class: 'lt-color', value: d[key] || def, oninput: (e) => { d[key] = e.target.value; d.at = nowIso(); save(); schedulePub(); const pv = root.querySelector('.lt-stage'); if (pv) pv.replaceWith(preview()); } })));
    const avatarIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const c = await cropDialog(f, { w: 220, h: 220, title: 'Crop the logo' }); if (c) { d.avatar = c; touch(); } } catch (x) { toast(x.message, 'err'); } } });
    const url = d.pub ? liveUrl() : publicUrl(d); // your own page once published, otherwise the old Linktree address
    const posts = st.picker ? Object.values(S.stats || {}).flatMap((s) => (s && s.posts) || []).filter((p) => p.url && p.platform === 'ig').slice(0, 12) : [];
    const edit = h('div', { class: 'lt-editor' },
      h('div', { class: 'lt-bar' },
        h('button', { class: 'btn sm primary', type: 'button', onclick: () => { const l = { id: uid(), title: '', url: '', thumb: null, color: TH[d.links.length % TH.length], on: true, recent: true, upd: nowIso() }; d.links.unshift(l); st.open = l.id; touch(); } }, '+ Add link'),
        h('button', { class: 'btn sm', type: 'button', onclick: addFromPosts, title: 'Turn one of your recent Instagram posts/Reels into a link' }, 'Add from my posts'),
        h('button', { class: 'btn sm', type: 'button', disabled: st.busy, onclick: doImport }, st.busy ? 'Importing…' : 'Import from my Linktree')),
      st.picker ? h('div', { class: 'lt-picker' }, posts.map((p) => h('button', { class: 'lt-pp', type: 'button', title: (p.text || '').slice(0, 80), style: p.thumb ? { 'background-image': `url("${p.thumb}")` } : {}, onclick: () => { const l = { id: uid(), title: (p.text || 'Instagram ' + p.type).split('\n')[0].slice(0, 60), url: p.url, thumb: null, color: TH[d.links.length % TH.length], on: true, recent: true, upd: nowIso() }; d.links.unshift(l); st.open = l.id; st.picker = false; touch(); toast('Added — give it a title'); } }, h('span', {}, p.type)))) : null,
      pubBar(),
      (() => { const n = d.links.filter((l) => st.sel.has(l.id)).length; const all = d.links.length && n === d.links.length;
        const act = (fn) => () => { d.links.filter((l) => st.sel.has(l.id)).forEach(fn); touch(); };
        return h('div', { class: 'lt-bulk' },
          h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: !!all, onchange: (e) => { st.sel = e.target.checked ? new Set(d.links.map((l) => l.id)) : new Set(); render(); } }), n ? `${n} selected` : 'Select all'),
          n ? [
            h('button', { class: 'btn sm', type: 'button', title: 'Show these in the scrollable picture row at the top of your page', onclick: act((l) => { l.recent = true; l.upd = nowIso(); }) }, 'Highlight'),
            h('button', { class: 'btn sm', type: 'button', onclick: act((l) => { l.recent = false; }) }, 'Remove highlight'),
            h('button', { class: 'btn sm', type: 'button', onclick: act((l) => { l.on = false; }) }, 'Hide'),
            h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (!confirm(`Delete ${n} link${n === 1 ? '' : 's'}? This can't be undone.`)) return; d.links = d.links.filter((l) => !st.sel.has(l.id)); st.sel = new Set(); touch(); } }, 'Delete'),
          ] : null);
      })(),
      h('div', { class: 'lt-list' }, d.links.map((l, i) => linkRow(l, i, d.links)), d.links.length ? null : h('p', { class: 'muted' }, 'No links yet — add one or import from your Linktree.')),
      h('details', { class: 'lt-sec' }, h('summary', {}, 'Profile, social icons & background'),
        h('label', { class: 'lt-f' }, 'Old Linktree name (only used by Import)', handleIn),
        h('label', { class: 'lt-f' }, 'Display name', h('input', { class: 'inp', value: d.name, oninput: (e) => { d.name = e.target.value; d.at = nowIso(); save(); schedulePub(); const pv = root.querySelector('.lt-stage'); pv.replaceWith(preview()); } })),
        h('label', { class: 'lt-f' }, 'Bio', h('input', { class: 'inp', value: d.tagline, oninput: (e) => { d.tagline = e.target.value; d.at = nowIso(); save(); schedulePub(); const pv = root.querySelector('.lt-stage'); pv.replaceWith(preview()); } })),
        h('div', { class: 'row' }, heroIn, h('button', { class: 'btn sm', type: 'button', onclick: () => heroIn.click() }, d.hero ? 'Change hero image' : 'Upload hero image'), d.hero ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { d.hero = null; touch(); } }, 'Remove hero') : null),
        swatches('Button colour', PILLS, 'pill', '#ffffff'),
        swatches('Name, bio & icon colour', INKS, 'ink', '#ffffff'),
        swatches('Picture-card strip colour', CARDS, 'card', '#4a7f98'),
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: d.anim === true, onchange: (e) => { d.anim = e.target.checked; touch(); } }), 'Animation (gently draws the eye to the top button)'),
        h('div', { class: 'row' }, avatarIn, h('button', { class: 'btn sm', type: 'button', onclick: () => avatarIn.click() }, d.avatar ? 'Change logo' : 'Upload logo (used when there is no hero image)'), d.avatar ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { d.avatar = null; touch(); } }, 'Remove') : null),
        SOCIALS.map(([k, n, ph]) => h('label', { class: 'lt-f' }, n, h('input', { class: 'inp', placeholder: ph + '…', value: d.socials[k] || '', inputmode: 'url', oninput: (e) => { d.socials[k] = e.target.value.trim(); d.at = nowIso(); save(); schedulePub(); } }))),
        h('div', { class: 'lt-f' }, 'Background', h('div', { class: 'lt-bgs' }, BGS.map((b) => h('button', { type: 'button', class: 'lt-bg' + (b === d.bg || (b[0] === d.bg[0] && b[1] === d.bg[1]) ? ' on' : ''), style: { background: `linear-gradient(180deg, ${b[0]}, ${b[1]})` }, onclick: () => { d.bg = b; d.dark = !['#ffecd2', '#f6d365', '#a18cd1'].includes(b[0]); touch(); } })))),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { if (confirm('Reset this card to the starter layout?')) { S.linktree = Object.assign(DEFAULT_LT(), { handle: d.handle, at: nowIso() }); save(); st.open = null; render(); } } }, 'Reset layout')),
      h('div', { class: 'lt-actions' },
        h('button', { class: 'btn sm', type: 'button', disabled: !url, onclick: () => copyText(url).then(() => toast('Link copied — paste it in your Instagram bio')) }, d.pub ? 'Copy my page link' : 'Copy my Linktree link'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => copyText(d.links.filter((l) => l.on).map((l) => `${l.title}\n${l.url}`).join('\n\n')).then(() => toast('All links copied')) }, 'Copy all links'),
        h('button', { class: 'btn sm', type: 'button', disabled: !url, onclick: async () => { st.qr = !st.qr; render(); if (st.qr) { try { await loadQr(); const box = root.querySelector('.lt-qr'); if (box) { box.innerHTML = ''; new window.QRCode(box, { text: url, width: 150, height: 150, correctLevel: window.QRCode.CorrectLevel.M }); } } catch { toast('Could not load the QR library', 'err'); } } } }, 'QR code'),
        d.pub ? null : h('a', { class: 'btn sm', href: 'https://linktr.ee/admin', target: '_blank', rel: 'noopener' }, 'Open Linktree admin ↗'),
        url ? h('a', { class: 'btn sm ghost', href: url, target: '_blank', rel: 'noopener' }, d.pub ? 'View my live page ↗' : 'View Linktree page ↗') : null),
      st.qr && url ? h('div', { class: 'lt-qr' }) : null,
      h('p', { class: 'muted lt-note' }, d.pub ? 'This card is the only place to edit. Your live page also shows the 5 most recently updated links as picture cards at the top (add a picture to each). Links with no URL, and links switched off, are left off. Put the page link in your Instagram bio instead of the Linktree one.' : 'Press Publish to put this page live on your own address and use it in your Instagram bio instead of Linktree. Linktree can\'t be changed by other apps, so Import only copies your old links across once.'));
    return edit;
  }

  function render() {
    const body = document.querySelector('.card-linktree .card-body, .solo .card-linktree .card-body');
    if (!body) return;
    if (!root || root.parentNode !== body) { root = h('div', { class: 'lt-wrap' }); }
    fill(root, preview(), build());
    fill(body, root);
    if (D().pub && st.counts === null) { st.counts = {}; loadCounts(); }
  }
  return { render };
}
