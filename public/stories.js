// Stories & reshare card.
// • Create: a 9:16 story with text and emoji you place yourself, posted to Instagram/Facebook stories by the API,
//   or sent to your phone so you can add the link sticker (the API can't add stickers).
// • Phone queue: on your phone, each story has Copy link → Share to Instagram → paste into the Link sticker.
// • Reshare: turn one of your recent posts into a story, or open it in the app to use Instagram's own "Add to story".
import { h, $, I, P, pIcon, toast, uid, nowIso, ago, copyText, toggleEmoji, touchDevice, DEMO , fill } from './core.js';
import { hostFile, deleteHosted } from './platforms.js';

const W = 1080, H = 1920;
const COLORS = ['#ffffff', '#111111', '#e8609c', '#f5c542', '#2ad4d9', '#5b7cfa', '#ff5a4e', '#4cc38a'];
const BGS = [['#1d1b2e', '#7a3fa0'], ['#0f2f73', '#2f8fe0'], ['#5e0c40', '#e0379f'], ['#06433a', '#22b39c'], ['#3a2a0a', '#e0a83a'], ['#111', '#444']];

function loadImg(src, cors) {
  return new Promise((res, rej) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });
}

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

export function createStories(ctx) {
  const { S } = ctx;
  const st = {
    tab: new URLSearchParams(location.search).get('tab') || 'create',
    src: null, // { kind: 'image'|'video', file?, url, img?, name }
    fit: 'contain', bg: 0, overlays: [], sel: null,
    link: '', linkLabel: '', note: '', to: { ig: true, fb: false }, busy: false,
    qrFor: null, // reshare row showing its scan-to-open QR
    files: new Map(), // phone queue: prefetched File objects so Share opens instantly
  };
  let canvas = null, hits = [];

  // ───────── drawing
  function draw() {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const [a, b] = BGS[st.bg];
    const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, a); grad.addColorStop(1, b);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const img = st.src && st.src.img;
    if (img) {
      const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
      if (st.fit === 'cover') {
        const s = Math.max(W / iw, H / ih);
        g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      } else {
        const sb = Math.max(W / iw, H / ih);
        g.save(); g.filter = 'blur(50px) brightness(.7)'; g.drawImage(img, (W - iw * sb) / 2, (H - ih * sb) / 2, iw * sb, ih * sb); g.restore();
        const s = Math.min(W / iw, (H * 0.78) / ih);
        g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      }
    }
    hits = [];
    for (const o of st.overlays) {
      const size = o.size;
      g.font = `${o.kind === 'emoji' ? '' : '700 '}${size}px Inter, "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const lines = String(o.text).split('\n');
      const lh = size * 1.18;
      const wMax = Math.max(...lines.map((l) => g.measureText(l).width));
      const x = o.x * W, y = o.y * H, boxW = wMax + size * 0.8, boxH = lh * lines.length + size * 0.4;
      if (o.bg && o.kind !== 'emoji') {
        g.fillStyle = o.color === '#ffffff' ? 'rgba(0,0,0,.55)' : '#ffffff';
        roundRect(g, x - boxW / 2, y - boxH / 2, boxW, boxH, size * 0.35); g.fill();
      }
      g.fillStyle = o.color;
      if (!o.bg && o.kind !== 'emoji') { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = size * 0.18; }
      lines.forEach((l, i) => g.fillText(l, x, y - (lh * (lines.length - 1)) / 2 + i * lh));
      g.shadowBlur = 0;
      hits.push({ o, x0: x - boxW / 2, y0: y - boxH / 2, x1: x + boxW / 2, y1: y + boxH / 2 });
      if (st.sel === o.id) { g.strokeStyle = '#f5c542'; g.lineWidth = 5; g.setLineDash([18, 12]); g.strokeRect(x - boxW / 2 - 8, y - boxH / 2 - 8, boxW + 16, boxH + 16); g.setLineDash([]); }
    }
    if (st.link) { // a placeholder showing where the link sticker will go (only in the preview)
      const ly = H * 0.8;
      if (!st.exporting) {
        g.setLineDash([14, 10]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4;
        roundRect(g, W / 2 - 260, ly - 60, 520, 120, 60); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 40px Inter, system-ui'; g.textAlign = 'center';
        g.fillText('🔗 ' + (st.linkLabel || 'link sticker here'), W / 2, ly + 2);
      }
    }
  }
  function roundRect(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function bindCanvas(cv) {
    let drag = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    cv.addEventListener('pointerdown', (e) => {
      const p = pt(e);
      const hit = [...hits].reverse().find((t) => p.x >= t.x0 && p.x <= t.x1 && p.y >= t.y0 && p.y <= t.y1);
      st.sel = hit ? hit.o.id : null;
      if (hit) { drag = { o: hit.o, dx: p.x - hit.o.x * W, dy: p.y - hit.o.y * H }; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
      draw(); renderControls();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = pt(e);
      drag.o.x = Math.min(0.97, Math.max(0.03, (p.x - drag.dx) / W));
      drag.o.y = Math.min(0.97, Math.max(0.03, (p.y - drag.dy) / H));
      draw();
    });
    const up = () => { drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  async function setSource(file, name) {
    if (!file) return;
    if (file.type && file.type.startsWith('video')) {
      st.src = { kind: 'video', file, name: name || file.name, url: URL.createObjectURL(file) };
    } else {
      const url = URL.createObjectURL(file);
      st.src = { kind: 'image', file, name: name || file.name, url, img: await loadImg(url) };
    }
    render();
  }
  async function setSourceUrl(url, name) {
    try { const img = await loadImg(url, true); st.src = { kind: 'image', url, img, name }; }
    catch { st.src = null; toast('That picture can\'t be used directly — a coloured background is used instead.'); }
    render();
  }
  function addOverlay(kind, text) {
    const o = { id: uid(), kind, text, x: 0.5, y: kind === 'emoji' ? 0.3 : 0.18 + st.overlays.length * 0.08, size: kind === 'emoji' ? 150 : 72, color: '#ffffff', bg: kind !== 'emoji' };
    st.overlays.push(o); st.sel = o.id; draw(); renderControls();
  }

  async function exportStory() {
    if (st.src && st.src.kind === 'video') return { blob: st.src.file, type: 'video', name: st.src.name || 'story.mp4' };
    st.exporting = true; const prevSel = st.sel; st.sel = null; draw();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    st.exporting = false; st.sel = prevSel; draw();
    return { blob, type: 'image', name: 'story.jpg' };
  }

  // ───────── actions
  async function postNow() {
    const to = ['ig', 'fb'].filter((p) => st.to[p] && ctx.composer.connected(p));
    if (!to.length) return toast('Tick Instagram and/or Facebook (connected under Accounts).', 'err');
    if (!st.src && !st.overlays.length) return toast('Add a picture, video or some text first.', 'err');
    if (st.link && !confirm('Instagram and Facebook do not let apps add a clickable link sticker, so "Post now" publishes the story WITHOUT a working link (the sticker you see here is only a preview).\n\nPress Cancel, then use "Send to phone" to add the real link sticker yourself.\n\nPost without the link?')) return;
    st.busy = true; renderControls();
    const out = await exportStory();
    const post = { id: uid(), at: nowIso(), updatedAt: nowIso(), caption: '(story) ' + (st.overlays.map((o) => o.text).join(' ').slice(0, 80) || st.src && st.src.name || ''), thumb: thumbData(), media: [out.type], formats: Object.fromEntries(to.map((p) => [p, 'story'])), targets: Object.fromEntries(to.map((p) => [p, { status: 'working', stage: 'Uploading…' }])), hosted: [] };
    ctx.addPost(post);
    try {
      const url = await hostFile(out.blob, out.name);
      post.hosted.push(url);
      const media = [{ type: out.type, url, size: out.blob.size, file: out.blob }];
      await Promise.all(to.map(async (p) => {
        try {
          const r = await ctx.platforms.publish[p]({ media, caption: '', opt: { format: 'story' }, onStage: (s) => { post.targets[p].stage = s; }, onProgress: () => {} });
          Object.assign(post.targets[p], { status: 'done', id: r.id, url: r.url, note: 'Story', stage: null });
        } catch (e) { Object.assign(post.targets[p], { status: 'error', error: e.message, stage: null }); }
      }));
      const bad = to.filter((p) => post.targets[p].status === 'error');
      if (bad.length) toast(bad.map((p) => P[p].name + ': ' + post.targets[p].error).join(' · '), 'err');
      else { toast('Story posted ✓'); deleteHosted(post.hosted); post.hosted = []; }
    } catch (e) { toast(e.message, 'err'); for (const p of to) Object.assign(post.targets[p], { status: 'error', error: e.message }); }
    post.updatedAt = nowIso();
    ctx.updatePost(post);
    st.busy = false; renderControls();
  }

  function thumbData() {
    if (!canvas) return null;
    const c = document.createElement('canvas'); c.width = 90; c.height = 160;
    c.getContext('2d').drawImage(canvas, 0, 0, 90, 160);
    return c.toDataURL('image/jpeg', 0.7);
  }

  async function sendToPhone() {
    if (!st.src && !st.overlays.length) return toast('Add a picture, video or some text first.', 'err');
    st.busy = true; renderControls();
    try {
      const out = await exportStory();
      let url;
      if (DEMO) url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(out.blob); });
      else url = await hostFile(out.blob, out.name);
      const item = { id: uid(), at: nowIso(), updatedAt: nowIso(), url, type: out.type, name: out.name, thumb: out.type === 'image' ? thumbData() : null, link: st.link.trim(), linkLabel: st.linkLabel.trim(), note: st.note.trim(), to: { ...st.to }, done: false };
      ctx.addStory(item);
      st.tab = 'queue';
      toast('Sent to your phone queue ✓ Open Social Radar on your phone (same Google sign-in).');
      render();
    } catch (e) { toast(e.message, 'err'); }
    st.busy = false; renderControls();
  }

  // Meta Business Suite (Meta's own desktop tool) may offer a Link sticker the API doesn't. We download the finished
  // story, copy the link and open Business Suite for the Page; you pick the file there and add the sticker.
  async function toBusinessSuite() {
    if (!st.src && !st.overlays.length) return toast('Add a picture, video or some text first.', 'err');
    st.busy = true; renderControls();
    try {
      const out = await exportStory();
      const a = h('a', { href: URL.createObjectURL(out.blob), download: out.name }); document.body.append(a); a.click(); a.remove();
      if (st.link.trim()) { try { await copyText(st.link.trim()); } catch { /* ignore */ } }
      const pid = S.accounts.meta && S.accounts.meta.pageId;
      window.open('https://business.facebook.com/latest/home' + (pid ? '?asset_id=' + encodeURIComponent(pid) : ''), '_blank', 'noopener');
      toast('Story saved to your Downloads' + (st.link.trim() ? ' and link copied' : '') + '. In Business Suite: Create → Story → upload it → add the Link sticker.');
    } catch (e) { toast(e.message, 'err'); }
    st.busy = false; renderControls();
  }

  async function prefetch(item) {
    if (item.kind === 'reshare' || st.files.has(item.id) || !touchDevice()) return;
    try {
      const r = await fetch(item.url);
      const b = await r.blob();
      st.files.set(item.id, new File([b], item.name || (item.type === 'video' ? 'story.mp4' : 'story.jpg'), { type: b.type || (item.type === 'video' ? 'video/mp4' : 'image/jpeg') }));
    } catch { /* fall back to download */ }
  }
  async function share(item) {
    const f = st.files.get(item.id);
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: item.url, download: item.name || 'story', target: '_blank' }); document.body.append(a); a.click(); a.remove();
    toast('Saved — open Instagram, tap + → Story and pick it from your gallery.');
  }

  // ───────── rendering
  let controls = null;
  function renderControls() {
    if (!controls) return;
    const sel = st.overlays.find((o) => o.id === st.sel);
    const isVideo = st.src && st.src.kind === 'video';
    fill(controls, 
      h('div', { class: 'row wrap' },
        h('label', { class: 'btn sm' }, 'Picture / video', h('input', { type: 'file', accept: 'image/*,video/*', hidden: true, onchange: (e) => setSource(e.target.files[0]) })),
        S.draft.media.length ? h('button', { class: 'btn sm', title: 'Use the first photo/video from the composer', onclick: () => setSource(S.draft.media[0].file, S.draft.media[0].name) }, 'From composer') : null,
        st.src ? h('button', { class: 'btn sm ghost', onclick: () => { st.src = null; render(); } }, 'Remove') : null),
      isVideo ? h('p', { class: 'note' }, 'Video stories are posted as they are. Add text, emoji and stickers on your phone with "Send to phone".') : h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: () => { addOverlay('text', 'Your text'); setTimeout(() => { const i = controls.querySelector('.ov-edit input'); if (i) { i.focus(); i.select(); } }, 0); } }, '+ Text'),
        h('button', { class: 'btn sm', onclick: (e) => toggleEmoji(e.currentTarget, (em) => { addOverlay('emoji', em); document.querySelector('.emoji-pop')?.remove(); }) }, '+ Emoji'),
        st.src ? h('button', { class: 'btn sm ghost', onclick: () => { st.fit = st.fit === 'cover' ? 'contain' : 'cover'; draw(); renderControls(); } }, st.fit === 'cover' ? 'Fit whole picture' : 'Fill screen') : null,
        h('button', { class: 'btn sm ghost', title: 'Background colour', onclick: () => { st.bg = (st.bg + 1) % BGS.length; draw(); } }, 'Background')),
      sel ? h('div', { class: 'ov-edit' },
        sel.kind === 'text' ? h('input', { class: 'inp sm', value: sel.text, oninput: (e) => { sel.text = e.target.value; draw(); } }) : null,
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn sm', onclick: () => { sel.size = Math.min(320, sel.size * 1.15); draw(); } }, 'A+'),
          h('button', { class: 'btn sm', onclick: () => { sel.size = Math.max(28, sel.size / 1.15); draw(); } }, 'A−'),
          sel.kind === 'text' ? COLORS.map((c) => h('button', { class: 'swatch' + (sel.color === c ? ' on' : ''), style: { background: c }, title: c, onclick: () => { sel.color = c; draw(); renderControls(); } })) : null,
          sel.kind === 'text' ? h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: sel.bg, onchange: (e) => { sel.bg = e.target.checked; draw(); } }), 'Box') : null,
          h('button', { class: 'btn sm ghost', onclick: () => { st.overlays = st.overlays.filter((o) => o !== sel); st.sel = null; draw(); renderControls(); } }, 'Delete'))) : h('p', { class: 'xs muted' }, isVideo ? '' : 'Tip: drag text and emoji on the preview to place them.'),
      h('div', { class: 'sec-label' }, 'Link sticker (added on your phone)'),
      h('div', { class: 'row' }, h('input', { class: 'inp sm grow', type: 'url', placeholder: 'https://example.com/…', value: st.link, oninput: (e) => { st.link = e.target.value; draw(); } }),
        h('input', { class: 'inp sm', style: { width: '120px' }, placeholder: 'Sticker text', value: st.linkLabel, oninput: (e) => { st.linkLabel = e.target.value; draw(); } })),
      h('input', { class: 'inp sm', placeholder: 'Note for your phone: @mentions, poll, music…', value: st.note, oninput: (e) => { st.note = e.target.value; } }),
      h('div', { class: 'row wrap' }, ['ig', 'fb'].map((p) => h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st.to[p], onchange: (e) => { st.to[p] = e.target.checked; } }), pIcon(p), P[p].name + ' story'))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm primary', disabled: st.busy, onclick: sendToPhone, title: 'Queue it for your phone, where you can add the link sticker' }, h('span', { svg: I.phone }), 'Send to phone (link sticker)'),
        !touchDevice() ? h('button', { class: 'btn sm', disabled: st.busy, onclick: toBusinessSuite, title: 'Saves the story, copies the link and opens Meta Business Suite, which may have a Link sticker' }, 'Meta Business Suite') : null,
        h('button', { class: 'btn sm', disabled: st.busy, onclick: postNow, title: 'Post now through the API (no stickers)' }, st.busy ? h('span', { class: 'spin' }) : null, 'Post now')));
  }

  function createView() {
    const wrap = h('div', { class: 'story-wrap' });
    if (st.src && st.src.kind === 'video') {
      wrap.append(h('div', { class: 'story-prev' }, h('video', { src: st.src.url, controls: true, playsinline: true, muted: true, class: 'story-cv' })));
      canvas = null;
    } else {
      canvas = h('canvas', { width: W, height: H, class: 'story-cv', 'aria-label': 'Story preview — drag text to move it' });
      bindCanvas(canvas);
      wrap.append(h('div', { class: 'story-prev' }, canvas));
    }
    controls = h('div', { class: 'story-ctrl' });
    wrap.append(controls);
    renderControls();
    draw();
    return wrap;
  }

  function reshareItem(it, phone) {
    const app = P[it.platform] ? P[it.platform].name : 'Instagram';
    return h('div', { class: 'q-item' + (it.done ? ' done' : '') },
      h('div', { class: 'q-thumb sq', style: it.thumb ? { 'background-image': `url("${it.thumb}")` } : {} }),
      h('div', { class: 'q-body' },
        h('div', { class: 'row' }, pIcon(it.platform), h('b', { class: 'grow' }, it.done ? 'Done' : 'Reshare as story'), h('span', { class: 'mono xs muted' }, ago(it.at))),
        h('div', { class: 'ell small' }, it.title),
        h('div', { class: 'xs muted' }, stepsFor(it.platform)),
        h('div', { class: 'row wrap' },
          h('a', { class: 'btn sm primary', href: it.url, target: '_blank', rel: 'noopener' }, phone ? 'Open in ' + app : 'Open ↗'),
          !it.done ? h('button', { class: 'btn sm ghost', onclick: () => { it.done = true; it.updatedAt = nowIso(); ctx.saveStories(); render(); } }, 'Mark done') : null,
          h('button', { class: 'btn sm ghost', title: 'Delete', onclick: () => { ctx.deleteStory(it); render(); } }, '✕'))));
  }

  function queueView() {
    const items = S.stories.filter((x) => !x.deleted);
    const phone = touchDevice();
    const open = items.filter((x) => !x.done);
    if (phone) open.forEach(prefetch);
    const qrBox = h('div', { class: 'qr-box' });
    if (!phone) {
      const u = new URL(location.origin + location.pathname); u.searchParams.set('card', 'stories'); u.searchParams.set('tab', 'queue'); if (DEMO) u.searchParams.set('demo', '1');
      loadQr().then(() => { fill(qrBox, ); new window.QRCode(qrBox, { text: u.toString(), width: 116, height: 116, colorDark: '#1b1519', colorLight: '#ffffff' }); }).catch(() => fill(qrBox, h('code', { class: 'xs' }, u.toString())));
    }
    return h('div', { class: 'queue' },
      !phone ? h('div', { class: 'qr-row' }, qrBox, h('div', {}, h('b', {}, 'Finish on your phone'), h('p', { class: 'small muted' }, 'Scan to open this queue on your phone, signed in with the same Google account. Each story: copy the link, share to Instagram, then add the Link sticker and paste.'))) : h('p', { class: 'small muted', style: { margin: '10px 14px 0' } }, '1 · Copy link  2 · Share to Instagram → Story  3 · Sticker tray → Link → paste'),
      items.length ? items.map((it) => it.kind === 'reshare' ? reshareItem(it, phone) : h('div', { class: 'q-item' + (it.done ? ' done' : '') },
        h('div', { class: 'q-thumb', style: it.thumb ? { 'background-image': `url("${it.thumb}")` } : {} }, it.type === 'video' ? '▶' : null),
        h('div', { class: 'q-body' },
          h('div', { class: 'row' }, h('b', { class: 'grow' }, it.done ? 'Posted' : 'Ready for your phone'), h('span', { class: 'mono xs muted' }, ago(it.at))),
          it.link ? h('div', { class: 'q-link' }, h('code', {}, it.link), it.linkLabel ? h('span', { class: 'b' }, it.linkLabel) : null) : h('div', { class: 'xs muted' }, 'No link'),
          it.note ? h('div', { class: 'xs' }, '📝 ' + it.note) : null,
          h('div', { class: 'row wrap' },
            it.link ? h('button', { class: 'btn sm', onclick: async () => { await copyText(it.link); toast('Link copied — paste it into the Link sticker'); } }, '1 · Copy link') : null,
            h('button', { class: 'btn sm primary', onclick: () => share(it) }, phone ? '2 · Share to Instagram' : 'Download'),
            phone ? h('a', { class: 'btn sm ghost', href: 'instagram://story-camera' }, 'Open Instagram') : null,
            !it.done ? h('button', { class: 'btn sm ghost', onclick: () => { it.done = true; it.updatedAt = nowIso(); ctx.saveStories(); render(); if (!DEMO) deleteHosted([it.url]); } }, 'Mark posted') : null,
            h('button', { class: 'btn sm ghost', title: 'Delete', onclick: () => { ctx.deleteStory(it); if (!it.done && !DEMO && it.kind !== 'reshare') deleteHosted([it.url]); render(); } }, '✕'))))) : h('div', { class: 'empty' }, 'Nothing queued. Reshare a post or make a story and press "Send to phone".'));
  }

  // Reshare helpers. The API can't add the clickable "post" sticker, but the Instagram/Facebook app can: open the
  // post there and use its own Share → Add to story. Everything here just gets you to that screen in one tap.
  const nativeApp = (p) => (p.platform === 'ig' || p.platform === 'fb') && !!p.url;
  const stepsFor = (platform) => platform === 'ig' ? 'Tap ✈ Share → “Add to story” → Post' : 'Tap Share → “Share to Story” → Share now';
  function qrNode(text) {
    const box = h('div', { class: 'qr-box' });
    loadQr().then(() => { fill(box); new window.QRCode(box, { text, width: 132, height: 132, colorDark: '#1b1519', colorLight: '#ffffff' }); }).catch(() => fill(box, h('code', { class: 'xs' }, text)));
    return box;
  }
  function queueReshare(p) {
    ctx.addStory({ id: uid(), at: nowIso(), updatedAt: nowIso(), kind: 'reshare', platform: p.platform, url: p.url, title: (p.title || p.text || '').split('\n')[0].slice(0, 80) || p.type || 'Post', thumb: p.thumb || null, done: false });
    toast('Added to your phone queue ✓ On your phone: open it and tap “Open in ' + P[p.platform].name + '”.');
    st.tab = 'queue'; render();
  }

  function reshareView() {
    const posts = ['ig', 'fb', 'yt', 'tt', 'li'].flatMap((p) => (S.stats[p] && S.stats[p].posts) || []).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
    const phone = touchDevice();
    if (!posts.length) return h('div', { class: 'empty' }, 'Your recent posts appear here once accounts are connected.');
    return h('div', { class: 'reshare' }, h('p', { class: 'small muted', style: { margin: '10px 14px 4px' } }, 'Best for reshares: open the post in the Instagram/Facebook app and use its own Share → Add to story. That is the only way to get the clickable post sticker.'),
      posts.map((p) => h('div', { class: 'rs-item' },
        h('div', { class: 'q-thumb sq', style: p.thumb ? { 'background-image': `url("${p.thumb}")` } : {} }),
        h('div', { class: 'q-body' },
          h('div', { class: 'row' }, pIcon(p.platform), h('span', { class: 'grow ell small' }, (p.title || p.text || '').split('\n')[0] || p.type), h('span', { class: 'mono xs muted' }, ago(p.at))),
          h('div', { class: 'row wrap' },
            nativeApp(p) ? (phone
              ? h('a', { class: 'btn sm primary', href: p.url, target: '_blank', rel: 'noopener' }, 'Open in ' + P[p.platform].name + ' → story')
              : h('button', { class: 'btn sm primary', onclick: () => { st.qrFor = st.qrFor === p.id ? null : p.id; render(); } }, 'Reshare on my phone')) : null,
            nativeApp(p) && !phone ? h('button', { class: 'btn sm', title: 'Put it in your phone queue (needs the same Google sign-in on the phone)', onclick: () => queueReshare(p) }, 'Add to phone queue') : null,
            h('button', { class: 'btn sm ghost', title: 'Build a story image yourself (no clickable post sticker)', onclick: async () => {
              st.tab = 'create'; st.overlays = []; st.link = p.url || ''; st.linkLabel = 'See post';
              if (p.thumb) await setSourceUrl(p.thumb, 'post'); else { st.src = null; render(); }
              addOverlay('text', p.platform === 'yt' ? 'New video 🎬' : 'New post ✨');
            } }, 'Make story'),
            !nativeApp(p) && p.url ? h('a', { class: 'btn sm ghost', href: p.url, target: '_blank', rel: 'noopener' }, phone ? 'Open in app' : 'Open') : null),
          nativeApp(p) && phone ? h('div', { class: 'xs muted' }, stepsFor(p.platform)) : null,
          nativeApp(p) && !phone && st.qrFor === p.id ? h('div', { class: 'qr-row' }, qrNode(p.url), h('div', {}, h('b', {}, 'Scan with your phone camera'), h('p', { class: 'small muted' }, 'It opens this post in the ' + P[p.platform].name + ' app. ' + stepsFor(p.platform) + '. That gives the real, clickable post sticker, which apps can\'t create for you.'))) : null))));
  }

  function render() {
    const c = ctx.cards.stories;
    if (!c) return;
    const n = S.stories.filter((x) => !x.done).length;
    c.count.textContent = n || '';
    const tabs = h('div', { class: 'ctabs' }, [['create', 'Create'], ['queue', `Phone queue${n ? ' (' + n + ')' : ''}`], ['reshare', 'Reshare']].map(([k, l]) => h('button', { class: 'ctab' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; render(); } }, l)));
    fill(c.body, tabs, st.tab === 'queue' ? queueView() : st.tab === 'reshare' ? reshareView() : createView());
  }

  return { render, setSource };
}
