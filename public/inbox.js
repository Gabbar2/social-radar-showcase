// The Inbox card: Instagram DMs and Facebook Messenger in one list (read + reply, with ChatGPT drafting),
// plus shortcuts to the inboxes TikTok, LinkedIn and YouTube do not let apps read.
import { h, I, pIcon, toast, ago, fill, nowIso, toggleEmoji, insertAtCursor } from './core.js';

const OTHER = [
  ['fb', 'Business Suite inbox (Instagram + Facebook)', 'https://business.facebook.com/latest/inbox/all'],
  ['ig', 'Instagram inbox', 'https://www.instagram.com/direct/inbox/'],
  ['tt', 'TikTok messages', 'https://www.tiktok.com/messages'],
  ['li', 'LinkedIn messages', 'https://www.linkedin.com/messaging/'],
  ['yt', 'YouTube Studio', 'https://studio.youtube.com/'],
];

export function createInbox(ctx) {
  const { S, platforms } = ctx;
  const st = { convs: [], errors: [], loading: false, at: null, filter: 'all', unread: false, open: null, thread: [], tLoading: false, box: {} };
  const connected = () => ['ig', 'fb'].some((p) => ctx.composer.connected(p));
  const seen = () => { try { return JSON.parse(localStorage.getItem('sr-inbox-seen') || '{}'); } catch { return {}; } };
  const markSeen = (c) => { try { const m = seen(); m[c.id] = c.at; localStorage.setItem('sr-inbox-seen', JSON.stringify(m)); } catch { /* ignore */ } };
  // ── local record of conversations, used to spot messages/conversations that later disappear from Meta
  const AK = 'sr-inbox-archive-v1';
  const readArch = () => { try { return JSON.parse(localStorage.getItem(AK) || '{}'); } catch { return {}; } };
  const arch = readArch();
  const saveArch = () => { try { localStorage.setItem(AK, JSON.stringify(arch)); } catch { /* storage full or blocked */ } };
  const goneOf = (id) => Object.values((arch[id] || {}).gone || {});
  const deletedCount = () => Object.values(arch).reduce((n, a) => n + Object.keys(a.gone || {}).length + (a.convGone ? 1 : 0), 0);
  async function scan(list, ok) {
    const now = nowIso();
    const listed = new Set(list.map((c) => c.id));
    const pool = list.slice(0, 15);
    let next = 0;
    const worker = async () => {
      while (next < pool.length) {
        const c = pool[next++];
        let msgs;
        try { msgs = await platforms.inboxThread(c); } catch { continue; }
        if (!msgs.length) continue;
        const a = arch[c.id] || (arch[c.id] = { msgs: {}, gone: {}, first: now });
        Object.assign(a, { platform: c.platform, name: c.name, userId: c.userId, at: c.at, convGone: null });
        const ids = new Set(msgs.map((m) => m.id));
        const oldest = Math.min(...msgs.map((m) => Date.parse(m.at)));
        const full = msgs.length < 25;           // the whole conversation was returned
        for (const [id, m] of Object.entries(a.msgs)) {
          if (ids.has(id) || a.gone[id]) continue;
          if (full || Date.parse(m.at) > oldest) a.gone[id] = { ...m, goneAt: now };
        }
        for (const m of msgs) { a.msgs[m.id] = { id: m.id, text: m.text, at: m.at, me: m.me, att: m.att }; if (a.gone[m.id]) delete a.gone[m.id]; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    // conversations that vanished from the list
    const oldestListed = {};
    for (const c of list) oldestListed[c.platform] = Math.min(oldestListed[c.platform] || Infinity, Date.parse(c.at));
    for (const [id, a] of Object.entries(arch)) {
      if (listed.has(id) || a.convGone || !ok[a.platform]) continue;
      if (ok[a.platform].complete || Date.parse(a.at) > (oldestListed[a.platform] || 0)) a.convGone = now;
    }
    saveArch();
  }
  const isNew = (c) => !c.fromMe && seen()[c.id] !== c.at;
  const count = () => st.convs.filter((c) => !c.fromMe && (seen()[c.id] || '') !== c.at).length;

  async function load() {
    if (!connected()) { render(); return; }
    st.loading = true; render();
    try { const r = await platforms.inboxList(); st.convs = r.convs; st.errors = r.errors; st.at = nowIso(); render(); await scan(r.convs, r.ok || {}); } catch (e) { st.errors = [e.message]; }
    st.loading = false; render(); ctx.renderOrbs && ctx.renderOrbs();
  }
  async function openConv(c) {
    st.open = c.id; st.thread = []; st.tLoading = true; markSeen(c); render();
    if (c.convGone) st.thread = Object.values((arch[c.id] || {}).msgs || {});
    else { try { st.thread = await platforms.inboxThread(c); } catch (e) { toast(e.message, 'err'); } }
    st.tLoading = false; render();
  }
  const cm = (c) => ({ platform: c.platform, id: c.id, dm: true, author: c.name, text: (st.thread.filter((m) => !m.me).slice(-1)[0] || {}).text || c.snippet });

  function convRow(c) {
    const open = st.open === c.id;
    const key = 'dm' + c.id;
    const draft = st.box[key];
    const head = h('button', { class: 'dm-head' + (isNew(c) ? ' new' : ''), type: 'button', onclick: () => (open ? (st.open = null, render()) : openConv(c)) },
      pIcon(c.platform), h('b', {}, c.name), h('span', { class: 'mono xs muted' }, ago(c.at)), h('span', { class: 'grow' }),
      c.convGone ? h('span', { class: 'dm-del', title: 'This conversation was in Meta before and is gone now' }, 'Deleted in Meta') : goneOf(c.id).length ? h('span', { class: 'dm-del' }, `${goneOf(c.id).length} deleted in Meta`) : null,
      isNew(c) ? h('span', { class: 'dm-dot', title: 'New' }) : null,
      h('span', { class: 'dm-snip' }, (c.fromMe ? 'You: ' : '') + c.snippet));
    if (!open) return h('div', { class: 'dm' }, head);
    const ta = h('textarea', { class: 'inp sm', rows: 2, value: draft || '', placeholder: 'Write a reply…' });
    ta.addEventListener('input', () => { st.box[key] = ta.value; });
    const send = h('button', { class: 'btn sm primary', type: 'button', onclick: async () => {
      const text = (st.box[key] || '').trim(); if (!text) return toast('Write a reply first', 'err');
      send.disabled = true;
      try { await platforms.inboxSend(c, text); st.thread = [...st.thread, { id: 'n' + Date.now(), text, at: nowIso(), me: true }]; delete st.box[key]; c.fromMe = true; c.snippet = text; c.at = nowIso(); markSeen(c); toast('Message sent ✓'); }
      catch (e) { toast(e.message, 'err'); send.disabled = false; return; }
      render();
    } }, 'Send');
    return h('div', { class: 'dm open' }, head,
      h('div', { class: 'dm-thread' }, st.tLoading ? h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Loading…') : [...st.thread, ...goneOf(c.id)].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).map((m) => h('div', { class: 'dm-msg' + (m.me ? ' me' : '') + (m.goneAt ? ' del' : '') }, m.goneAt ? h('span', { class: 'dm-del' }, 'Deleted in Meta') : null, m.text || (m.att ? '📎 attachment' : ''), h('small', {}, ago(m.at) + (m.goneAt ? ` · noticed missing ${ago(m.goneAt)} ago` : ''))))),
      h('div', { class: 'reply-box' }, ta, h('div', { class: 'row' },
        h('button', { class: 'btn sm ghost', type: 'button', title: 'Emoji', onclick: (e) => toggleEmoji(e.currentTarget, (em) => { insertAtCursor(ta, em); st.box[key] = ta.value; }) }, '😊'),
        h('button', { class: 'btn sm gpt', type: 'button', onclick: () => { st.box[key] = ta.value; ctx.askGpt('reply', cm(c)); } }, h('span', { svg: I.spark }), 'Draft reply'),
        h('span', { class: 'grow' }), send),
      h('p', { class: 'xs muted' }, 'Meta only allows replies within 24 hours of the customer\'s last message.')));
  }

  function render() {
    const c = S.cards.inbox; if (!c) return;
    const plats = ['ig', 'fb'].filter((p) => ctx.composer.connected(p));
    const listed = new Set(st.convs.map((x) => x.id));
    const gone = Object.entries(arch).filter(([id, a]) => a.convGone && !listed.has(id)).map(([id, a]) => ({ platform: a.platform, id, userId: a.userId, name: a.name, snippet: (Object.values(a.msgs).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0] || {}).text || '', at: a.at, fromMe: true, convGone: true }));
    let list = [...st.convs, ...gone].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
    if (st.delOnly) list = list.filter((x) => x.convGone || goneOf(x.id).length);
    if (st.filter !== 'all') list = list.filter((x) => x.platform === st.filter);
    if (st.unread) list = list.filter((x) => !x.fromMe && (seen()[x.id] || '') !== x.at);
    c.count.textContent = count() || '';
    fill(c.body,
      h('div', { class: 'card-tools' },
        h('div', { class: 'chips-row' }, ['all', ...plats].map((p) => h('button', { class: 'chip' + (st.filter === p ? ' on' : ''), type: 'button', onclick: () => { st.filter = p; render(); } }, p === 'all' ? 'All' : p === 'ig' ? 'Instagram' : 'Messenger'))),
        h('label', { class: 'tog', title: 'Messages or chats that were in Meta before and are gone now' }, h('input', { type: 'checkbox', checked: !!st.delOnly, onchange: (e) => { st.delOnly = e.target.checked; render(); } }), `Deleted in Meta${deletedCount() ? ' (' + deletedCount() + ')' : ''}`),
        h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.unread, onchange: (e) => { st.unread = e.target.checked; render(); } }), 'New only')),
      h('div', { class: 'dm-links' }, h('span', { class: 'eyebrow' }, 'Other inboxes'), OTHER.map(([p, label, href]) => h('a', { class: 'btn sm', href, target: '_blank', rel: 'noopener' }, pIcon(p), label + ' ↗')),
        h('span', { class: 'xs muted' }, 'TikTok, LinkedIn and YouTube do not let apps read messages, so these open their own inbox.')),
      st.errors.length ? h('div', { class: 'note err' }, [...new Set(st.errors)].join(' · '),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => ctx.connectMessaging() }, 'Allow messages (reconnect Facebook)'),
          h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { const r = await platforms.metaPermissions(); const g = (n) => (r.perms.find((x) => x.permission === n) || {}).status || 'not asked'; st.diag = ['pages_messaging', 'instagram_manage_messages', 'instagram_basic', 'pages_manage_metadata'].map((n) => `${n}: ${g(n)}`).join(' · ') + ` · Instagram linked to Page: ${r.igLinked}`; } catch (e) { st.diag = e.message; } render(); } }, 'Check what Meta granted'),
          h('span', { class: 'xs muted' }, 'If Facebook says "Invalid Scopes", add the Messenger and Instagram messaging use cases in your Meta app first (see README).'))) : null,
      st.loading && !st.convs.length ? h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Loading messages… Instagram can take up to a minute') : null,
      st.diag ? h('div', { class: 'note' }, st.diag) : null,
      !plats.length ? h('div', { class: 'empty' }, 'Connect Instagram or Facebook (Accounts) to read and answer messages here.') : null,
      h('div', { class: 'note' }, 'Deleted in Meta: every refresh the app remembers your recent Messenger chats in this browser and flags anything that later disappears. It can\'t say who deleted it, and only covers the time since you started using this version.'),
      list.length ? h('div', { class: 'dmlist' }, list.slice(0, 60).map(convRow)) : plats.length && !st.loading ? h('div', { class: 'empty' }, 'No messages to show.') : null);
  }
  const setBox = (c, text) => { st.box['dm' + c.id] = text; st.open = c.id; render(); ctx.focusCard('inbox'); };
  return { render, load, count, setBox };
}
