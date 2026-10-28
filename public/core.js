// Shared basics for every module: element builder, storage, toasts, server calls, platform metadata.
export const qs = new URLSearchParams(location.search);
export const SOLO = qs.get('card');
export const DEMO = qs.get('demo') === '1';
export const NS = DEMO ? 'sr:demo:' : 'sr:';
export const DESKTOP = window.socialDesktop || null; // set by the Windows app

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'svg') el.innerHTML = v; // static icon markup only
    else if (['value', 'checked', 'disabled', 'selected', 'indeterminate', 'muted'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const store = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { toast('Could not save to browser storage: ' + e.message, 'err'); } },
  del(k) { try { localStorage.removeItem(NS + k); } catch { /* ignore */ } },
};
export const bus = 'BroadcastChannel' in window ? new BroadcastChannel('social-radar' + (DEMO ? '-demo' : '')) : { postMessage() {}, addEventListener() {} };
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const nowIso = () => new Date().toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toast(msg, kind = '') {
  const box = $('#toasts');
  if (!box) return;
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'err' ? 7000 : 3800);
  setTimeout(() => t.remove(), kind === 'err' ? 7600 : 4400);
}

export async function api(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(path + (DEMO ? sep + 'demo=1' : ''), {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-App-Key': store.get('passcode', '') || '' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Server HTTP ' + r.status);
  return j;
}

export function ago(t) {
  if (!t) return '';
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd';
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
export const fmtDate = (t) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function num(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
}
export const pct = (x) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(x >= 0.1 ? 1 : 2) + '%');

// ── platforms
export const P = {
  ig: { name: 'Instagram', short: 'IG', color: '#e8609c', caption: 2200, hashtags: 30 },
  fb: { name: 'Facebook', short: 'FB', color: '#5b7cfa', caption: 63206 },
  yt: { name: 'YouTube', short: 'YT', color: '#ff5a4e', caption: 5000 },
  tt: { name: 'TikTok', short: 'TT', color: '#2ad4d9', caption: 2200 },
  li: { name: 'LinkedIn', short: 'in', color: '#38a3e8', caption: 3000 },
};
export const PLATFORMS = Object.keys(P);

export const I = {
  refresh: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  pop: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>',
  dock: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 14H4v6M4 20l8-8M14 4h6v16H8v-2"/></svg>',
  max: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  float: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M8 8h12v12H8z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M16 4H4v12"/></svg>',
  dockIn: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M4 4h16v16H4z"/><path stroke="currentColor" stroke-width="1.9" d="M4 15h16"/></svg>',
  min: '<svg viewBox="0 0 24 24" width="14" height="14"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  spark: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2zM19 15l.9 2.2 2.2.9-2.2.9L19 21.2l-.9-2.2-2.2-.9 2.2-.9z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M10.5 18.5h3"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/></svg>',
  ig: '<svg viewBox="0 0 24 24" width="15" height="15"><defs><radialGradient id="igg" cx="30%" cy="107%" r="150%"><stop offset="0" stop-color="#fdf497"/><stop offset=".05" stop-color="#fdf497"/><stop offset=".45" stop-color="#fd5949"/><stop offset=".6" stop-color="#d6249f"/><stop offset=".9" stop-color="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#igg)"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16" cy="8" r="1" fill="#fff"/></svg>',
  fb: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="12" fill="#1877f2"/><path fill="#fff" d="M13.4 19.5v-6h2l.3-2.4h-2.3V9.6c0-.7.2-1.2 1.2-1.2h1.2V6.3c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8h-2v2.4h2v6z"/></svg>',
  yt: '<svg viewBox="0 0 24 24" width="15" height="15"><rect y="4" width="24" height="16" rx="5" fill="#ff0033"/><path fill="#fff" d="M10 8.6v6.8l5.8-3.4z"/></svg>',
  tt: '<svg viewBox="0 0 24 24" width="15" height="15"><rect width="24" height="24" rx="6" fill="#111"/><path fill="#25f4ee" d="M13.2 5h2.2c.2 1.6 1.2 2.8 2.9 3v2.3c-1.1 0-2.1-.3-2.9-.8v4.9a4.3 4.3 0 1 1-4.3-4.3h.5v2.3a2 2 0 1 0 1.6 2z" transform="translate(-.6 -.4)"/><path fill="#fe2c55" d="M13.2 5h2.2c.2 1.6 1.2 2.8 2.9 3v2.3c-1.1 0-2.1-.3-2.9-.8v4.9a4.3 4.3 0 1 1-4.3-4.3h.5v2.3a2 2 0 1 0 1.6 2z" transform="translate(.6 .4)"/><path fill="#fff" d="M13.2 5h2.2c.2 1.6 1.2 2.8 2.9 3v2.3c-1.1 0-2.1-.3-2.9-.8v4.9a4.3 4.3 0 1 1-4.3-4.3h.5v2.3a2 2 0 1 0 1.6 2z"/></svg>',
  li: '<svg viewBox="0 0 24 24" width="15" height="15"><rect width="24" height="24" rx="4" fill="#0a66c2"/><path fill="#fff" d="M7 9.5h2.6V18H7zM8.3 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11.2 9.5h2.5v1.2c.4-.7 1.3-1.4 2.6-1.4 2.7 0 3.2 1.8 3.2 4.1V18h-2.6v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1V18h-2.7z"/></svg>',
  gpt: '<svg viewBox="0 0 24 24" width="15" height="15"><rect width="24" height="24" rx="6" fill="#10a37f"/><path fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" d="M12 5.2l5.2 3v6l-5.2 3-5.2-3v-6zM12 5.2v6m0 0 5.2 3M12 11.2l-5.2 3"/></svg>',
  posts: '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M7.5 15.5l3-3.5 2.5 2.5 3.5-4.5"/></svg>',
  story: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4 2.2"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 8.5v7M8.5 12h7"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4 5h16v11H9l-5 4z"/></svg>',
};
export const pIcon = (p) => h('span', { class: 'p-ico', svg: I[p], title: P[p] && P[p].name });

// Simple emoji palette used by the composer, story text and comment replies.
export const EMOJI = {
  Smileys: '😀 😁 😂 🤣 😊 😍 🥰 😎 🤩 🥳 😇 🙂 😉 😋 🤔 🤗 😮 😱 🙌 👏 👍 👌 🙏 💪 ✌️ 🤝 👀 💯',
  Hearts: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💗 ✨ ⭐ 🌟 💫 🔥 ⚡ 🎉 🎊 🎁 🏆 🥇',
  Tech: '🎧 🎵 🎶 🔊 📢 📱 💻 🖥️ ⌚ 📺 📷 🎮 🔋 🔌 🛒 🛍️ 💳 🏷️ 📦 🚚',
  Home: '🏠 🛋️ 🍚 🍳 ☕ 🧺 🧹 ⚖️ 🏃 💤 🌙 ☀️ 🌴 🇦🇪',
  Arrows: '👉 👈 👆 👇 ➡️ ⬅️ ⬆️ ⬇️ ✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ 🔗 📍 ⏰ 🆕 🔝',
};
export function emojiPicker(onPick) {
  const pop = h('div', { class: 'emoji-pop', role: 'dialog', 'aria-label': 'Emoji' });
  for (const [cat, list] of Object.entries(EMOJI)) {
    pop.append(h('div', { class: 'emoji-cat' }, cat), h('div', { class: 'emoji-grid' }, list.split(' ').map((e) => h('button', { type: 'button', class: 'emoji', onclick: (ev) => { ev.preventDefault(); onPick(e); } }, e))));
  }
  return pop;
}
export function toggleEmoji(anchor, onPick) {
  const open = document.querySelector('.emoji-pop');
  if (open) { const same = open._anchor === anchor; open.remove(); if (same) return; }
  const pop = emojiPicker(onPick);
  pop._anchor = anchor;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  const below = r.bottom + 6;
  pop.style.top = (below + 300 > window.innerHeight && r.top > 320 ? r.top - 306 : below) + window.scrollY + 'px';
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}
// Insert text at the cursor of an input/textarea and fire input so listeners update.
export function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, t);
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
export const touchDevice = () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
// replaceChildren that skips null/false (so optional parts never show up as the text "null")
export function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; }
