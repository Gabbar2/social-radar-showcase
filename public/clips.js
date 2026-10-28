// Video Clipping: finds the scenes in the attached video (same idea as a frame-by-frame contact sheet: compare each
// frame with the one before it and cut where the picture changes), shows them as clips under the button, and can
// cut any clip out as its own file. Everything runs in the browser — the video never leaves the device.
import { h, toast, uid, fill } from './core.js';

const once = (el, ev, ms = 15000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('video timeout')), ms); el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true }); el.addEventListener('error', () => { clearTimeout(t); rej(new Error('Could not read this video in the browser')); }, { once: true }); });
const seek = (v, t) => new Promise((res) => { const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); }; const to = setTimeout(done, 4000); v.addEventListener('seeked', done); v.currentTime = t; });
export const fmtT = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), x = s - m * 60; return `${m}:${String(Math.floor(x)).padStart(2, '0')}.${Math.floor((x % 1) * 10)}`; };
const SENS = [['1', 'Fewer scenes'], ['2', 'Fewer'], ['3', 'Balanced'], ['4', 'More'], ['5', 'More scenes']];
const THR = { 1: 0.32, 2: 0.24, 3: 0.17, 4: 0.12, 5: 0.08 };
const MAXLEN = [['auto', 'Auto (max 60s)'], ['15', 'Max 15s'], ['30', 'Max 30s'], ['45', 'Max 45s']];

async function loadVideo(m) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = m.preview;
  await once(v, 'loadedmetadata');
  if (!isFinite(v.duration) || v.duration <= 0) throw new Error('Could not read the video length');
  return v;
}

// Pass 1 (slow): compare every frame with the one before it and note where the picture jumps.
async function scanCuts(v, sens, onProgress) {
  const dur = v.duration;
  const step = dur <= 40 ? 0.1 : dur <= 120 ? 0.2 : dur <= 400 ? 0.5 : 1; // like the 0.1s frame strip, thinner for long videos
  const W = 48, Hh = 27, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d', { willReadFrequently: true });
  const frames = [];
  for (let t = 0; t < dur - 0.02; t += step) {
    await seek(v, Math.min(t, dur - 0.05));
    g.drawImage(v, 0, 0, W, Hh);
    frames.push({ t, d: g.getImageData(0, 0, W, Hh).data });
    onProgress(Math.min(0.9, (t / dur) * 0.9));
  }
  const diffs = frames.map((f, i) => {
    if (!i) return 0;
    const a = frames[i - 1].d, b = f.d; let s = 0;
    for (let k = 0; k < b.length; k += 4) s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
    return s / (b.length / 4) / 765;
  });
  const sorted = [...diffs].sort((x, y) => x - y), med = sorted[Math.floor(sorted.length / 2)] || 0;
  const thr = Math.max(THR[sens] || 0.17, med * 5);
  const cuts = [];
  for (let i = 1; i < diffs.length; i++) if (diffs[i] >= thr && diffs[i] >= diffs[i - 1] && diffs[i] >= (diffs[i + 1] || 0)) cuts.push(frames[i].t);
  return { dur, step, frames: frames.length, cuts };
}

// Pass 2 (fast): turn the cut points into scenes with the chosen minimum/maximum length and take a snapshot of each.
// `scan` can be passed back in so changing the length filters does not re-read the whole video.
export async function analyse(m, { sens = 3, maxLen = 'auto', minLen = 0.6, scan = null }, onProgress = () => {}) {
  const v = await loadVideo(m);
  const dur = v.duration;
  if (!scan) scan = await scanCuts(v, sens, onProgress);
  const { step, cuts } = scan;
  // scenes from cuts
  let bounds = [0, ...cuts, dur];
  let scenes = bounds.slice(0, -1).map((s, i) => ({ start: s, end: bounds[i + 1] }));
  // very short scenes belong to a neighbour
  const MIN = Math.max(0.3, Number(minLen) || 0.6);
  for (let i = 0; i < scenes.length && scenes.length > 1;) {
    if (scenes[i].end - scenes[i].start < MIN) {
      if (i > 0) { scenes[i - 1].end = scenes[i].end; scenes.splice(i, 1); } else { scenes[1].start = scenes[0].start; scenes.shift(); }
    } else i++;
  }
  // long scenes are cut into equal parts so no clip is longer than the limit
  const cap = maxLen === 'auto' ? 60 : Math.max(1, Number(maxLen) || 60);
  scenes = scenes.flatMap((s) => { const len = s.end - s.start, n = Math.ceil(len / cap - 1e-6); return n <= 1 ? [s] : Array.from({ length: n }, (_, k) => ({ start: s.start + (len / n) * k, end: s.start + (len / n) * (k + 1) })); });
  // thumbnails
  const tw = 240, th = Math.round(tw * (v.videoHeight / v.videoWidth || 9 / 16)), tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
  const tg = tc.getContext('2d');
  // a bigger snapshot per scene (this is what gets attached to ChatGPT)
  const sw = 400, sh = Math.round(sw * (v.videoHeight / v.videoWidth || 9 / 16)), sc2 = document.createElement('canvas'); sc2.width = sw; sc2.height = sh; const sg = sc2.getContext('2d');
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]; await seek(v, s.start + Math.min(0.35, (s.end - s.start) / 2));
    tg.drawImage(v, 0, 0, tw, th); s.thumb = tc.toDataURL('image/jpeg', 0.72); sg.drawImage(v, 0, 0, sw, sh); s.snap = sc2.toDataURL('image/jpeg', 0.85); s.id = uid(); onProgress(0.9 + 0.1 * ((i + 1) / scenes.length));
  }
  v.removeAttribute('src'); v.load();
  return { mediaId: m.id, name: m.name, dur, step, frames: scan.frames, cuts: cuts.length, scenes, tw, th, sw, sh, scan };
}

// Cut one scene out as its own file by playing it and recording it (real time).
export async function cutClip(m, sc, n, onProgress = () => {}) {
  const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = m.preview;
  await once(v, 'loadedmetadata'); await seek(v, sc.start);
  if (!v.captureStream) throw new Error('This browser can\'t cut clips — use Chrome or Edge.');
  const vt = v.captureStream().getVideoTracks();
  let ac = null, dest = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume(); const src = ac.createMediaElementSource(v); dest = ac.createMediaStreamDestination(); src.connect(dest); } catch { ac = null; }
  const stream = new MediaStream([...vt, ...(dest ? dest.stream.getAudioTracks() : [])]);
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser can\'t record clips — use Chrome or Edge.');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(250);
  await v.play();
  await new Promise((res) => { const tick = () => { onProgress((v.currentTime - sc.start) / (sc.end - sc.start)); if (v.currentTime >= sc.end - 0.03 || v.ended) res(); else requestAnimationFrame(tick); }; tick(); });
  v.pause(); rec.stop(); await stopped; if (ac) ac.close().catch(() => {});
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const base = String(m.name || 'video').replace(/\.[^.]+$/, '');
  return new File([new Blob(chunks, { type: mime.split(';')[0] })], `${base}-scene${n}.${ext}`, { type: mime.split(';')[0] });
}

export function createClips(ctx) {
  const { S } = ctx;
  const st = { open: true, busy: false, pct: 0, res: null, sens: 3, maxLen: 'auto', custom: false, maxCustom: 30, minLen: 0.6, sel: new Set(), play: null, cut: null, original: null, err: '' };
  const root = h('div', { class: 'clips' });
  const video = () => S.draft.media.find((m) => m.type === 'video');

  const maxNow = () => (st.custom ? Math.max(1, Number(st.maxCustom) || 30) : st.maxLen);
  const gptTouch = () => { try { ctx.gptTouch && ctx.gptTouch(); } catch { /* card not ready */ } };
  async function run(again) {
    const m = video(); if (!m || st.busy) return;
    const keepScan = again === true && st.res && st.res.mediaId === m.id ? st.res.scan : null; // only the length filters changed → no need to re-read the video
    st.busy = true; st.pct = 0; st.err = ''; st.play = null; update();
    try {
      st.res = await analyse(m, { sens: st.sens, maxLen: maxNow(), minLen: st.minLen, scan: keepScan }, (p) => { st.pct = p; const b = root.querySelector('.clip-prog > i'); if (b) b.style.width = Math.round(p * 100) + '%'; const l = root.querySelector('.clip-btn .lbl'); if (l) l.textContent = `Finding scenes… ${Math.round(p * 100)}%`; });
      st.open = true; st.sel = new Set(st.res.scenes.map((x) => x.id));
      toast(`Found ${st.res.scenes.length} clip${st.res.scenes.length === 1 ? '' : 's'}`);
    } catch (e) { st.err = e.message || String(e); toast(st.err, 'err'); }
    st.busy = false; update(); gptTouch();
  }
  const merge = (i) => { const sc = st.res.scenes; if (i >= sc.length - 1) return; sc[i].end = sc[i + 1].end; st.sel.delete(sc[i + 1].id); sc.splice(i + 1, 1); update(); gptTouch(); };
  const chosen = () => (st.res ? st.res.scenes.map((sc, i) => ({ sc, i })).filter((x) => st.sel.has(x.sc.id)) : []);
  const setSel = (fn) => { fn(st.sel); update(); gptTouch(); };
  const totalLen = () => st.res.scenes.reduce((a, s) => a + (s.end - s.start), 0);

  function preview(sc, box) {
    const m = video(); if (!m) return;
    const v = h('video', { src: m.preview, muted: true, playsinline: '', controls: true, class: 'clip-vid' });
    v.addEventListener('loadedmetadata', () => { v.currentTime = sc.start; v.play().catch(() => {}); });
    v.addEventListener('timeupdate', () => { if (v.currentTime >= sc.end) { v.pause(); v.currentTime = sc.start; } });
    box.replaceChildren(v);
  }

  async function exportOne(i, mode) {
    const m = video(); if (!m || st.cut) return;
    const sc = st.res.scenes[i]; st.cut = { i, pct: 0 }; update();
    try {
      const f = await cutClip(m, sc, i + 1, (p) => { st.cut.pct = Math.max(0, Math.min(1, p)); const b = root.querySelector('.cut-prog > i'); if (b) b.style.width = Math.round(st.cut.pct * 100) + '%'; });
      if (!f.size) throw new Error('The clip came out empty — try again.');
      if (mode === 'save') { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      else {
        st.original = { file: m.file, name: m.name };
        await ctx.composer.addFiles([f]);
        ctx.composer.removeMedia(m.id);
        st.res = null;
        toast(f.name.endsWith('.webm') ? 'Clip added (WebM). Instagram needs MP4 — Chrome 126+ makes MP4 clips.' : 'Clip added as the post video');
      }
    } catch (e) { toast(e.message || String(e), 'err'); }
    st.cut = null; update();
  }
  async function restore() { if (!st.original) return; const o = st.original; st.original = null; st.res = null; const cur = video(); const f = o.file; await ctx.composer.addFiles([f]); if (cur) ctx.composer.removeMedia(cur.id); update(); }

  // contact sheet like a frame strip: one tile per scene with its time stamps
  async function sheetBlob() {
    const r = st.res; if (!r) return null;
    const pick = chosen(); if (!pick.length) return null;
    const cols = Math.min(4, pick.length), rows = Math.ceil(pick.length / cols), cw = 320, ch = Math.round((cw - 8) * r.sh / r.sw) + 38;
    const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch; const g = c.getContext('2d');
    g.fillStyle = '#161316'; g.fillRect(0, 0, c.width, c.height);
    await Promise.all(pick.map(({ sc: s, i: n }, i) => new Promise((res) => {
      const im = new Image(); im.onload = () => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; g.drawImage(im, x + 4, y + 4, cw - 8, ch - 38); g.fillStyle = '#ece6ea'; g.font = 'bold 16px sans-serif'; g.fillText(`Scene ${n + 1}`, x + 8, y + ch - 10); g.textAlign = 'right'; g.fillText(`${fmtT(s.start)} – ${fmtT(s.end)}`, x + cw - 8, y + ch - 10); g.textAlign = 'left'; res(); }; im.onerror = res; im.src = s.snap || s.thumb;
    })));
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  // Starts the clipboard write straight away (it must happen inside the click); resolves true when the picture is on the clipboard.
  function copySheetNow() {
    if (!st.sel.size) return Promise.resolve(false);
    try { return navigator.clipboard.write([new ClipboardItem({ 'image/png': sheetBlob() })]).then(() => true, () => false); } catch { return Promise.resolve(false); }
  }
  async function copySheet() {
    if (!st.sel.size) return toast('Tick at least one clip first', 'err');
    if (await copySheetNow()) return toast('Scene snapshots copied — press Ctrl+V in ChatGPT to attach them');
    const b = await sheetBlob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'scene-snapshots.png'; a.click(); toast('Saved the scene snapshots as an image — drag it into ChatGPT');
  }
  // One labelled picture per scene (max 10 — ChatGPT's limit per message; long videos are sampled evenly).
  async function snapshots(max = 10) {
    const r = st.res; if (!r) return [];
    const idx = chosen().map((x) => x.i); const pick = idx.length <= max ? idx : Array.from({ length: max }, (_, k) => idx[Math.round(k * (idx.length - 1) / (max - 1))]);
    return Promise.all(pick.map((i) => new Promise((res) => {
      const s = r.scenes[i], im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = r.sw; c.height = r.sh; const g = c.getContext('2d'); g.drawImage(im, 0, 0, r.sw, r.sh); g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 150, 30); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText(`Scene ${i + 1} · ${fmtT(s.start)}`, 8, 21); res({ n: i + 1, dataUrl: c.toDataURL('image/jpeg', 0.88) }); };
      im.onerror = () => res(null); im.src = s.snap || s.thumb;
    }))).then((a) => a.filter(Boolean));
  }

  function summary() {
    const r = st.res, m = video();
    if (!m || !r || r.mediaId !== m.id) return '';
    return `Video "${m.name}" is ${r.dur.toFixed(1)}s long and splits into ${r.scenes.length} scene${r.scenes.length === 1 ? '' : 's'}: ` +
      r.scenes.map((s, i) => `${i + 1}) ${fmtT(s.start)}–${fmtT(s.end)} (${(s.end - s.start).toFixed(1)}s)`).join('; ') + '.';
  }

  function update() {
    const m = video();
    if (!m) { st.res = null; fill(root); root.hidden = !st.original; if (st.original) fill(root, restoreBar()); return; }
    if (st.res && st.res.mediaId !== m.id) st.res = null;
    root.hidden = false;
    const btn = h('button', { type: 'button', class: 'btn clip-btn', disabled: st.busy || !!st.cut, title: 'Find the scenes in this video and split it into clips', onclick: run },
      h('span', { class: 'lbl' }, st.busy ? `Finding scenes… ${Math.round(st.pct * 100)}%` : 'Video Clipping'),
      st.busy ? h('span', { class: 'clip-prog' }, h('i', { style: { width: Math.round(st.pct * 100) + '%' } })) : null);
    fill(root, st.original ? restoreBar() : null, btn, st.err ? h('div', { class: 'warn xs' }, st.err) : null, st.res ? panel() : null);
  }
  function restoreBar() { return h('div', { class: 'clip-restore xs' }, h('span', { class: 'grow' }, `Using one clip of “${st.original.name}”`), h('button', { type: 'button', class: 'btn ghost sm', onclick: restore }, 'Restore full video')); }

  // length choices that make sense for this video (a 10-minute video gets 30s/60s/2min…, a 20s one gets 5s/10s)
  function lenOpts(dur) {
    const c = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1800].filter((x) => x < dur * 0.9);
    const keep = c.length > 8 ? c.filter((_, i) => i % Math.ceil(c.length / 8) === 0 || i === c.length - 1) : c;
    return [['auto', 'Auto (max 60s)'], ...keep.map((x) => [String(x), x >= 60 ? `${x / 60} min` : `${x}s`]), ['custom', 'Custom…']];
  }
  const numIn = (val, min, max, fn) => { const i = h('input', { type: 'number', class: 'inp xs-in clip-num', min, max, step: 'any', value: val }); i.addEventListener('input', () => fn(Number(i.value))); return i; };

  function panel() {
    const r = st.res;
    const sel = (opts, val, fn) => { const s = h('select', { class: 'inp xs-in clip-sel', onchange: (e) => fn(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l))); return s; };
    return h('div', { class: 'clip-panel' },
      h('div', { class: 'clip-head' },
        h('button', { type: 'button', class: 'clip-tog', 'aria-expanded': String(st.open), onclick: () => { st.open = !st.open; update(); } }, h('span', { class: 'tt-caret' }, st.open ? '▾' : '▸'), `Video clips · ${r.scenes.length}`, h('small', {}, ` ${fmtT(totalLen())} total`)),
        h('span', { class: 'grow' })),
      st.open ? h('div', { class: 'clip-body' },
        h('div', { class: 'clip-opts' },
          h('label', {}, 'Clip length (max)', sel(lenOpts(r.dur), st.custom ? 'custom' : st.maxLen, (v) => { if (v === 'custom') { st.custom = true; } else { st.custom = false; st.maxLen = v; } update(); })),
          st.custom ? h('label', {}, 'Max seconds', numIn(st.maxCustom, 1, Math.max(1, Math.floor(r.dur)), (v) => { st.maxCustom = v; })) : null,
          st.custom ? h('label', {}, 'Min seconds', numIn(st.minLen, 0.3, Math.max(1, Math.floor(r.dur)), (v) => { st.minLen = v; })) : null,
          h('button', { type: 'button', class: 'btn sm', disabled: st.busy, onclick: () => run(true), title: 'Split again with these lengths' }, 'Re-run'),
          h('button', { type: 'button', class: 'btn sm ghost', onclick: copySheet, title: 'Copies one picture with the ticked scene snapshots, ready to paste into ChatGPT' }, 'Copy snapshots')),
        h('div', { class: 'clip-pick xs' },
          h('span', { class: 'grow' }, `Tick the clips to attach to ChatGPT · ${st.sel.size}/${r.scenes.length} selected`),
          h('button', { type: 'button', class: 'linkish', onclick: () => setSel((x) => { r.scenes.forEach((q) => x.add(q.id)); }) }, 'All'),
          h('button', { type: 'button', class: 'linkish', onclick: () => setSel((x) => x.clear()) }, 'None')),
        h('div', { class: 'clip-grid' }, r.scenes.map((s, i) => {
          const len = s.end - s.start, cutting = st.cut && st.cut.i === i;
          const thumb = h('div', { class: 'clip-thumb', style: { 'background-image': `url("${s.thumb}")`, 'aspect-ratio': `${r.tw} / ${r.th}` }, title: 'Click to preview this clip', onclick: (e) => preview(s, e.currentTarget) }, h('span', { class: 'clip-n' }, i + 1), h('label', { class: 'clip-chk', title: 'Attach this snapshot to ChatGPT', onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: st.sel.has(s.id), onchange: (e) => { setSel((x) => (e.target.checked ? x.add(s.id) : x.delete(s.id))); } })), h('span', { class: 'clip-len' }, len.toFixed(1) + 's'), h('span', { class: 'clip-play' }, '▶'));
          return h('div', { class: 'clip-card' },
            thumb,
            h('div', { class: 'clip-meta xs muted' }, `${fmtT(s.start)} – ${fmtT(s.end)}`),
            cutting ? h('div', { class: 'cut-prog' }, h('i', { style: { width: Math.round(st.cut.pct * 100) + '%' } })) : null,
            h('div', { class: 'clip-act' },
              h('button', { type: 'button', class: 'btn xs-btn primary', disabled: !!st.cut, onclick: () => exportOne(i, 'use'), title: 'Cut this clip and use it as the post video' }, cutting ? 'Cutting…' : 'Use clip'),
              h('button', { type: 'button', class: 'btn xs-btn ghost', disabled: !!st.cut, onclick: () => exportOne(i, 'save'), title: 'Save this clip as a file' }, 'Save'),
              i < r.scenes.length - 1 ? h('button', { type: 'button', class: 'btn xs-btn ghost', disabled: !!st.cut, onclick: () => merge(i), title: 'Join with the next clip' }, '+ next') : null));
        })),
        h('p', { class: 'muted xs' }, `Scenes found by comparing ${r.frames} frames (every ${r.step}s). Cutting a clip plays it in real time, so a 10s clip takes about 10s.`)) : null);
  }

  return { view: () => { update(); return root; }, update, summary, hasScenes: () => !!(st.res && video() && st.res.mediaId === video().id), count: () => st.sel.size && st.res ? chosen().length : 0, nums: () => chosen().map((x) => x.i + 1), copySheet, copySheetNow, snapshots };
}
