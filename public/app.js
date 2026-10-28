import { h, $, store, bus, uid, nowIso, toast, api, ago, fmtDate, num, pct, P, PLATFORMS, I, pIcon, SOLO, DEMO, DESKTOP, toggleEmoji, insertAtCursor, touchDevice, copyText , fill } from './core.js';
import { createGoogle } from './google.js';
import { createSync } from './sync.js';
import { createPlatforms, demoStats } from './platforms.js';
import { createComposer, DEFAULT_DRAFT } from './composer.js';
import { createChatGPT } from './chatgpt.js';
import { createStories } from './stories.js';
import { createInbox } from './inbox.js';
import { createLinktree, DEFAULT_LT } from './linktree.js';
import { createClips } from './clips.js';
import { createBrief } from './brief.js';

// ───────────────────────── whose data is showing (each Google account has its own space)
let ACCT = (store.get('lastGoogle', null) || {}).email || null;
const akey = (k, a = ACCT) => (a ? `u:${a}:` : 'guest:') + k;
const ustore = { get: (k, d) => store.get(akey(k), d), set: (k, v) => store.set(akey(k), v) };
const USER_KEYS = ['accounts', 'settings', 'posts', 'stories', 'syncMeta', 'on', 'ttSeen', 'linktree'];
const DEFAULT_SETTINGS = { brandVoice: '', defaultHashtags: '', autoDelete: true, autoSend: true, gptChatUrl: '', knownProducts: [] };
const DEFAULT_ON = { ig: true, fb: true, yt: false, tt: false, li: false };

const S = {
  config: { graphVersion: 'v23.0' },
  settings: { ...DEFAULT_SETTINGS, ...ustore.get('settings', {}) },
  accounts: ustore.get('accounts', {}),
  on: { ...DEFAULT_ON, ...ustore.get('on', {}) },
  draft: Object.assign(DEFAULT_DRAFT(), store.get('draft', {}), { media: [] }),
  posts: ustore.get('posts', []),
  stories: ustore.get('stories', []),
  stats: store.get(akey('stats'), {}),
  ttSeen: store.get(akey('ttSeen'), {}), ttOpen: false,
  linktree: Object.assign(DEFAULT_LT(), store.get(akey('linktree'), {})),
  comments: [], commentsAt: null, commentsLoading: false, statsLoading: false,
  ui: { minimized: [], floating: {}, ...store.get('ui', {}) },
  cards: {}, ttCreator: null, popped: {}, filter: { posts: 'all', sort: 'new', comments: 'all', unanswered: false, table: '' }, open: {}, replyBox: {},
};
if (DEMO) { S.on = { ig: true, fb: true, yt: true, tt: true, li: true, ...ustore.get('on', {}) }; }
const SM = { accountsAt: null, settingsAt: null, deleted: {}, ...ustore.get('syncMeta', {}) };
const saveSM = () => ustore.set('syncMeta', SM);

function saveAccounts() { SM.accountsAt = nowIso(); saveSM(); ustore.set('accounts', S.accounts); sync.schedule(); }
function saveSettingsData() { SM.settingsAt = nowIso(); saveSM(); ustore.set('settings', S.settings); sync.schedule(); }
function saveOn() { ustore.set('on', S.on); }
let draftT;
function saveDraft() { clearTimeout(draftT); draftT = setTimeout(() => { const { media, ...rest } = S.draft; store.set('draft', rest); }, 300); }
function savePosts() { ustore.set('posts', S.posts.slice(0, 500)); sync.schedule(4000); }
function saveStories() { ustore.set('stories', S.stories); sync.schedule(1500); bus.postMessage({ type: 'stories' }); }
function saveLinktree() { ustore.set('linktree', S.linktree); sync.schedule(2500); }
function saveStats() { store.set(akey('stats'), S.stats); }
function saveUi() { store.set('ui', S.ui); }

function addPost(p) { S.posts.unshift(p); savePosts(); renderTable(); }
function updatePost(p) { p.updatedAt = nowIso(); savePosts(); renderTable(); }
function addStory(it) { S.stories.unshift(it); saveStories(); }
function deleteStory(it) { S.stories = S.stories.filter((x) => x.id !== it.id); SM.deleted[it.id] = nowIso(); saveSM(); saveStories(); }

// ───────────────────────── modules
const google = createGoogle({
  clientId: () => store.get('googleClientId', '') || S.config.googleClientId,
  toast,
  serverFlow: () => !!S.config.googleServerFlow && !store.get('googleClientId', ''),
  serverSignIn: (o) => startGoogleOAuth(o),
  onChange: (why) => {
    if (why === 'signin' || why === 'token') switchAccount(google.st.email);
    if (why === 'signout') switchAccount(null);
    renderHeader(); composer.render();
    if (why === 'renewed') return;
    if ((why === 'signin' || why === 'token') && google.valid()) { sync.now(); refreshStats(['yt']); }
  },
});
const platforms = createPlatforms({ S, google, saveAccounts });
const ctx = {
  S, google, platforms, cards: S.cards, saveAccounts, saveDraft, saveOn, addPost, updatePost, addStory, deleteStory, saveStories,
  refreshStats: () => refreshStats(), openAccounts: (p) => openAccounts(p), focusCard: (id) => focusCard(id),
  askGpt: (preset, comment) => chatgpt.open(preset, comment), loadTtCreator: () => loadTtCreator(),
  useReply: (c, text) => { if (c.dm) { inbox.setBox(c, text); return; } S.replyBox[c.platform + c.id] = text; renderComments(); focusCard('comments'); },
  mediaChanged: () => { stories.render(); chatgpt.refresh(); if (ctx.clips) ctx.clips.update(); },
  saveSettings: () => saveSettingsData(),
  get autoSend() { return S.settings.autoSend !== false; },
  get gptChatUrl() { const u = String(S.settings.gptChatUrl || '').trim(); return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(u) ? u : ''; },
};
ctx.clips = createClips(ctx); ctx.brief = createBrief(ctx);
const composer = createComposer(ctx); ctx.composer = composer;
const chatgpt = createChatGPT(ctx);
ctx.gptTouch = () => chatgpt.touch();
const stories = createStories(ctx);
ctx.renderOrbs = () => renderOrbs();
ctx.connectMessaging = () => connectMeta(true).catch((e) => toast(e.message, 'err'));
const inbox = createInbox(ctx);
const linktree = createLinktree({ S, save: saveLinktree });

// ───────────────────────── switching Google accounts
function spaceHasData(a) { return USER_KEYS.some((k) => { const v = store.get(akey(k, a), null); return v && (Array.isArray(v) ? v.length : Object.keys(v).length); }); }
function switchAccount(email) {
  if ((email || null) === ACCT) return;
  if (email && !spaceHasData(email) && spaceHasData(null)) { // first sign-in on this device: keep what you set up before signing in
    for (const k of USER_KEYS) { const v = store.get(akey(k, null), null); if (v != null) store.set(akey(k, email), v); store.del(akey(k, null)); }
  }
  ACCT = email || null;
  Object.assign(S, { settings: { ...DEFAULT_SETTINGS, ...ustore.get('settings', {}) }, accounts: ustore.get('accounts', {}), on: { ...DEFAULT_ON, ...ustore.get('on', {}) }, posts: ustore.get('posts', []), stories: ustore.get('stories', []), stats: store.get(akey('stats'), {}), ttSeen: ustore.get('ttSeen', {}), linktree: Object.assign(DEFAULT_LT(), ustore.get('linktree', {})), comments: [] });
  Object.assign(SM, { accountsAt: null, settingsAt: null, deleted: {} }, ustore.get('syncMeta', {}));
  sync.reset();
  renderAll();
  refreshStats();
}

// ───────────────────────── cross-device sync (Google Drive app folder)
const sync = createSync({
  getToken: () => (DEMO ? null : google.token()),
  collect: () => ({ v: 1, accounts: S.accounts, accountsAt: SM.accountsAt, settings: S.settings, settingsAt: SM.settingsAt, posts: S.posts, stories: S.stories, ttSeen: S.ttSeen, linktree: S.linktree.at ? S.linktree : null, deleted: SM.deleted }),
  apply: (m) => {
    const before = JSON.stringify([S.accounts, S.settings, S.posts.length, S.stories.map((x) => x.id + x.done), S.ttSeen, S.linktree.at]);
    S.accounts = m.accounts || {}; S.settings = { ...DEFAULT_SETTINGS, ...(m.settings || {}) }; S.posts = m.posts || []; S.stories = m.stories || []; S.ttSeen = m.ttSeen || {}; if (m.linktree) S.linktree = Object.assign(DEFAULT_LT(), m.linktree);
    Object.assign(SM, { accountsAt: m.accountsAt, settingsAt: m.settingsAt, deleted: m.deleted || {} }); saveSM();
    ustore.set('accounts', S.accounts); ustore.set('settings', S.settings); ustore.set('posts', S.posts); ustore.set('stories', S.stories); ustore.set('ttSeen', S.ttSeen); ustore.set('linktree', S.linktree);
    if (before !== JSON.stringify([S.accounts, S.settings, S.posts.length, S.stories.map((x) => x.id + x.done), S.ttSeen, S.linktree.at])) { renderAll(); }
  },
  onStatus: (s) => {
    const n = $('#syncNote'); if (!n) return;
    n.className = 'local-note sync-' + s.state;
    n.textContent = s.state === 'ok' ? 'Synced across your devices · ' + new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : s.state === 'syncing' ? 'Syncing…' : s.state === 'error' ? (s.quiet ? 'Not synced — reconnect Google' : 'Sync: ' + s.message)
        : DEMO ? 'Demo mode — sample data, nothing is posted' : 'Saved in this browser — sign in with Google to sync with your phone.';
  },
});
bus.addEventListener('message', (e) => { if (e.data && e.data.type === 'stories') { S.stories = ustore.get('stories', []); stories.render(); } });

// ───────────────────────── cards (drag to float, pop-out, expand, minimise to an orb)
const CARD_DEFS = {
  chatgpt: { title: 'ChatGPT', icon: I.gpt, orb: 'orb-teal', note: () => DESKTOP ? 'chatgpt.com inside the app · your own ChatGPT login' : 'Opens chatgpt.com with your prompt · paste the answer back here' },
  posts: { title: 'Recent posts', icon: I.posts, orb: 'orb-blue', note: () => 'Latest posts on every connected account, with views and engagement' },
  stories: { title: 'Stories & reshare', icon: I.story, orb: 'orb-pink', note: () => 'Link stickers, mentions and polls are added on your phone — the platforms\' APIs don\'t allow them' },
  linktree: { title: 'Linktree', icon: I.link, orb: 'orb-teal', note: () => 'Your Instagram link-in-bio · edit here, then update the live page in Linktree admin' },
  inbox: { title: 'Inbox', icon: I.chat, orb: 'orb-pink', note: () => 'Instagram and Facebook Messenger messages · TikTok, LinkedIn open in their own inbox' },
  comments: { title: 'Comments', icon: I.chat, orb: 'orb-purple', note: () => 'Instagram, Facebook and YouTube comments on your recent posts' },
};
const ORB_SVG = {
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 6.5h17v11h-17z"/><path d="M3.5 7l8.5 6.5L20.5 7"/></svg>',
  chatgpt: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M12 4.5l6.5 3.75v7.5L12 19.5l-6.5-3.75v-7.5zM12 4.5V12m0 0 6.5 3.75M12 12l-6.5 3.75"/></svg>',
  posts: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7.5 15.5l3-3.5 2.5 2.5 3.5-4.5"/></svg>',
  stories: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8" stroke-dasharray="4 2.4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  comments: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
};
ORB_SVG.linktree = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M5 7l14 10M19 7 5 17"/></svg>';
const isMin = (id) => S.ui.minimized.includes(id);
const canFloat = () => window.innerWidth >= 900 && matchMedia('(pointer: fine)').matches;
const isFloat = (id) => canFloat() && !!(S.ui.floating && S.ui.floating[id]);
let zTop = 70;

function makeCard(id) {
  const def = CARD_DEFS[id];
  const count = h('span', { class: 'count' });
  const btn = (icon, title, fn, cls = '') => h('button', { class: 'icon-btn ' + cls, title, 'aria-label': title, onclick: fn, svg: icon });
  const floatBtn = SOLO ? null : btn(I.float, 'Float this card (or drag its header)', () => toggleFloat(id), 'float-btn');
  const actions = h('div', { class: 'card-actions' },
    id !== 'chatgpt' ? btn(I.refresh, 'Refresh', () => (id === 'comments' ? loadComments() : id === 'inbox' ? inbox.load() : id === 'stories' ? stories.render() : refreshStats())) : null,
    floatBtn,
    SOLO ? (window.opener ? btn(I.dock, 'Dock back into the main window', () => { bus.postMessage({ type: 'dock', card: id }); window.close(); }) : null)
      : btn(I.pop, 'Open in a separate window', () => openPopout(id), 'pop-btn'),
    SOLO ? null : btn(I.max, 'Expand', () => toggleMax(id)),
    SOLO ? null : btn(I.min, 'Minimise to an icon', () => minimizeCard(id)));
  const head = h('header', { class: 'card-head', title: SOLO ? null : 'Drag to move · double-click to expand' }, h('div', { class: 'card-title' }, h('span', { class: 'ico', svg: def.icon }), h('span', {}, def.title), count), actions);
  const body = h('div', { class: 'card-body' });
  const foot = h('footer', { class: 'card-foot' }, def.note());
  const el = h('section', { class: 'card card-' + id, 'data-card': id }, head, body, foot);
  head.addEventListener('dblclick', (e) => { if (!e.target.closest('button') && !SOLO) toggleMax(id); });
  if (!SOLO) enableDrag(id, el, head);
  el.addEventListener('pointerdown', () => { if (el.classList.contains('floating')) el.style.zIndex = ++zTop; });
  return { id, el, body, foot, count, floatBtn };
}

function enableDrag(id, el, head) {
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (!canFloat() || e.pointerType === 'touch') return;
    if (e.button !== 0 || e.target.closest('button, a, input, select') || el.classList.contains('max')) return;
    const r = el.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, moved: false, pid: e.pointerId };
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.moved = true;
      head.setPointerCapture(drag.pid);
      if (!isFloat(id)) {
        S.ui.floating[id] = { x: e.clientX - drag.offX, y: e.clientY - drag.offY, w: Math.min(drag.w, 560), h: Math.min(drag.h, 680, window.innerHeight - 40) };
        if (drag.w > 560) drag.offX = Math.min(drag.offX, 520);
        layout();
      }
      el.classList.add('dragging'); el.style.zIndex = ++zTop;
    }
    const f = S.ui.floating[id];
    f.x = Math.min(Math.max(4, e.clientX - drag.offX), window.innerWidth - 80);
    f.y = Math.min(Math.max(4, e.clientY - drag.offY), window.innerHeight - 44);
    el.style.left = f.x + 'px'; el.style.top = f.y + 'px';
  });
  const end = () => { if (!drag) return; const moved = drag.moved; drag = null; el.classList.remove('dragging'); if (moved) { clampFloat(id); saveUi(); } };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  new ResizeObserver(() => {
    if (!el.classList.contains('floating') || el.classList.contains('max')) return;
    const f = S.ui.floating[id]; if (!f) return;
    const w = Math.round(el.offsetWidth), hh = Math.round(el.offsetHeight);
    if (w !== f.w || hh !== f.h) { f.w = w; f.h = hh; clearTimeout(el._rs); el._rs = setTimeout(saveUi, 300); }
  }).observe(el);
}
function clampFloat(id) {
  const f = S.ui.floating[id], el = S.cards[id] && S.cards[id].el;
  if (!f || !el) return;
  f.w = Math.min(f.w || 420, window.innerWidth - 16); f.h = Math.min(f.h || 600, window.innerHeight - 16);
  f.x = Math.min(Math.max(8, f.x), Math.max(8, window.innerWidth - f.w - 8)); f.y = Math.min(Math.max(8, f.y), Math.max(8, window.innerHeight - f.h - 8));
  Object.assign(el.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
}
function toggleFloat(id) {
  if (isFloat(id)) delete S.ui.floating[id];
  else {
    const r = S.cards[id].el.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 380), 560), n = Object.keys(S.ui.floating).length;
    S.ui.floating[id] = { x: Math.min(Math.max(16, r.left + 24) + n * 36, window.innerWidth - w - 16), y: Math.max(16, Math.min(r.top, 80)) + n * 36, w, h: Math.min(Math.max(Math.min(r.height, 680), 480), window.innerHeight - 40 - n * 36) };
  }
  saveUi(); layout();
  if (isFloat(id)) S.cards[id].el.style.zIndex = ++zTop;
}
function isPopped(id) { return S.popped[id] && Date.now() - S.popped[id] < 9000; }
function openPopout(id) {
  const u = new URL(location.href); u.search = ''; u.searchParams.set('card', id); if (DEMO) u.searchParams.set('demo', '1');
  const w = window.open(u.toString(), 'sr-' + id, `popup=yes,width=${id === 'chatgpt' ? 820 : 560},height=900`);
  if (!w) return toast('Your browser blocked the pop-up window — allow pop-ups for this site.', 'err');
  S.popped[id] = Date.now(); S.ui.minimized = S.ui.minimized.filter((x) => x !== id); saveUi(); layout();
}
setInterval(() => { if (!SOLO) bus.postMessage({ type: 'ping' }); }, 4000);
bus.addEventListener('message', (e) => {
  const m = e.data || {};
  if (SOLO && m.type === 'ping') bus.postMessage({ type: 'alive', card: SOLO });
  if (!SOLO && m.type === 'alive' && m.card) { const was = isPopped(m.card); S.popped[m.card] = Date.now(); if (!was) layout(); }
  if (!SOLO && m.type === 'dock' && m.card) { delete S.popped[m.card]; layout(); renderCard(m.card); }
  if (SOLO && m.type === 'close-window' && m.card === SOLO) window.close();
});
setInterval(() => { if (!SOLO && Object.keys(S.popped).some((id) => S.popped[id] && !isPopped(id))) { for (const id of Object.keys(S.popped)) if (!isPopped(id)) delete S.popped[id]; layout(); Object.keys(CARD_DEFS).forEach(renderCard); } }, 5000);

function focusCard(id) {
  const c = S.cards[id]; if (!c) return;
  if (isMin(id)) restoreCard(id);
  if (c.el.classList.contains('floating')) c.el.style.zIndex = ++zTop;
  else c.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  c.el.classList.remove('flash'); void c.el.offsetWidth; c.el.classList.add('flash');
}
function toggleMax(id) {
  const c = S.cards[id], on = !c.el.classList.contains('max');
  document.querySelectorAll('.card.max').forEach((x) => x.classList.remove('max'));
  c.el.classList.toggle('max', on); $('#backdrop').hidden = !on; document.body.classList.toggle('noscroll', on);
}
function minimizeCard(id) { if (S.cards[id].el.classList.contains('max')) toggleMax(id); S.ui.minimized = [...new Set([...S.ui.minimized, id])]; saveUi(); layout(); }
function restoreCard(id) { S.ui.minimized = S.ui.minimized.filter((x) => x !== id); saveUi(); layout(); renderCard(id); }
function renderOrbs() {
  const dock = $('#orbDock'); if (!dock) return;
  const ids = Object.keys(CARD_DEFS).filter((id) => isMin(id) && !isPopped(id));
  dock.hidden = !ids.length; document.body.classList.toggle('has-orbs', !!ids.length);
  fill(dock, ...ids.map((id) => {
    const n = id === 'inbox' ? inbox.count() : id === 'comments' ? S.comments.length : id === 'stories' ? S.stories.filter((x) => !x.done).length : 0;
    return h('button', { type: 'button', class: 'launcher-orb ' + CARD_DEFS[id].orb, title: 'Show ' + CARD_DEFS[id].title, 'aria-label': 'Show ' + CARD_DEFS[id].title, onclick: () => restoreCard(id) },
      h('span', { class: 'orb-ico', svg: ORB_SVG[id] }), n ? h('span', { class: 'orb-badge' }, n > 99 ? '99+' : n) : null, h('span', { class: 'orb-label' }, CARD_DEFS[id].title));
  }));
}
function layout() {
  if (SOLO) return;
  const floatLayer = $('#floatLayer');
  for (const id of Object.keys(CARD_DEFS)) {
    const c = S.cards[id]; if (!c) continue;
    const slot = $('#slot-' + id);
    if (isPopped(id)) {
      if (c.el.parentNode) c.el.remove();
      slot.hidden = false;
      fill(slot, h('div', { class: 'card ghost-card' }, h('div', { class: 'card-title' }, h('span', { class: 'ico', svg: CARD_DEFS[id].icon }), CARD_DEFS[id].title), h('p', {}, 'Open in a separate window.'),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => openPopout(id) }, 'Show window'), h('button', { class: 'btn ghost sm', onclick: () => { bus.postMessage({ type: 'close-window', card: id }); delete S.popped[id]; layout(); renderCard(id); } }, 'Bring back here'))));
      continue;
    }
    [...slot.children].forEach((x) => { if (x !== c.el) x.remove(); });
    if (isMin(id)) { slot.hidden = true; if (c.el.parentNode) c.el.remove(); continue; }
    if (isFloat(id)) {
      slot.hidden = true; c.el.classList.add('floating');
      if (c.el.parentNode !== floatLayer) floatLayer.append(c.el);
      clampFloat(id); if (!c.el.style.zIndex) c.el.style.zIndex = ++zTop;
    } else {
      c.el.classList.remove('floating'); c.el.removeAttribute('style');
      slot.hidden = false; if (c.el.parentNode !== slot) slot.append(c.el);
    }
    if (c.floatBtn) { c.floatBtn.innerHTML = isFloat(id) ? I.dockIn : I.float; c.floatBtn.title = isFloat(id) ? 'Dock back into the page' : 'Float this card (or drag its header)'; }
  }
  const away = (id) => !isPopped(id) && (isMin(id) || isFloat(id));
  document.body.classList.toggle('no-left', away('chatgpt'));
  document.body.classList.toggle('no-right', away('posts'));
  const duo = $('.duo');
  const shown = ['stories', 'comments'].filter((id) => !$('#slot-' + id).hidden).length;
  duo.classList.toggle('single', shown === 1); duo.hidden = shown === 0;
  renderOrbs();
}
function renderCard(id) {
  if (id === 'chatgpt') chatgpt.render();
  if (id === 'posts') renderPostsCard();
  if (id === 'stories') stories.render();
  if (id === 'comments') renderComments();
  if (id === 'inbox') inbox.render();
  if (id === 'linktree') linktree.render();
}

// ───────────────────────── header, accounts, settings
function renderHeader() {
  const g = google.st;
  const chip = $('#googleChip');
  if (chip) fill(chip, 
    g.email
      ? h('button', { class: 'acct-pill' + (google.valid() ? '' : ' stale'), title: google.valid() ? 'Signed in with Google as ' + g.email + ' (YouTube + sync)' : 'Google session expired — click to reconnect', onclick: () => (google.valid() ? openAccounts() : google.signIn().catch((e) => toast(e.message, 'err'))) },
        g.picture ? h('img', { src: g.picture, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'av' }, (g.name || g.email)[0].toUpperCase()),
        h('span', {}, google.valid() ? (g.name || g.email) : 'Reconnect Google'))
      : h('button', { class: 'btn sm google', onclick: () => google.signIn().catch((e) => toast(e.message, 'err')) }, h('span', { svg: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"/></svg>' }), 'Sign in with Google'));
  const n = PLATFORMS.filter((p) => composer.connected(p)).length;
  const ab = $('#accountsBtn');
  if (ab) fill(ab, h('span', { svg: I.user }), `Accounts · ${n}/5`);
}

function loadFbSdk() {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => { window.FB.init({ appId: S.config.metaAppId, version: S.config.graphVersion || 'v23.0', cookie: false, xfbml: false }); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Could not load Facebook sign-in — an ad-blocker may be blocking connect.facebook.net.'));
    document.head.append(s);
  });
}
const META_SCOPES = 'pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_posts,pages_manage_engagement,read_insights,business_management,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights';
const MSG_SCOPES = 'pages_messaging,instagram_manage_messages';
// Ask Meta whether the saved Facebook login is still good and when it runs out, so a dead login is spotted
// (and explained) before posting fails.
async function checkMeta() {
  const m = S.accounts.meta;
  if (DEMO || !m || !S.config.metaReady || !m.userToken) return;
  const pg = (m.pages || []).find((p) => p.id === m.pageId) || (m.pages || [])[0];
  try {
    const r = await api('/api/meta?action=check', { body: { userToken: m.userToken, pageToken: pg && pg.token } });
    S.metaHealth = { ...r, at: Date.now() };
    const bad = [r.page, r.user].find((x) => x && !x.valid);
    if (bad) toast('Facebook login is no longer valid' + (bad.reason ? ': ' + bad.reason : '') + ' — reconnect Facebook under Accounts.', 'err');
  } catch { /* ignore: the check is only a courtesy */ }
  const dg = $('#accounts'); if (dg && dg.open) renderAccounts();
}
const metaHealthLine = () => {
  const x = S.metaHealth; if (!x) return null;
  const d = (s) => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const p = x.page || x.user; if (!p) return null;
  if (!p.valid) return 'Login check: no longer valid' + (p.reason ? ' — ' + p.reason : '') + '. Reconnect Facebook.';
  return 'Login check: valid' + (p.expiresAt ? ', expires ' + d(p.expiresAt) : ', does not expire') + (x.user && x.user.dataAccessExpiresAt ? ' · Meta data access until ' + d(x.user.dataAccessExpiresAt) : '') + '.';
};
async function connectMeta(withMessages) {
  if (DEMO) return toast('Demo mode — accounts are simulated.');
  if (!S.config.metaReady) return toast('Facebook isn\'t set up on the server yet — add META_APP_ID and META_APP_SECRET on Vercel (README step 3).', 'err');
  await loadFbSdk();
  const resp = await new Promise((r) => window.FB.login(r, S.config.metaConfigId ? { config_id: S.config.metaConfigId } : { scope: META_SCOPES + (withMessages ? ',' + MSG_SCOPES : ''), return_scopes: true, auth_type: 'rerequest' }));
  if (!resp || !resp.authResponse) throw new Error('Facebook sign-in was cancelled.');
  const r = await api('/api/meta?action=exchange', { body: { token: resp.authResponse.accessToken } });
  if (!r.pages.length) throw new Error('No Facebook Pages found. Make sure you tick the Acme Studio Page (and its Instagram account) on Facebook\'s screen.');
  const prev = S.accounts.meta && S.accounts.meta.pageId;
  S.accounts.meta = { user: r.user, userToken: r.userToken, pages: r.pages, pageId: r.pages.some((p) => p.id === prev) ? prev : (r.pages.find((p) => p.ig) || r.pages[0]).id, at: nowIso() };
  saveAccounts(); setTimeout(checkMeta, 500);
  toast('Facebook connected ✓' + (r.pages.find((p) => p.id === S.accounts.meta.pageId).ig ? ' Instagram too.' : ' (no Instagram linked to this Page)'));
  refreshStats(['ig', 'fb']); if (withMessages) inbox.load();
}
async function connectOAuth(provider, kind) {
  if (DEMO) return toast('Demo mode — accounts are simulated.');
  const ready = provider === 'tiktok' ? S.config.tiktokReady : kind === 'pages' ? S.config.linkedinPagesReady : S.config.linkedinReady;
  if (!ready) return toast(`${provider === 'tiktok' ? 'TikTok' : 'LinkedIn'} isn't set up on the server yet — see the README.`, 'err');
  const state = uid();
  store.set('oauthState:' + provider, state);
  const r = await api(`/api/${provider}?action=auth-url&state=${state}${kind ? '&kind=' + kind : ''}`);
  if (touchDevice() || DESKTOP) { location.href = r.url; return; }
  const w = window.open(r.url, 'sr-oauth', 'popup=yes,width=520,height=760');
  if (!w) location.href = r.url;
}
async function startGoogleOAuth(o = {}) {
  const state = uid();
  store.set('oauthState:google', state);
  const r = await api(`/api/google?action=auth-url&state=${state}${o.switch ? '&switch=1' : ''}${o.hint ? '&hint=' + encodeURIComponent(o.hint) : ''}`);
  if (touchDevice() || DESKTOP) { location.href = r.url; return; }
  const w = window.open(r.url, 'sr-oauth', 'popup=yes,width=520,height=760');
  if (!w) location.href = r.url;
}
function handleOAuth(d) {
  if (!d || !d.provider) return;
  try { localStorage.removeItem('sr:oauth-result'); } catch { /* ignore */ }
  if (Date.now() - (d.at || 0) > 10 * 60e3) return;
  const expect = store.get('oauthState:' + d.provider, null);
  if (!expect || expect !== d.state) return;
  store.del('oauthState:' + d.provider);
  if (d.error) return toast(`${{ tiktok: 'TikTok', linkedin: 'LinkedIn', google: 'Google' }[d.provider] || d.provider}: ${d.error}`, 'err');
  if (d.provider === 'google') { google.adopt(d.account); toast('Google connected ✓ — it will stay signed in on this device'); const dg = $('#accounts'); if (dg.open) renderAccounts(); return; }
  if (d.provider === 'tiktok') { S.accounts.tiktok = { ...d.account, at: nowIso() }; S.on.tt = true; }
  if (d.provider === 'linkedin') {
    const a = d.account, prev = S.accounts.linkedin || {};
    if (d.kind === 'pages') {
      if (!(a.orgs || []).length) return toast('LinkedIn connected, but no company Page was found — you must be an Administrator of the Acme Studio Page, and the Community Management API must be approved for the Pages app.', 'err');
      const me = prev.person && prev.person.urn ? prev : { ...prev, person: a.person };
      S.accounts.linkedin = { ...me, pagesToken: a.token, pagesExp: a.exp, orgs: a.orgs, orgNote: null, author: a.orgs.some((o) => o.urn === prev.author) ? prev.author : a.orgs[0].urn, at: nowIso() };
    } else {
      S.accounts.linkedin = { ...prev, ...a, orgs: (a.orgs && a.orgs.length) ? a.orgs : (prev.orgs || []), pagesToken: prev.pagesToken, pagesExp: prev.pagesExp, author: prev.author || a.person.urn, at: nowIso() };
    }
    S.on.li = true; }
  saveAccounts(); saveOn();
  toast(`${d.provider === 'tiktok' ? 'TikTok' : 'LinkedIn'} connected ✓`);
  renderAll(); refreshStats([d.provider === 'tiktok' ? 'tt' : 'li']);
  const dlg = $('#accounts'); if (dlg.open) renderAccounts();
}
window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'sr-oauth') handleOAuth(e.data.data); });
try { new BroadcastChannel('social-radar-oauth').addEventListener('message', (e) => handleOAuth(e.data)); } catch { /* ignore */ }
window.addEventListener('storage', (e) => { if (e.key === 'sr:oauth-result' && e.newValue) handleOAuth(JSON.parse(e.newValue)); });

function disconnect(p) {
  if (p === 'meta') delete S.accounts.meta;
  if (p === 'tiktok') delete S.accounts.tiktok;
  if (p === 'linkedin') delete S.accounts.linkedin;
  for (const k of p === 'meta' ? ['ig', 'fb'] : [p === 'tiktok' ? 'tt' : 'li']) delete S.stats[k];
  saveStats(); saveAccounts(); renderAll(); renderAccounts();
}

function openAccounts(focus) { renderAccounts(focus); const d = $('#accounts'); if (!d.open) d.showModal(); }
function renderAccounts(focus) {
  const body = $('#accountsBody'); if (!body) return;
  const g = google.st, m = S.accounts.meta, t = S.accounts.tiktok, l = S.accounts.linkedin;
  const run = (fn) => async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(err.message, 'err'); } b.disabled = false; renderAccounts(); renderHeader(); composer.render(); };
  const row = (key, icons, title, status, actions, extra, hint) => h('div', { class: 'acc-row' + (focus && key.includes(focus) ? ' focus' : '') },
    h('div', { class: 'acc-ico' }, icons.map((p) => h('span', { svg: I[p] }))),
    h('div', { class: 'acc-main' }, h('b', {}, title), h('div', { class: 'small muted' }, status), extra || null, hint ? h('div', { class: 'xs warn' }, hint) : null),
    h('div', { class: 'acc-act' }, actions));
  const pg = platforms.page();
  fill(body, 
    DEMO ? h('p', { class: 'note' }, 'Demo mode: all five accounts are simulated and nothing is really posted. Remove ?demo=1 from the address to use your real accounts.') : null,
    row('yt google', ['yt'], 'YouTube + sync (Google)',
      g.email ? [google.valid() ? 'Signed in as ' : 'Session expired for ', h('b', {}, g.email), S.accounts.youtube ? ' · channel ' + S.accounts.youtube.title : ''] : 'Sign in to upload to YouTube and sync your setup with your phone.',
      g.email ? [google.valid() ? null : h('button', { class: 'btn sm primary', onclick: run(() => google.signIn()) }, 'Reconnect'), h('button', { class: 'btn sm', onclick: run(() => google.signIn({ switch: true })) }, 'Switch'), h('button', { class: 'btn sm ghost', onclick: () => { google.signOut(); renderAccounts(); } }, 'Sign out')]
        : h('button', { class: 'btn sm primary', onclick: run(() => google.signIn()) }, 'Sign in with Google'),
      null, !S.config.googleClientId && !store.get('googleClientId', '') && !DEMO ? 'Owner: add GOOGLE_CLIENT_ID on Vercel first (README step 2).' : null),
    row('ig fb meta', ['ig', 'fb'], 'Instagram + Facebook Page',
      m ? ['Connected as ', h('b', {}, m.user ? m.user.name : 'Facebook user'), pg ? [' · Page ', h('b', {}, pg.name), pg.ig ? [' · Instagram ', h('b', {}, '@' + pg.ig.username)] : ' · no Instagram linked'] : null] : 'Connect the Facebook account that manages the Acme Studio Page. Its Instagram professional account comes with it.',
      m ? [h('button', { class: 'btn sm', onclick: run(connectMeta) }, 'Reconnect'), h('button', { class: 'btn sm ghost', onclick: () => disconnect('meta') }, 'Disconnect')] : h('button', { class: 'btn sm primary', onclick: run(connectMeta) }, 'Connect with Facebook'),
      m && m.pages.length > 1 ? h('label', { class: 'f' }, h('span', {}, 'Page to post to'), h('select', { class: 'inp sm', onchange: (e) => { m.pageId = e.target.value; saveAccounts(); delete S.stats.ig; delete S.stats.fb; renderAll(); refreshStats(['ig', 'fb']); renderAccounts(); } }, m.pages.map((p) => h('option', { value: p.id, selected: p.id === m.pageId }, p.name + (p.ig ? ' · @' + p.ig.username : ''))))) : null,
      metaHealthLine() ? h('div', { class: 'note-note' }, metaHealthLine()) : null,
      !DEMO && !S.config.metaReady ? 'Owner: add META_APP_ID and META_APP_SECRET on Vercel first (README step 3).' : null),
    row('tt tiktok', ['tt'], 'TikTok',
      t ? ['Connected', t.user ? [' as ', h('b', {}, '@' + (t.user.username || t.user.name))] : ''] : 'Post videos directly, or send them to your TikTok drafts to finish in the app.',
      t ? [h('button', { class: 'btn sm', onclick: run(() => connectOAuth('tiktok')) }, 'Reconnect'), h('button', { class: 'btn sm ghost', onclick: () => disconnect('tiktok') }, 'Disconnect')] : h('button', { class: 'btn sm primary', onclick: run(() => connectOAuth('tiktok')) }, 'Connect TikTok'),
      null, !DEMO && !S.config.tiktokReady ? 'Owner: add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET on Vercel first (README step 4).' : null),
    row('li linkedin', ['li'], 'LinkedIn',
      l ? [l.token ? ['Connected as ', h('b', {}, l.person && l.person.name), l.exp ? ` · valid until ${new Date(l.exp).toLocaleDateString()}` : ''] : 'Personal profile not connected', ' · ', l.pagesToken ? ['Page: ', h('b', {}, (l.orgs || []).map((o) => o.name).join(', '))] : 'Company Page not connected'] : 'Post as yourself, or as the Acme Studio company page (needs LinkedIn\'s Community Management API).',
      [h('button', { class: 'btn sm' + (l && l.token ? '' : ' primary'), onclick: run(() => connectOAuth('linkedin')) }, l && l.token ? 'Reconnect (you)' : 'Connect LinkedIn (you)'),
        h('button', { class: 'btn sm' + (l && l.pagesToken ? '' : ' primary'), onclick: run(() => connectOAuth('linkedin', 'pages')) }, l && l.pagesToken ? 'Reconnect Page' : 'Connect Acme Studio Page'),
        l ? h('button', { class: 'btn sm ghost', onclick: () => disconnect('linkedin') }, 'Disconnect') : null],
      l ? h('label', { class: 'f' }, h('span', {}, 'Post as'), h('select', { class: 'inp sm', onchange: (e) => { l.author = e.target.value; S.draft.per.li.author = e.target.value; saveAccounts(); delete S.stats.li; refreshStats(['li']); composer.render(); } }, [...(l.orgs || []).map((o) => [o.urn, o.name + ' (company page)']), ...(l.person.urn ? [[l.person.urn, l.person.name + ' (you)']] : [])].map(([v, n]) => h('option', { value: v, selected: v === l.author }, n)))) : null,
      l && !(l.orgs || []).length ? (l.orgNote ? 'Company pages not available yet: ' + l.orgNote : null) : (!DEMO && !S.config.linkedinReady && !S.config.linkedinPagesReady ? 'Owner: add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET on Vercel first (README step 4).' : null)),
    h('p', { class: 'xs muted' }, 'Sign-ins are kept in this browser and, once you sign in with Google, in a private file in your own Google Drive so your phone gets them too. Nothing is stored on the server.'));
}

function openSettings() {
  const f = $('#settingsForm');
  f.brandVoice.value = S.settings.brandVoice || ''; f.defaultHashtags.value = S.settings.defaultHashtags || '';
  f.autoDelete.checked = S.settings.autoDelete !== false; f.autoSend.checked = S.settings.autoSend !== false; f.gptChatUrl.value = S.settings.gptChatUrl || '';
  f.passcode.value = store.get('passcode', ''); f.googleClientId.value = store.get('googleClientId', '');
  $('#settings').showModal();
}
function saveSettingsForm() {
  const f = $('#settingsForm');
  Object.assign(S.settings, { brandVoice: f.brandVoice.value.trim(), defaultHashtags: f.defaultHashtags.value.trim(), autoDelete: f.autoDelete.checked, autoSend: f.autoSend.checked, gptChatUrl: f.gptChatUrl.value.trim() });
  store.set('passcode', f.passcode.value.trim()); store.set('googleClientId', f.googleClientId.value.trim());
  saveSettingsData(); chatgpt.refresh(); toast('Settings saved');
}

// ───────────────────────── stats
const connectedPlatforms = () => PLATFORMS.filter((p) => composer.connected(p));
async function refreshStats(only) {
  const list = (only || connectedPlatforms()).filter((p) => composer.connected(p));
  if (!list.length) { renderStatsViews(); return; }
  S.statsLoading = true; renderSummary();
  await Promise.all(list.map(async (p) => {
    try {
      if (p === 'yt' && !DEMO && !google.valid()) await google.renew();
      if (p === 'yt' && !DEMO && !google.valid()) throw new Error('Reconnect Google to load YouTube');
      const r = DEMO ? demoStats(p) : await platforms.stats[p]();
      if (DEMO) for (const post of S.posts) { const t = post.targets && post.targets[p]; if (t && t.status === 'done' && t.id) { const v = 300 + (t.id.length * 97) % 2400; r.posts.unshift({ platform: p, id: t.id, at: t.at || post.at, text: post.caption, thumb: post.thumb, url: t.url, type: post.formats ? post.formats[p] : 'Post', views: v, likes: Math.round(v * 0.06), comments: Math.round(v * 0.008), shares: Math.round(v * 0.004), saves: p === 'ig' ? Math.round(v * 0.01) : undefined }); } }
      S.stats[p] = { ...r, at: nowIso() };
    } catch (e) { S.stats[p] = { ...(S.stats[p] || {}), error: e.message, at: nowIso() }; }
  }));
  if (list.some((p) => ['yt', 'tt'].includes(p))) ustore.set('accounts', S.accounts);
  S.statsLoading = false; saveStats();
  renderStatsViews(); renderHeader(); composer.render();
  loadComments(); inbox.load();
}
function renderStatsViews() { renderSummary(); renderTable(); renderPostsCard(); stories.render(); }

function statLookup(p, id) { const s = S.stats[p]; return s && s.posts ? s.posts.find((x) => x.id === id || (id && x.id && String(x.id).endsWith(String(id)))) : null; }
const engOf = (x) => (x ? (x.likes || 0) + (x.comments || 0) + (x.shares || 0) + (x.saves || 0) : 0);

function renderSummary() {
  const box = $('#summary'); if (!box) return;
  const conn = connectedPlatforms();
  const rows = conn.map((p) => ({ p, s: S.stats[p] })).filter((x) => x.s && x.s.account);
  const followers = rows.reduce((a, x) => a + (x.s.account.followers || 0), 0);
  const views = rows.reduce((a, x) => a + (x.s.account.views28 || 0), 0);
  const eng = rows.reduce((a, x) => a + (x.s.account.eng28 || 0), 0);
  const rateRows = rows.filter((x) => x.s.account.views28 && x.s.account.eng28 != null);
  const rate = rateRows.length ? rateRows.reduce((a, x) => a + x.s.account.eng28, 0) / rateRows.reduce((a, x) => a + x.s.account.views28, 0) : null;
  const week = S.posts.filter((x) => Date.now() - new Date(x.at) < 7 * 864e5);
  const lastAt = rows.map((x) => x.s.at).sort().pop();
  fill(box, 
    h('div', { class: 'sum-top' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Followers'), h('div', { class: 'big' }, num(followers)), h('div', { class: 'small muted' }, `across ${rows.length} account${rows.length === 1 ? '' : 's'}`)),
      h('div', { class: 'sum-side' }, h('div', { class: 'eyebrow' }, 'Views · last 28 days'), h('div', { class: 'big up' }, num(views)), h('div', { class: 'small muted' }, `${num(eng)} engagements · ${pct(rate)} rate`)),
      h('div', { class: 'sum-btns' },
        h('button', { class: 'btn', onclick: () => refreshStats(), disabled: S.statsLoading }, S.statsLoading ? h('span', { class: 'spin' }) : h('span', { svg: I.refresh }), 'Refresh stats'),
        h('div', { class: 'xs muted', style: { 'text-align': 'right' } }, lastAt ? 'Updated ' + ago(lastAt) + ' ago' : ''))),
    views ? h('div', { class: 'bar', title: 'Share of views by platform' }, rows.filter((x) => x.s.account.views28).map((x) => h('span', { style: { flex: x.s.account.views28, '--c': P[x.p].color } }))) : h('div', { class: 'bar' }, h('span', { class: 'empty-bar' })),
    h('div', { class: 'legend' }, rows.map((x) => h('span', {}, h('i', { style: { '--c': P[x.p].color } }), P[x.p].name, ' ', h('b', {}, num(x.s.account.views28))))),
    h('div', { class: 'tiles' },
      PLATFORMS.map((p) => {
        const s = S.stats[p], a = s && s.account;
        if (!composer.connected(p)) return h('button', { class: 'tile ghost-tile', onclick: () => openAccounts(p) }, h('div', { class: 'tl' }, pIcon(p), P[p].name), h('div', { class: 'ts' }, '+ Connect'));
        return h('div', { class: 'tile', style: { '--c': P[p].color }, title: (a && a.note) || (s && s.error) || '' },
          h('div', { class: 'tl' }, pIcon(p), h('span', { class: 'ell' }, a ? a.handle || a.name : P[p].name)),
          h('div', { class: 'tv' }, a ? num(a.followers) : s && s.error ? '!' : '…', h('small', {}, p === 'yt' ? ' subs' : ' followers')),
          h('div', { class: 'ts' }, a ? `${num(a.views28)} views · ${num(a.eng28)} eng.` : s && s.error ? h('span', { class: 'warn' }, s.error.slice(0, 80)) : 'Loading…'));
      }),
      h('div', { class: 'tile' }, h('div', { class: 'tl' }, 'Posted from here'), h('div', { class: 'tv' }, week.length, h('small', {}, ' this week')), h('div', { class: 'ts' }, `${S.posts.length} in total`))));
}

// ───────────────────────── table: everything you posted from here, one row per Submit
function renderTable() {
  const box = $('#postsPanel'); if (!box) return;
  const q = S.filter.table.toLowerCase();
  const posts = S.posts.filter((x) => !q || (x.caption || '').toLowerCase().includes(q));
  const search = h('input', { class: 'inp sm', type: 'search', placeholder: 'Search posts…', value: S.filter.table });
  search.addEventListener('input', () => { S.filter.table = search.value; clearTimeout(search._t); search._t = setTimeout(() => { renderTable(); const s = $('#postsPanel input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 250); });
  const rows = [];
  for (const post of posts) {
    const tg = Object.entries(post.targets || {});
    const mets = tg.map(([p, t]) => statLookup(p, t.id)).filter(Boolean);
    const tot = (k) => mets.reduce((a, x) => a + (x[k] || 0), 0);
    const views = tot('views'), e = mets.reduce((a, x) => a + engOf(x), 0);
    const open = !!S.open[post.id];
    const okN = tg.filter(([, t]) => t.status === 'done').length;
    rows.push(h('tr', { class: 'grp', onclick: () => { S.open[post.id] = !open; renderTable(); } },
      h('td', {}, h('div', { class: 'row nowrap' }, h('span', { class: 'caret' }, open ? '▾' : '▸'), post.thumb ? h('span', { class: 'tthumb', style: { 'background-image': `url("${post.thumb}")` } }) : h('span', { class: 'tthumb empty' }), h('span', { class: 'tcap' }, (post.caption || '(no caption)').split('\n')[0]))),
      h('td', {}, h('div', { class: 'row nowrap' }, tg.map(([p, t]) => h('span', { class: 'pdot st-' + t.status, title: P[p].name + ': ' + (t.status === 'error' ? t.error : t.status) }, pIcon(p))))),
      h('td', {}, h('span', { class: 'st ' + (okN === tg.length ? 'st-offer' : okN ? 'st-interview' : tg.some(([, t]) => t.status === 'working') ? 'st-replied' : 'st-rejected') }, okN === tg.length ? 'Posted' : tg.some(([, t]) => t.status === 'working' || t.status === 'waiting') ? 'Posting…' : `${okN}/${tg.length} posted`)),
      h('td', { class: 'n' }, mets.length ? num(views) : '—'), h('td', { class: 'n' }, mets.length ? num(tot('likes')) : '—'), h('td', { class: 'n' }, mets.length ? num(tot('comments')) : '—'), h('td', { class: 'n' }, mets.length ? num(tot('shares')) : '—'),
      h('td', { class: 'n' }, views ? pct(e / views) : '—'),
      h('td', { class: 'mono xs' }, fmtDate(post.at)),
      h('td', {}, h('button', { class: 'x', title: 'Remove from this list (the posts stay online)', onclick: (ev) => { ev.stopPropagation(); if (confirm('Remove this entry from the list? The posts stay online.')) { S.posts = S.posts.filter((x) => x !== post); SM.deleted[post.id] = nowIso(); saveSM(); savePosts(); renderTable(); renderSummary(); } } }, '✕'))));
    if (open) for (const [p, t] of tg) {
      const m = statLookup(p, t.id);
      rows.push(h('tr', { class: 'app' },
        h('td', { class: 'indent-cell' }, h('div', { class: 'row nowrap' }, pIcon(p), h('b', {}, P[p].name), h('span', { class: 'muted small' }, ' · ' + ((post.formats && post.formats[p]) || 'post')))),
        h('td', {}, t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', class: 'small' }, 'Open ↗') : null),
        h('td', {}, t.status === 'done' ? h('span', { class: 'st st-offer' }, '✓ Posted') : t.status === 'error' ? h('span', { class: 'st st-rejected', title: t.error }, '✕ ' + (t.error || 'Failed').slice(0, 60)) : h('span', { class: 'st st-replied' }, t.stage || 'Posting…'), t.note ? h('div', { class: 'xs muted' }, t.note) : null),
        h('td', { class: 'n' }, m ? num(m.views) : '—'), h('td', { class: 'n' }, m ? num(m.likes) : '—'), h('td', { class: 'n' }, m ? num(m.comments) : '—'), h('td', { class: 'n' }, m ? num(m.shares) : '—'),
        h('td', { class: 'n' }, m && m.views ? pct(engOf(m) / m.views) : '—'), h('td', { class: 'mono xs' }, t.at ? fmtDate(t.at) : ''), h('td', {})));
    }
  }
  fill(box, 
    h('div', { class: 'tbl-head' }, h('div', {}, h('h2', {}, 'Posted from Social Radar'), h('div', { class: 'small muted' }, 'One row per Submit — open a row for each platform\'s link, views and engagement.')),
      h('div', { class: 'row' }, search, h('button', { class: 'btn sm', onclick: exportCsv }, 'Export CSV'))),
    h('div', { class: 'tbl-wrap' }, posts.length ? h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Post', 'Platforms', 'Status', 'Views', 'Likes', 'Comments', 'Shares', 'Eng. rate', 'Posted', ''].map((x, i) => h('th', { class: i >= 3 && i <= 7 ? 'n' : '' }, x)))),
      h('tbody', {}, rows)) : h('div', { class: 'empty' }, S.posts.length ? 'No posts match.' : 'Nothing posted from here yet. Your first Submit shows up here with live views and engagement.')));
}
function exportCsv() {
  const lines = [['Posted', 'Caption', 'Platform', 'Format', 'Status', 'Link', 'Views', 'Likes', 'Comments', 'Shares', 'Saves']];
  for (const post of S.posts) for (const [p, t] of Object.entries(post.targets || {})) {
    const m = statLookup(p, t.id) || {};
    lines.push([post.at, (post.caption || '').replace(/\s+/g, ' '), P[p].name, (post.formats || {})[p] || '', t.status === 'error' ? 'Failed: ' + t.error : t.status, t.url || '', m.views ?? '', m.likes ?? '', m.comments ?? '', m.shares ?? '', m.saves ?? '']);
  }
  const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `social-radar-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
}

// ───────────────────────── Recent posts card
function renderPostsCard() {
  const c = S.cards.posts; if (!c) return;
  let all = PLATFORMS.flatMap((p) => (composer.connected(p) && S.stats[p] && S.stats[p].posts) || []);
  const f = S.filter.posts;
  if (f !== 'all') all = all.filter((x) => x.platform === f);
  const sorters = { new: (a, b) => new Date(b.at) - new Date(a.at), views: (a, b) => (b.views || 0) - (a.views || 0), eng: (a, b) => (b.views ? engOf(b) / b.views : 0) - (a.views ? engOf(a) / a.views : 0) };
  all.sort(sorters[S.filter.sort]);
  c.count.textContent = all.length || '';
  const chips = h('div', { class: 'card-tools' },
    h('div', { class: 'chips-row' }, ['all', ...connectedPlatforms()].map((p) => h('button', { class: 'chip' + (f === p ? ' on' : ''), onclick: () => { S.filter.posts = p; renderPostsCard(); } }, p === 'all' ? 'All' : [pIcon(p), P[p].short]))),
    h('select', { class: 'inp sm sort-sel', 'aria-label': 'Sort', onchange: (e) => { S.filter.sort = e.target.value; renderPostsCard(); } }, [['new', 'Newest'], ['views', 'Most views'], ['eng', 'Best engagement']].map(([v, l]) => h('option', { value: v, selected: S.filter.sort === v }, l))));
  const errs = connectedPlatforms().filter((p) => S.stats[p] && S.stats[p].error);
  fill(c.body, chips,
    errs.length ? errs.map((p) => h('div', { class: 'note warn' }, pIcon(p), ' ', S.stats[p].error)) : null,
    !connectedPlatforms().length ? h('div', { class: 'empty' }, h('p', {}, 'Connect your accounts to see every post with its views and engagement.'), h('button', { class: 'btn sm primary', onclick: () => openAccounts() }, 'Connect accounts')) : null,
    all.length ? h('div', { class: 'plist' }, all.slice(0, 80).map((x) => postRow(x))) : connectedPlatforms().length ? h('div', { class: 'empty' }, S.statsLoading ? 'Loading…' : 'No posts yet.') : null);
}
function postRow(x) {
  const key = x.platform + x.id, open = !!S.open[key];
  const rate = x.views ? engOf(x) / x.views : null;
  return h('div', { class: 'prow-card' + (open ? ' open' : '') },
    h('div', { class: 'pr-main', role: 'button', tabindex: '0', onclick: () => { S.open[key] = !open; renderPostsCard(); }, onkeydown: (e) => { if (e.key === 'Enter') { S.open[key] = !open; renderPostsCard(); } } },
      h('div', { class: 'pr-thumb', style: x.thumb ? { 'background-image': `url("${x.thumb}")` } : {} }, h('span', { class: 'pr-p', svg: I[x.platform] })),
      h('div', { class: 'pr-text' },
        h('div', { class: 'pr-cap' }, (x.title || x.text || '').split('\n')[0] || x.type),
        h('div', { class: 'badges' },
          h('span', { class: 'b' }, x.type || 'Post'),
          x.views != null ? h('span', { class: 'b sal', title: 'Views' }, '👁 ' + num(x.views)) : null,
          x.likes != null ? h('span', { class: 'b', title: 'Likes' }, '♥ ' + num(x.likes)) : null,
          x.comments != null ? h('span', { class: 'b', title: 'Comments' }, '💬 ' + num(x.comments)) : null,
          x.shares ? h('span', { class: 'b', title: 'Shares' }, '↗ ' + num(x.shares)) : null,
          x.saves ? h('span', { class: 'b', title: 'Saves' }, '🔖 ' + num(x.saves)) : null,
          rate != null ? h('span', { class: 'b done', title: 'Engagement rate' }, pct(rate)) : null)),
      h('span', { class: 'job-age' }, ago(x.at))),
    open ? h('div', { class: 'pr-detail' },
      x.text ? h('div', { class: 'desc' }, x.text) : null,
      h('div', { class: 'job-actions' },
        x.url ? h('a', { class: 'btn sm', href: x.url, target: '_blank', rel: 'noopener' }, 'Open ↗') : null,
        h('button', { class: 'btn sm', onclick: () => { S.draft.caption = x.text || ''; saveDraft(); composer.render(); $('#console').scrollIntoView({ behavior: 'smooth' }); toast('Caption copied into the composer'); } }, 'Reuse caption'),
        ['ig', 'fb', 'yt'].includes(x.platform) ? h('button', { class: 'btn sm', onclick: () => { S.filter.comments = x.platform; S.filter.post = x.id; renderComments(); focusCard('comments'); } }, 'Comments') : null)) : null);
}

// ───────────────────────── Comments card
async function loadComments() {
  if (!['ig', 'fb', 'yt'].some((p) => composer.connected(p))) { renderComments(); return; }
  S.commentsLoading = true; renderComments();
  try { S.comments = await platforms.comments(); S.commentsAt = nowIso(); S.commentsError = (S.comments.errors && S.comments.errors.length) ? 'Some comments could not load: ' + [...new Set(S.comments.errors)].slice(0, 2).join(' · ') : null; } catch (e) { S.commentsError = e.message; }
  S.commentsLoading = false; renderComments(); renderOrbs();
}
// TikTok doesn't let apps read comment text, only the number of comments per video. We remember the last count
// you saw per video (kept in sync through Google Drive) and show how many are new since.
function ttComments() {
  if (!composer.connected('tt')) return null;
  const s = S.stats.tt;
  if (!s) return { loading: true, rows: [], newTotal: 0, total: 0 };
  if (s.error) return { error: s.error, rows: [], newTotal: 0, total: 0 };
  const posts = (s.posts || []).filter((x) => typeof x.comments === 'number');
  const baseline = !Object.keys(S.ttSeen).length && posts.length > 0;
  if (baseline) { const at = nowIso(); for (const x of posts) S.ttSeen[x.id] = { n: x.comments, at }; ustore.set('ttSeen', S.ttSeen); sync.schedule(); }
  const rows = posts.map((x) => { const seen = S.ttSeen[x.id] ? S.ttSeen[x.id].n : 0; return { post: x, count: x.comments, fresh: Math.max(0, x.comments - seen), seen: Math.min(seen, x.comments) }; });
  return { rows, baseline, posts: posts.length, total: rows.reduce((n, r) => n + r.count, 0), newTotal: rows.reduce((n, r) => n + r.fresh, 0) };
}
function ttMarkSeen() {
  const at = nowIso();
  for (const x of ((S.stats.tt && S.stats.tt.posts) || [])) if (typeof x.comments === 'number') S.ttSeen[x.id] = { n: x.comments, at };
  ustore.set('ttSeen', S.ttSeen); sync.schedule(); renderComments(); renderOrbs();
}
function ttBlock(tt) {
  if (!tt) return null;
  if (tt.loading) return h('div', { class: 'note' }, 'TikTok: loading comment counts…');
  if (tt.error) return h('div', { class: 'note err' }, 'TikTok: ' + tt.error);
  const studio = h('a', { class: 'btn sm', href: 'https://www.tiktok.com/tiktokstudio/comment', target: '_blank', rel: 'noopener' }, 'Open TikTok Studio ↗');
  const open = !!S.ttOpen;
  const label = tt.posts ? `${tt.total} comment${tt.total === 1 ? '' : 's'} · ${tt.newTotal} new` : 'no video stats yet';
  const head = h('div', { class: 'tt-row' },
    h('span', { class: 'eyebrow' }, 'TikTok comments'),
    h('button', { class: 'tt-pill' + (tt.newTotal ? ' fresh' : ''), 'aria-expanded': String(open), title: open ? 'Hide details' : 'Show details', onclick: () => { S.ttOpen = !S.ttOpen; renderComments(); } }, label, h('span', { class: 'tt-caret' }, open ? '▴' : '▾')));
  if (!open) return head;
  if (!tt.posts) return h('div', {}, head, h('div', { class: 'note' }, 'TikTok needs the video.list permission to count comments. ', studio));
  const shown = tt.rows.filter((r) => r.count > 0).sort((a, b) => b.fresh - a.fresh || new Date(b.post.at) - new Date(a.post.at)).slice(0, 8);
  return h('div', {}, head, h('div', { class: 'note' },
    h('div', {}, `${tt.total} comment${tt.total === 1 ? '' : 's'} on your last ${tt.posts} video${tt.posts === 1 ? '' : 's'} · `, h('b', {}, `${tt.newTotal} new`), ` · ${tt.total - tt.newTotal} seen`),
    tt.baseline ? h('div', {}, 'Counting starts now: comments already there are marked as seen.') : null,
    h('div', {}, 'TikTok only shares comment counts, not the comments. Read and reply in TikTok Studio.'),
    shown.length ? h('div', { class: 'tt-list' }, shown.map((r) => h('div', {}, (r.post.text || 'Video').replace(/\s+/g, ' ').slice(0, 50) + ' — ', `${r.count} comment${r.count === 1 ? '' : 's'}`, r.fresh ? h('b', {}, ` · +${r.fresh} new`) : '', ' ', r.post.url ? h('a', { href: r.post.url, target: '_blank', rel: 'noopener' }, 'open ↗') : ''))) : null,
    h('div', { class: 'row' }, tt.newTotal ? h('button', { class: 'btn sm', onclick: ttMarkSeen }, 'Mark as seen') : null, studio)));
}
function renderComments() {
  const c = S.cards.comments; if (!c) return;
  let list = S.comments;
  if (S.filter.comments !== 'all') list = list.filter((x) => x.platform === S.filter.comments);
  if (S.filter.post) list = list.filter((x) => x.post && x.post.id === S.filter.post);
  if (S.filter.unanswered) list = list.filter((x) => !(x.replies || []).length);
  const tt = ttComments();
  c.count.textContent = (S.comments.length + (tt ? tt.newTotal : 0)) || '';
  const plats = ['ig', 'fb', 'yt'].filter((p) => composer.connected(p));
  fill(c.body, 
    h('div', { class: 'card-tools' },
      h('div', { class: 'chips-row' }, ['all', ...plats].map((p) => h('button', { class: 'chip' + (S.filter.comments === p && !S.filter.post ? ' on' : ''), onclick: () => { S.filter.comments = p; S.filter.post = null; renderComments(); } }, p === 'all' ? 'All' : [pIcon(p), P[p].short]))),
      h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: S.filter.unanswered, onchange: (e) => { S.filter.unanswered = e.target.checked; renderComments(); } }), 'Unanswered')),
    ttBlock(tt),
    S.filter.post ? h('div', { class: 'note' }, 'Showing one post\'s comments · ', h('button', { class: 'linkish', onclick: () => { S.filter.post = null; renderComments(); } }, 'show all')) : null,
    S.commentsError ? h('div', { class: 'note err' }, S.commentsError) : null,
    S.commentsLoading && !S.comments.length ? h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Loading comments…') : null,
    !plats.length && !tt ? h('div', { class: 'empty' }, 'Connect Instagram, Facebook or YouTube to answer comments here.') : null,
    list.length ? h('div', { class: 'clist' }, list.slice(0, 100).map(commentRow)) : plats.length && !S.commentsLoading ? h('div', { class: 'empty' }, 'No comments to show.') : null);
}
function commentRow(cm) {
  const key = cm.platform + cm.id;
  const draft = S.replyBox[key];
  const box = draft != null ? (() => {
    const ta = h('textarea', { class: 'inp sm', rows: 2, value: draft, placeholder: 'Write a reply…' });
    ta.addEventListener('input', () => { S.replyBox[key] = ta.value; });
    return h('div', { class: 'reply-box' }, ta, h('div', { class: 'row' },
      h('button', { class: 'btn sm ghost', title: 'Emoji', onclick: (e) => toggleEmoji(e.currentTarget, (em) => insertAtCursor(ta, em)) }, '😊'),
      h('button', { class: 'btn sm gpt', onclick: () => chatgpt.open('reply', cm) }, h('span', { svg: I.spark }), 'ChatGPT'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: () => { delete S.replyBox[key]; renderComments(); } }, 'Cancel'),
      h('button', { class: 'btn sm primary', onclick: async (e) => {
        const text = (S.replyBox[key] || '').trim(); if (!text) return;
        e.currentTarget.disabled = true;
        try { await platforms.reply(cm, text); cm.replies = [...(cm.replies || []), { author: 'You', text, at: nowIso() }]; delete S.replyBox[key]; toast('Reply posted ✓'); } catch (err) { toast(err.message, 'err'); }
        renderComments();
      } }, 'Reply')));
  })() : null;
  return h('div', { class: 'cm' + (cm.hidden ? ' hidden-c' : '') },
    h('div', { class: 'cm-head' }, pIcon(cm.platform), h('b', {}, cm.author), h('span', { class: 'mono xs muted' }, ago(cm.at)), cm.likes ? h('span', { class: 'xs muted' }, '♥ ' + cm.likes) : null, h('span', { class: 'grow' }),
      cm.post && cm.post.url ? h('a', { class: 'xs link', href: cm.post.url, target: '_blank', rel: 'noopener', title: cm.post.text }, 'on: ' + ((cm.post.title || cm.post.text || '').split('\n')[0].slice(0, 28) || 'post')) : null),
    h('div', { class: 'cm-text' }, cm.text),
    (cm.replies || []).length ? h('div', { class: 'cm-replies' }, cm.replies.slice(-2).map((r) => h('div', {}, h('b', {}, r.author || 'Reply'), ' ', r.text)), cm.replies.length > 2 ? h('div', { class: 'xs muted' }, `+${cm.replies.length - 2} more`) : null) : null,
    box || h('div', { class: 'cm-act' },
      h('button', { class: 'btn sm', onclick: () => { S.replyBox[key] = ''; renderComments(); } }, 'Reply'),
      h('button', { class: 'btn sm gpt', onclick: () => { S.replyBox[key] = S.replyBox[key] || ''; chatgpt.open('reply', cm); renderComments(); } }, h('span', { svg: I.spark }), 'Draft reply'),
      ['ig', 'fb'].includes(cm.platform) ? h('button', { class: 'btn sm ghost', onclick: async () => { try { await platforms.hide(cm, !cm.hidden); cm.hidden = !cm.hidden; toast(cm.hidden ? 'Comment hidden' : 'Comment shown'); renderComments(); } catch (e) { toast(e.message, 'err'); } } }, cm.hidden ? 'Unhide' : 'Hide') : null));
}

async function loadTtCreator() {
  if (!composer.connected('tt') || S.ttCreator) return;
  try { S.ttCreator = await platforms.tiktokCreator(); composer.render(); } catch (e) { toast('TikTok: ' + e.message, 'err'); }
}

// ───────────────────────── start
function renderAll() { renderHeader(); composer.render(); renderSummary(); renderTable(); Object.keys(CARD_DEFS).forEach(renderCard); }

async function init() {
  try { S.config = { ...S.config, ...(await api('/api/config')) }; } catch (e) { toast('Server not reachable: ' + e.message, 'err'); }
  if (S.config.passcodeRequired && !S.config.passcodeOk) {
    const b = $('#banner'); b.hidden = false;
    fill(b, 'This app is protected — enter the passcode in ', h('button', { class: 'linkish', onclick: openSettings }, 'Settings'), '.');
  }
  if (DESKTOP) document.body.classList.add('is-desktop');
  $('#settingsBtn').innerHTML = I.gear;
  $('#settingsBtn').onclick = openSettings;
  $('#accountsBtn').onclick = () => openAccounts();
  $('#accountsClose').onclick = () => $('#accounts').close();
  $('#settings').addEventListener('close', () => { if ($('#settings').returnValue === 'save') saveSettingsForm(); });
  $('#backdrop').onclick = () => { const m = document.querySelector('.card.max'); if (m) toggleMax(m.dataset.card); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = document.querySelector('.card.max'); if (m) toggleMax(m.dataset.card); } });
  document.addEventListener('paste', (e) => { // paste a screenshot straight into the composer
    if (e.target.closest && e.target.closest('input, textarea, webview')) return;
    const files = [...(e.clipboardData && e.clipboardData.files || [])].filter((f) => /^(image|video)\//.test(f.type));
    if (files.length) { composer.addFiles(files); toast('Added from clipboard'); }
  });
  window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { if (!SOLO) layout(); }, 200); });

  for (const id of Object.keys(CARD_DEFS)) S.cards[id] = makeCard(id);
  if (SOLO && CARD_DEFS[SOLO]) {
    $('#shell').hidden = true; const solo = $('#solo'); solo.hidden = false; solo.append(S.cards[SOLO].el); document.body.classList.add('is-solo');
  } else layout();

  const pending = (() => { try { return JSON.parse(localStorage.getItem('sr:oauth-result') || 'null'); } catch { return null; } })();
  if (new URLSearchParams(location.search).get('connected')) history.replaceState(null, '', location.pathname + (DEMO ? '?demo=1' : ''));

  renderAll();
  sync.now();
  checkMeta();
  if (pending) handleOAuth(pending);
  const stale = PLATFORMS.some((p) => composer.connected(p) && (!S.stats[p] || Date.now() - new Date(S.stats[p].at) > 10 * 60e3));
  if (stale || DEMO) refreshStats(); else { loadComments(); inbox.load(); }
  if (S.on.tt) loadTtCreator();
}
init();
window.__sr = { linktree, S, composer, chatgpt, stories, platforms }; // for troubleshooting in the browser console
