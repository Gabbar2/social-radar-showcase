// The composer: media, caption, hashtags, platform choices and per-platform options, and the one Submit button.
import { h, $, P, PLATFORMS, I, pIcon, toast, uid, nowIso, toggleEmoji, insertAtCursor, num, DEMO , fill } from './core.js';
import { thumbOf, toJpeg, igRatioOk, padTo, hostFile, deleteHosted } from './platforms.js';

export const DEFAULT_DRAFT = () => ({
  caption: '', hashtags: '', media: [], tab: 'ig', brief: null,
  per: {
    ig: { format: 'auto', firstComment: '', shareToFeed: true, custom: '' },
    fb: { format: 'auto', firstComment: '', link: '', custom: '' },
    yt: { title: '', desc: '', tags: '', privacy: 'public', category: '28', kids: false, short: true, firstComment: '', ai: false },
    tt: { mode: 'direct', privacy: '', comment: true, duet: true, stitch: true, disclose: false, brandOwn: false, brandPartner: false, ai: false, custom: '' },
    li: { author: '', firstComment: '', link: '', custom: '' },
  },
});

const YT_CATS = [['28', 'Science & Technology'], ['26', 'Howto & Style'], ['22', 'People & Blogs'], ['24', 'Entertainment'], ['2', 'Autos & Vehicles'], ['10', 'Music'], ['17', 'Sports'], ['19', 'Travel & Events'], ['27', 'Education'], ['25', 'News & Politics']];
const TT_PRIVACY = { PUBLIC_TO_EVERYONE: 'Everyone', MUTUAL_FOLLOW_FRIENDS: 'Friends', FOLLOWER_OF_CREATOR: 'Followers', SELF_ONLY: 'Only me' };

export function createComposer(ctx) {
  const { S } = ctx;
  const D = () => S.draft;
  let running = null; // { postId, prepared, opts, caps, done, failed }
  const busy = () => !!running && !running.done && !running.failed;

  const tagList = (s) => (String(s || '').match(/#[\p{L}\p{N}_]+/gu) || []);
  const fullCaption = (p) => {
    const custom = D().per[p] && D().per[p].custom;
    if (custom && custom.trim()) return custom.trim();
    const tags = D().hashtags.trim();
    return [D().caption.trim(), tags].filter(Boolean).join('\n\n');
  };
  const hasVideo = () => D().media.some((m) => m.type === 'video');
  const images = () => D().media.filter((m) => m.type === 'image');
  const igFormat = () => { const f = D().per.ig.format; if (f !== 'auto') return f; return D().media.length > 1 ? 'carousel' : hasVideo() ? 'reel' : 'post'; };
  const fbFormat = () => { const f = D().per.fb.format; return f === 'auto' ? 'post' : f; };

  function connected(p) {
    const a = S.accounts;
    if (DEMO) return true;
    if (p === 'ig') { const pg = ctx.platforms.page(); return !!(pg && pg.ig); }
    if (p === 'fb') return !!ctx.platforms.page();
    if (p === 'yt') return !!(ctx.google.st.email);
    if (p === 'tt') return !!(a.tiktok && a.tiktok.token);
    if (p === 'li') return !!(a.linkedin && (a.linkedin.token || a.linkedin.pagesToken));
    return false;
  }
  const targets = () => PLATFORMS.filter((p) => S.on[p] && connected(p));

  // ───────── checks before Submit
  function problems() {
    const out = [];
    const d = D();
    const t = targets();
    if (!t.length) out.push({ p: null, msg: 'Choose at least one connected platform.' });
    if (!d.caption.trim() && !d.media.length && !PLATFORMS.some((p) => d.per[p].custom)) out.push({ p: null, msg: 'Add a caption or media.' });
    for (const p of t) {
      const cap = fullCaption(p);
      if (P[p].caption && cap.length > P[p].caption) out.push({ p, msg: `${P[p].name} caption is ${cap.length - P[p].caption} characters too long.` });
      if (p === 'ig') {
        if (!d.media.length) out.push({ p, msg: 'Instagram needs a photo or video.' });
        if (tagList(cap).length > 30) out.push({ p, msg: 'Instagram allows 30 hashtags at most.' });
        if (d.media.length > 10 && igFormat() !== 'story') out.push({ p, msg: 'Instagram carousels hold 10 items at most.' });
      }
      if (p === 'fb' && fbFormat() === 'reel' && !hasVideo()) out.push({ p, msg: 'A Facebook Reel needs a video.' });
      if (p === 'fb' && fbFormat() === 'story' && !d.media.length) out.push({ p, msg: 'A Facebook story needs a photo or video.' });
      if (p === 'yt') {
        if (!hasVideo()) out.push({ p, msg: 'YouTube needs a video.' });
        const title = (d.per.yt.title || d.caption.split('\n')[0] || '').trim();
        if (!title) out.push({ p, msg: 'Give the YouTube video a title.' });
        if (title.length > 100) out.push({ p, msg: 'YouTube titles are 100 characters at most.' });
        if (/[<>]/.test(title)) out.push({ p, msg: 'YouTube titles can\'t contain < or >.' });
      }
      if (p === 'tt') {
        if (!hasVideo()) out.push({ p, msg: 'TikTok needs a video.' });
        if (d.per.tt.mode === 'direct' && !d.per.tt.privacy) out.push({ p, msg: 'Choose who can see the TikTok (TikTok requires you to pick it each time).' });
        if (d.per.tt.disclose && !d.per.tt.brandOwn && !d.per.tt.brandPartner) out.push({ p, msg: 'TikTok: tick "Your brand" and/or "Branded content", or turn off the disclosure.' });
      }
      if (p === 'li' && hasVideo() && images().length) out.push({ p, msg: 'LinkedIn can\'t mix photos and a video — only the video will be posted.', warn: true });
    }
    return out;
  }

  // ───────── media
  async function addFiles(files) {
    for (const f of files) {
      if (!/^(image|video)\//.test(f.type)) { toast(f.name + ' isn\'t a photo or video.', 'err'); continue; }
      const m = { id: uid(), file: f, name: f.name, type: f.type.startsWith('video') ? 'video' : 'image', size: f.size, alt: '', preview: URL.createObjectURL(f) };
      D().media.push(m);
      Object.assign(m, await thumbOf(f));
      render();
    }
    ctx.saveDraft();
    ctx.mediaChanged && ctx.mediaChanged();
  }
  function moveMedia(id, dir) {
    const a = D().media, i = a.findIndex((m) => m.id === id), j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; render();
  }
  function removeMedia(id) {
    const m = D().media.find((x) => x.id === id);
    if (m && m.preview) URL.revokeObjectURL(m.preview);
    D().media = D().media.filter((x) => x.id !== id); render(); ctx.saveDraft(); ctx.mediaChanged && ctx.mediaChanged();
  }

  // ───────── submit
  async function submit() {
    if (busy()) return toast('Still posting the last one — wait for it to finish.');
    if (running && running.done) clearDraft(true, true);
    const probs = problems().filter((x) => !x.warn);
    if (probs.length) { render(); return toast(probs[0].msg, 'err'); }
    const d = D();
    const tg = targets();
    const post = {
      id: uid(), at: nowIso(), updatedAt: nowIso(), caption: d.caption.trim() || fullCaption(tg[0]), hashtags: d.hashtags.trim(),
      thumb: (d.media[0] && d.media[0].thumb) || null, media: d.media.map((m) => m.type), formats: {},
      targets: Object.fromEntries(tg.map((p) => [p, { status: 'waiting', stage: 'Waiting…' }])), hosted: [],
    };
    for (const p of tg) post.formats[p] = p === 'ig' ? igFormat() : p === 'fb' ? (fbFormat() === 'post' && hasVideo() ? 'video' : fbFormat()) : p === 'yt' ? (d.per.yt.short ? 'short' : 'video') : p === 'tt' ? d.per.tt.mode : 'post';
    running = { postId: post.id, prepared: null, opts: JSON.parse(JSON.stringify(d.per)), caps: Object.fromEntries(tg.map((p) => [p, fullCaption(p)])) };
    ctx.addPost(post);
    render();
    try {
      // 1 · put media where the platforms can fetch it (YouTube uploads straight from your device instead)
      const needHost = tg.some((p) => p !== 'yt') && d.media.length;
      const prepared = d.media.map((m) => ({ id: m.id, type: m.type, file: m.file, size: m.size, alt: m.alt, w: m.w, h: m.h }));
      if (needHost) {
        for (const [i, m] of prepared.entries()) {
          const label = `Uploading media ${i + 1}/${prepared.length}`;
          setUpload(label, 0);
          let blob = m.file;
          if (m.type === 'image') { const j = await toJpeg(m.file); blob = j.blob; m.w = j.w; m.h = j.h; }
          m.url = await hostFile(blob, m.name || (m.type === 'image' ? 'photo.jpg' : 'video.mp4'), (pc) => setUpload(label, pc));
          m.size = blob.size;
          post.hosted.push(m.url);
          if (m.type === 'image' && tg.includes('ig') && igFormat() !== 'story' && !igRatioOk(m.w, m.h)) {
            const padded = await padTo(blob, m.w, m.h, { min: 0.8, max: 1.91 });
            m.igUrl = await hostFile(padded.blob, 'ig-' + (m.name || 'photo.jpg'));
            post.hosted.push(m.igUrl);
          }
        }
        setUpload(null);
      }
      running.prepared = prepared;
      // 2 · every platform at once
      await Promise.all(tg.map((p) => runOne(post, p)));
    } catch (e) {
      setUpload(null);
      for (const p of tg) if (post.targets[p].status === 'waiting') Object.assign(post.targets[p], { status: 'error', error: e.message, stage: null });
      ctx.updatePost(post);
      toast(e.message, 'err');
    }
    finish(post);
  }

  async function runOne(post, p) {
    const t = post.targets[p];
    Object.assign(t, { status: 'working', stage: 'Starting…', error: null, progress: null });
    ctx.updatePost(post); renderProgress();
    try {
      const res = await ctx.platforms.publish[p]({
        media: running.prepared, caption: running.caps[p], opt: optsFor(p),
        onStage: (s) => { t.stage = s; renderProgress(); },
        onProgress: (n) => { t.progress = n; renderProgress(); },
      });
      Object.assign(t, { status: 'done', id: res.id, url: res.url || null, note: res.note || null, stage: null, progress: null, at: nowIso() });
      const fc = (running.opts[p] || {}).firstComment;
      if (fc && fc.trim()) {
        try { await ctx.platforms.firstComment(p, res, fc.trim()); t.commented = true; } catch (e) { t.note = [t.note, 'first comment failed: ' + e.message].filter(Boolean).join(' · '); }
        for (const [n, more] of ((running.opts[p] || {}).more || []).entries()) {
          if (!more || !more.trim()) continue;
          try { await ctx.platforms.firstComment(p, res, more.trim()); } catch (e) { t.note = [t.note, `comment ${n + 2} failed: ` + e.message].filter(Boolean).join(' · '); }
        }
      }
    } catch (e) {
      Object.assign(t, { status: 'error', error: e.message, stage: null, progress: null });
    }
    post.updatedAt = nowIso();
    ctx.updatePost(post); renderProgress();
  }

  function optsFor(p) {
    const o = { ...running.opts[p] };
    if (p === 'ig') o.format = o.format === 'auto' ? (running.prepared.length > 1 ? 'carousel' : running.prepared.some((m) => m.type === 'video') ? 'reel' : 'post') : o.format;
    if (p === 'fb') o.format = o.format === 'auto' ? 'post' : o.format;
    if (p === 'li') o.author = o.author || (S.accounts.linkedin && S.accounts.linkedin.author);
    return o;
  }

  async function retry(p) {
    const post = S.posts.find((x) => x.id === (running && running.postId));
    if (!post || !running || !running.prepared) return toast('Submit again to retry.');
    await runOne(post, p);
    finish(post);
  }

  function finish(post) {
    const all = Object.values(post.targets);
    if (all.some((t) => t.status === 'working' || t.status === 'waiting')) return;
    const ok = all.filter((t) => t.status === 'done').length, bad = all.length - ok;
    if (!bad) {
      toast(`Posted to ${ok} platform${ok === 1 ? '' : 's'} ✓`);
      if (S.settings.autoDelete !== false) { deleteHosted(post.hosted); post.hosted = []; ctx.updatePost(post); }
      running.done = true; running.failed = false;
    } else { toast(`${ok} posted, ${bad} failed — see the details under Submit.`, 'err'); running.failed = true; }
    render();
    setTimeout(() => ctx.refreshStats(), DEMO ? 1500 : 20000);
  }

  function clearDraft(keepMedia, keepText) {
    const post = running && S.posts.find((x) => x.id === running.postId);
    if (post && post.hosted && post.hosted.length) { deleteHosted(post.hosted); post.hosted = []; ctx.updatePost(post); }
    running = null;
    if (!keepMedia) D().media.forEach((m) => m.preview && URL.revokeObjectURL(m.preview));
    if (keepText) { ctx.saveDraft(); return; }
    const fresh = DEFAULT_DRAFT();
    fresh.per.li.author = D().per.li.author;
    if (keepMedia) fresh.media = D().media;
    S.draft = fresh;
    ctx.saveDraft(); render();
  }

  // ───────── apply ChatGPT output
  function applyFields(f) {
    const d = D();
    if (f.caption != null) d.caption = f.caption;
    if (f.hashtags != null) d.hashtags = f.hashtags;
    if (f.alt) images().forEach((m, i) => { if (f.alt[i] != null) m.alt = f.alt[i]; else if (f.alt.length === 1 && i === 0) m.alt = f.alt[0]; });
    if (f.ytTitle != null) d.per.yt.title = f.ytTitle.slice(0, 100);
    if (f.ytTags != null) d.per.yt.tags = f.ytTags;
    if (f.ytDesc != null) d.per.yt.desc = f.ytDesc;
    if (f.firstComment != null) {
      const t = ctx.commentTarget; ctx.commentTarget = null;
      if (t && d.per[t.p]) { d.per[t.p].more = d.per[t.p].more || []; d.per[t.p].more[t.i] = f.firstComment; }
      else for (const p of ['ig', 'fb', 'yt', 'li']) if (S.on[p]) d.per[p].firstComment = f.firstComment;
    }
    for (const p of PLATFORMS) if (f['custom_' + p] != null) d.per[p].custom = f['custom_' + p];
    ctx.saveDraft(); render();
    const c = $('#console'); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
  }

  // ───────── rendering
  let uploadState = null;
  function setUpload(label, pc) { uploadState = label ? { label, pc } : null; renderProgress(); }

  function field(label, input, extra) { return h('label', { class: 'f' }, h('span', {}, label, extra || null), input); }
  function bindInput(obj, key, el, after) {
    el.addEventListener('input', () => { obj[key] = el.type === 'checkbox' ? el.checked : el.value; ctx.saveDraft(); after ? after() : updateCounters(); });
    if (el.tagName === 'SELECT' || el.type === 'checkbox') el.addEventListener('change', () => { obj[key] = el.type === 'checkbox' ? el.checked : el.value; ctx.saveDraft(); render(); });
    return el;
  }

  function counters() {
    const t = PLATFORMS.filter((p) => S.on[p]);
    return h('div', { class: 'counters' }, t.map((p) => {
      const n = fullCaption(p).length, max = P[p].caption;
      return h('span', { class: 'cnt' + (n > max ? ' over' : n > max * 0.9 ? ' near' : ''), title: `${P[p].name}: ${n} of ${max} characters` }, pIcon(p), num(n), h('i', {}, '/' + num(max)));
    }), tagList(fullCaption('ig')).length ? h('span', { class: 'cnt' + (tagList(fullCaption('ig')).length > 30 ? ' over' : ''), title: 'Hashtags (Instagram allows 30)' }, '#', tagList(fullCaption('ig')).length) : null);
  }

  function mediaBox() {
    const input = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Add photos or videos', onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
      h('div', { class: 'drop-ico', svg: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 16V5m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>' }),
      h('div', {}, h('b', {}, 'Add photos or video'), h('div', { class: 'muted xs' }, 'Drop files here or tap to choose · JPG, PNG, MP4, MOV')));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
    const list = h('div', { class: 'media-list' }, D().media.map((m, i) => {
      const badIg = S.on.ig && m.type === 'image' && m.w && !igRatioOk(m.w, m.h) && igFormat() !== 'story';
      return h('div', { class: 'media-item' },
        h('div', { class: 'mi-thumb', style: m.thumb ? { 'background-image': `url("${m.thumb}")` } : {} }, m.type === 'video' ? h('span', { class: 'mi-badge' }, '▶ ' + (m.dur ? Math.round(m.dur) + 's' : 'video')) : null, h('span', { class: 'mi-n' }, i + 1)),
        h('div', { class: 'mi-body' },
          h('div', { class: 'mi-name', title: m.name }, m.name),
          h('div', { class: 'xs muted' }, [m.w ? `${m.w}×${m.h}` : null, (m.size / 1048576).toFixed(1) + ' MB'].filter(Boolean).join(' · '), badIg ? h('span', { class: 'warn' }, ' · padded to fit Instagram') : null),
          m.type === 'image' ? bindInput(m, 'alt', h('input', { class: 'inp xs-in', placeholder: 'Alt text (describes the photo for screen readers)', value: m.alt })) : h('div', { class: 'xs muted', title: 'Instagram and Facebook have no alt-text field for videos. Use captions/subtitles instead.' }, 'Video · Meta has no alt text for videos (use captions)')),
        h('div', { class: 'mi-act' },
          h('button', { class: 'icon-btn', title: 'Move left', 'aria-label': 'Move earlier', onclick: () => moveMedia(m.id, -1), disabled: i === 0 }, '‹'),
          h('button', { class: 'icon-btn', title: 'Move right', 'aria-label': 'Move later', onclick: () => moveMedia(m.id, 1), disabled: i === D().media.length - 1 }, '›'),
          h('button', { class: 'icon-btn', title: 'Remove', 'aria-label': 'Remove', onclick: () => removeMedia(m.id), svg: I.close })));
    }));
    return h('div', { class: 'media-box' }, input, drop, D().media.length ? list : null, ctx.clips ? ctx.clips.view() : null);
  }

  function platformChips() {
    return h('div', { class: 'pchips' }, PLATFORMS.map((p) => {
      const ok = connected(p);
      const name = accountName(p);
      return h('button', {
        type: 'button', class: 'pchip' + (S.on[p] && ok ? ' on' : '') + (ok ? '' : ' off'), style: { '--c': P[p].color },
        title: ok ? (S.on[p] ? 'Click to leave out ' : 'Click to include ') + P[p].name : 'Connect ' + P[p].name + ' under Accounts',
        'aria-pressed': String(!!(S.on[p] && ok)),
        onclick: () => { if (!ok) return ctx.openAccounts(p); S.on[p] = !S.on[p]; if (S.on[p]) D().tab = p; ctx.saveOn(); render(); },
      }, h('span', { class: 'pc-ico', svg: I[p] }), h('span', { class: 'pc-txt' }, h('b', {}, P[p].name), h('small', {}, ok ? name : 'Connect')), h('span', { class: 'pc-check' }, S.on[p] && ok ? '✓' : ''));
    }));
  }
  function accountName(p) {
    const a = S.accounts;
    if (DEMO) return { ig: '@acmestudio', fb: 'Acme Studio', yt: 'Acme Studio Global', tt: '@acmestudio', li: 'Acme Studio' }[p];
    const pg = ctx.platforms.page();
    if (p === 'ig') return pg && pg.ig ? '@' + pg.ig.username : '';
    if (p === 'fb') return pg ? pg.name : '';
    if (p === 'yt') return (a.youtube && a.youtube.title) || ctx.google.st.email || '';
    if (p === 'tt') return a.tiktok && a.tiktok.user ? '@' + (a.tiktok.user.username || a.tiktok.user.name) : 'Connected';
    if (p === 'li') { const l = a.linkedin; if (!l) return ''; const org = (l.orgs || []).find((o) => o.urn === l.author); return org ? org.name : (l.person && l.person.name) || 'Connected'; }
    return '';
  }

  // First comment + extra comments (each can be drafted with ChatGPT; "+" only works once the previous box is filled)
  function commentsBlock(p, o) {
    o.more = Array.isArray(o.more) ? o.more : [];
    const rows = [{ get: () => o.firstComment || '', set: (v) => { o.firstComment = v; }, label: 'First comment', ph: 'Posted as a comment right after publishing (links, extra hashtags…)', idx: -1 }]
      .concat(o.more.map((_, i) => ({ get: () => o.more[i] || '', set: (v) => { o.more[i] = v; }, label: `Comment ${i + 2}`, ph: 'Posted right after the previous comment…', idx: i })));
    const lastFilled = () => rows[rows.length - 1].get().trim().length > 0;
    let plus;
    const syncPlus = () => { if (plus) { plus.disabled = !lastFilled(); plus.title = lastFilled() ? 'Add another comment' : 'Fill in the box above first'; } };
    plus = h('button', { class: 'btn sm cmt-plus', type: 'button', onclick: () => { if (!lastFilled()) return toast('Fill in the previous comment first', 'err'); o.more.push(''); ctx.saveDraft(); render(); } }, '+ Add comment');
    syncPlus();
    return h('div', { class: 'f span2 cmts' }, rows.map((r) => {
      const inp = h('input', { class: 'inp', placeholder: r.ph, value: r.get() });
      inp.addEventListener('input', () => { r.set(inp.value); ctx.saveDraft(); syncPlus(); });
      return h('div', { class: 'cmt-row' }, h('span', { class: 'cmt-lbl' }, r.label, r.idx < 0 ? h('em', { class: 'tag' }, 'optional') : null),
        h('div', { class: 'cmt-line' }, inp,
          h('button', { class: 'btn sm gpt', type: 'button', title: 'Draft this comment with ChatGPT', onclick: () => { ctx.commentTarget = r.idx < 0 ? null : { p, i: r.idx }; ctx.askGpt('comment'); } }, h('span', { svg: I.spark }), 'ChatGPT'),
          r.idx >= 0 ? h('button', { class: 'icon-btn', type: 'button', title: 'Remove this comment', onclick: () => { o.more.splice(r.idx, 1); ctx.saveDraft(); render(); } }, '×') : null));
    }), plus);
  }

  function tabPanel(p) {
    const o = D().per[p];
    const custom = ['ig', 'fb', 'tt', 'li'].includes(p) ? h('label', { class: 'f span2' }, h('span', {}, `Custom ${P[p].name} caption`, h('em', { class: 'tag' }, 'optional — leave empty to use the main caption + hashtags')),
      bindInput(o, 'custom', h('textarea', { class: 'inp', rows: 3, placeholder: fullCaption('_') || 'Same as the main caption', value: o.custom }), () => updateCounters())) : null;
    const fc = ['ig', 'fb', 'yt', 'li'].includes(p) ? commentsBlock(p, o) : null;
    const sel = (key, opts) => bindInput(o, key, h('select', { class: 'inp' }, opts.map(([v, l]) => h('option', { value: v, selected: o[key] === v }, l))));
    const chk = (key, label, title) => h('label', { class: 'f inline', title }, bindInput(o, key, h('input', { type: 'checkbox', checked: !!o[key] })), label);
    let body;
    if (p === 'ig') body = [
      field('Post as', sel('format', [['auto', `Automatic (${{ post: 'photo post', reel: 'Reel', carousel: 'carousel' }[igFormat()] || igFormat()})`], ['post', 'Feed post / carousel'], ['reel', 'Reel (video)'], ['story', 'Story']])),
      igFormat() === 'reel' ? chk('shareToFeed', 'Also show the Reel in the main feed') : null,
      igFormat() === 'story' ? h('p', { class: 'note span2' }, 'Stories posted from here have no link, mention or poll stickers (Instagram\'s API doesn\'t allow them). For a link sticker, use the Stories & reshare card → Send to phone.') : null,
      fc, custom];
    if (p === 'fb') body = [
      field('Post as', sel('format', [['auto', 'Post (photo, album, video or text)'], ['reel', 'Reel (video)'], ['story', 'Story']])),
      fbFormat() === 'post' && !D().media.length ? field('Link', bindInput(o, 'link', h('input', { class: 'inp', type: 'url', placeholder: 'https://example.com/…', value: o.link })), h('em', { class: 'tag' }, 'shows a link preview')) : null,
      fc, custom];
    if (p === 'yt') body = [
      field('Title', bindInput(o, 'title', h('input', { class: 'inp', maxlength: 100, placeholder: (D().caption.split('\n')[0] || 'Video title').slice(0, 100), value: o.title })), h('em', { class: 'tag' }, `${(o.title || '').length}/100`)),
      field('Visibility', sel('privacy', [['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']])),
      field('Tags', bindInput(o, 'tags', h('input', { class: 'inp', placeholder: 'speaker, audio, acme studio', value: o.tags })), h('em', { class: 'tag' }, 'comma separated')),
      field('Category', sel('category', YT_CATS)),
      h('label', { class: 'f span2' }, h('span', {}, 'Description', h('em', { class: 'tag' }, 'leave empty to use the caption + hashtags')), bindInput(o, 'desc', h('textarea', { class: 'inp', rows: 3, placeholder: fullCaption('_') || 'Description', value: o.desc }))),
      h('div', { class: 'span2 row wrap' }, chk('short', 'YouTube Short (vertical, up to 3 min)'), chk('kids', 'Made for kids'), chk('ai', 'Altered or synthetic content', 'YouTube asks you to label realistic AI-made or altered content')),
      fc];
    if (p === 'tt') {
      const cr = S.ttCreator;
      const opts = (cr && cr.privacy_level_options) || Object.keys(TT_PRIVACY);
      body = [
        field('Send as', sel('mode', [['direct', 'Post directly to TikTok'], ['inbox', 'Send to TikTok drafts (finish in the app)']])),
        o.mode === 'direct' ? field('Who can see it', bindInput(o, 'privacy', h('select', { class: 'inp' + (!o.privacy ? ' need' : '') }, h('option', { value: '' }, 'Choose…'), opts.map((v) => h('option', { value: v, selected: o.privacy === v }, TT_PRIVACY[v] || v)))), h('em', { class: 'tag' }, cr && cr.creator_nickname ? 'as @' + (cr.creator_username || cr.creator_nickname) : '')) : null,
        o.mode === 'direct' ? h('div', { class: 'span2 row wrap' }, chk('comment', 'Allow comments'), chk('duet', 'Allow Duet'), chk('stitch', 'Allow Stitch'), chk('ai', 'AI-generated content')) : null,
        o.mode === 'direct' ? h('div', { class: 'span2 row wrap' }, chk('disclose', 'Disclose commercial content'), o.disclose ? chk('brandOwn', 'Your brand (promotional)') : null, o.disclose ? chk('brandPartner', 'Branded content (paid partnership)') : null) : null,
        o.mode === 'inbox'
          ? h('p', { class: 'note span2' }, 'The video lands in your TikTok inbox. Open the TikTok app, tap the notification, add sounds, text and stickers, and post it publicly. This works before TikTok approves your app.')
          : h('p', { class: 'note span2' }, 'Until TikTok approves (audits) your app, direct posts are only visible to you. Use "Send to TikTok drafts" to post publicly from the app.', o.disclose && o.brandPartner ? ' By posting, you agree to TikTok\'s Branded Content Policy.' : ' By posting, you agree to TikTok\'s Music Usage Confirmation.'),
        custom];
    }
    if (p === 'li') {
      const l = S.accounts.linkedin;
      const authors = DEMO ? [['urn:li:organization:1', 'Acme Studio (company page)'], ['urn:li:person:x', 'Your Name (you)']] : l ? [...(l.orgs || []).map((x) => [x.urn, x.name + ' (company page)']), ...(l.person.urn ? [[l.person.urn, (l.person.name || 'You') + ' (you)']] : [])] : [];
      if (!o.author && authors[0]) o.author = authors[0][0];
      body = [
        field('Post as', sel('author', authors)),
        !D().media.length ? field('Link', bindInput(o, 'link', h('input', { class: 'inp', type: 'url', placeholder: 'https://example.com/…', value: o.link })), h('em', { class: 'tag' }, 'shown as an article card')) : null,
        fc, custom];
    }
    return h('div', { class: 'tab-panel fields' }, body);
  }

  function renderProgress() {
    const box = $('#progressBox');
    if (!box) return;
    const post = running && S.posts.find((x) => x.id === running.postId);
    if (!post && !uploadState) { fill(box, ); box.hidden = true; return; }
    box.hidden = false;
    fill(box, 
      uploadState ? h('div', { class: 'prow' }, h('span', { class: 'spin' }), h('span', { class: 'grow' }, uploadState.label + '…'), h('span', { class: 'mono xs' }, (uploadState.pc || 0) + '%'), h('div', { class: 'pbar' }, h('i', { style: { width: (uploadState.pc || 0) + '%' } }))) : null,
      post ? Object.entries(post.targets).map(([p, t]) => h('div', { class: 'prow st-' + t.status },
        pIcon(p), h('b', {}, P[p].name),
        h('span', { class: 'grow' },
          t.status === 'working' ? [h('span', { class: 'spin' }), ' ', t.stage || 'Working…'] : null,
          t.status === 'waiting' ? h('span', { class: 'muted' }, 'Waiting for media…') : null,
          t.status === 'done' ? [h('span', { class: 'ok' }, '✓ Posted'), t.note ? h('span', { class: 'muted' }, ' · ' + t.note) : null] : null,
          t.status === 'error' ? h('span', { class: 'err-t' }, '✕ ' + t.error) : null),
        t.status === 'done' && t.url ? h('a', { class: 'btn sm', href: t.url, target: '_blank', rel: 'noopener' }, 'Open') : null,
        t.status === 'error' ? h('button', { class: 'btn sm', onclick: () => retry(p) }, 'Retry') : null,
        t.progress != null && t.status === 'working' ? h('div', { class: 'pbar' }, h('i', { style: { width: t.progress + '%' } })) : null)) : null,
      post && !Object.values(post.targets).some((t) => t.status === 'working' || t.status === 'waiting')
        ? h('div', { class: 'row', style: { 'margin-top': '6px' } }, h('span', { class: 'grow muted small' }, 'Done. Start the next post when you\'re ready.'), h('button', { class: 'btn sm', onclick: () => clearDraft(true) }, 'New post, same media'), h('button', { class: 'btn sm primary', onclick: () => clearDraft(false) }, 'New post'))
        : null);
  }

  function probList() { const probs = problems(); return probs.length ? h('ul', { class: 'probs', id: 'probs' }, probs.map((x) => h('li', { class: x.warn ? 'warn' : '' }, x.p ? pIcon(x.p) : '•', ' ', x.msg))) : h('div', { id: 'probs' }); }
  let probT;
  function updateCounters() {
    const c = $('#counters'); if (c) c.replaceWith(Object.assign(counters(), { id: 'counters' }));
    clearTimeout(probT); probT = setTimeout(() => { const p = $('#probs'); if (p) p.replaceWith(probList()); }, 250);
  }

  function render() {
    const host = $('#composer');
    if (!host) return;
    const d = D();
    const cap = h('textarea', { id: 'caption', class: 'inp caption', rows: 7, placeholder: 'Write the caption… (Tip: ✨ asks ChatGPT to polish it, write hashtags, alt text and YouTube tags)', value: d.caption });
    cap.addEventListener('input', () => { d.caption = cap.value; ctx.saveDraft(); updateCounters(); });
    const tags = h('input', { id: 'hashtags', class: 'inp', placeholder: '#AcmeStudio #NewIn #Audio', value: d.hashtags });
    tags.addEventListener('input', () => { d.hashtags = tags.value; ctx.saveDraft(); updateCounters(); });
    const emojiBtn = h('button', { type: 'button', class: 'btn sm ghost', title: 'Emoji', onclick: (e) => toggleEmoji(e.currentTarget, (em) => insertAtCursor(cap, em)) }, '😊');
    const on = PLATFORMS.filter((p) => S.on[p] && connected(p));
    if (!on.includes(d.tab)) d.tab = on[0] || 'ig';
    const probs = problems();
    fill(host, 
      h('div', { class: 'comp-grid' },
        h('div', { class: 'comp-media' }, h('div', { class: 'sec-label' }, 'Media'), mediaBox()),
        h('div', { class: 'comp-text' },
          h('div', { class: 'sec-label row' }, h('span', { class: 'grow' }, 'Caption'), emojiBtn,
            h('button', { type: 'button', class: 'btn sm gpt', title: 'Optimise caption, hashtags, alt text and YouTube tags with ChatGPT', onclick: () => ctx.askGpt('all') }, h('span', { svg: I.spark }), 'Optimise with ChatGPT')),
          cap,
          ctx.brief ? ctx.brief.chip() : null,
          h('div', { class: 'row' }, h('div', { class: 'grow' }, tags), h('button', { type: 'button', class: 'btn sm ghost', title: 'Ask ChatGPT for hashtags', onclick: () => ctx.askGpt('hashtags') }, '# ✨')),
          Object.assign(counters(), { id: 'counters' }))),
      h('div', { class: 'sec-label' }, 'Post to'),
      platformChips(),
      on.length ? h('div', { class: 'ptabs', role: 'tablist' }, on.map((p) => h('button', { type: 'button', role: 'tab', class: 'ptab' + (d.tab === p ? ' on' : ''), style: { '--c': P[p].color }, 'aria-selected': String(d.tab === p), onclick: () => { d.tab = p; render(); if (p === 'tt') ctx.loadTtCreator(); } }, pIcon(p), P[p].name, probs.some((x) => x.p === p && !x.warn) ? h('span', { class: 'dot-bad', title: 'Needs attention' }) : null))) : null,
      on.length ? tabPanel(d.tab) : null,
      probList(),
      h('div', { class: 'submit-row' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (confirm('Clear the caption, media and options?')) clearDraft(false); } }, 'Clear'),
        h('button', { type: 'button', id: 'submitBtn', class: 'btn primary big submit', disabled: busy(), onclick: submit },
          h('span', { svg: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 11.5 21 3l-6.5 18-3.2-7.3z"/></svg>' }),
          busy() ? 'Posting…' : on.length ? `Submit to ${on.length === 5 ? 'all 5 platforms' : on.map((p) => P[p].name).join(', ')}` : 'Submit')),
      h('div', { id: 'progressBox', class: 'progress', hidden: true }));
    renderProgress();
  }

  return { render, submit, applyFields, fullCaption, igFormat, targets, connected, addFiles, removeMedia, images, clearDraft, accountName };
}
