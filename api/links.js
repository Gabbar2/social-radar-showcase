// The public links page (what visitors see when they open <your site>/links) plus click counting and publishing.
// The Linktree card in Social Radar is the only place you edit; "Publish" saves the page to Vercel Blob and this route renders it.
'use strict';
const U = require('../lib/util');

const PAGE_PATH = 'social-radar/links-page.json';
const CLICK_DIR = 'social-radar/clicks/';
const MAX_BYTES = 3500 * 1024;

const SOC_SVG = {
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M13.6 21v-7.6h2.5l.4-2.9h-2.9V8.7c0-.8.3-1.4 1.5-1.4h1.5V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8.2v2.9h2.5V21"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5.5" width="18" height="13" rx="4"/><path fill="currentColor" stroke="none" d="M10.2 9.3v5.4l4.6-2.7z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.2a3.6 3.6 0 1 1-3.6-3.6M14 4c.3 2.4 1.9 4 4.4 4.2"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.5V16"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19z"/><path d="M9.5 8.8c.3 2.6 2.4 5 5 5.7l1.2-1.2-1.8-1-.8.7c-.9-.4-1.7-1.200-2.100-2.100l.7-.8-1-1.800z" fill="currentColor" stroke="none"/></svg>',
};
const SOC_NAME = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' };
const ASTERISK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10.6 2h2.8v6.4l4.5-4.5 2 2-4.5 4.5H22v2.800h-6.600l4.500 4.500-2 2-4.500-4.500V22h-2.800v-6.300l-4.500 4.500-2-2 4.500-4.500H2v-2.800h6.300L3.900 7.9l2-2 4.700 4.600z"/></svg>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okUrl = (u) => (/^(https?:\/\/|mailto:|tel:)/i.test(String(u || '')) ? String(u) : '');
const okImg = (u) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || '')) ? String(u) : '');
const okColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '#555555');

// ── storage: Vercel Blob in production, a temp file when running locally without a Blob token
const fs = require('fs'); const os = require('os'); const path = require('path');
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const tmp = (name) => path.join(os.tmpdir(), 'social-radar-' + name.replace(/[^a-z0-9]+/gi, '_'));
function blobUrl(pathname) {
  const m = String(process.env.BLOB_READ_WRITE_TOKEN || '').match(/^vercel_blob_rw_([a-z0-9]+)_/i);
  return m ? `https://${m[1].toLowerCase()}.public.blob.vercel-storage.com/${pathname}` : null;
}
async function readJson(pathname) {
  if (!hasBlob()) { try { return JSON.parse(fs.readFileSync(tmp(pathname), 'utf8')); } catch { return null; } }
  const u = blobUrl(pathname); if (!u) return null;
  try { const r = await fetch(u + '?t=' + Math.floor(Date.now() / 30000)); return r.ok ? await r.json() : null; } catch { return null; }
}
async function writeJson(pathname, obj) {
  if (!hasBlob()) { if (process.env.VERCEL) throw new Error('Media storage is not set up. In Vercel, open Storage → Create → Blob and connect it to this project, then redeploy.'); fs.writeFileSync(tmp(pathname), JSON.stringify(obj)); return; }
  const { put } = require('@vercel/blob');
  await put(pathname, JSON.stringify(obj), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
}

function clean(p) {
  p = p || {};
  const soc = {}; for (const k of Object.keys(SOC_SVG)) { const u = okUrl((p.socials || {})[k]); if (u) soc[k] = u; }
  const bg = Array.isArray(p.bg) && p.bg.length === 2 ? p.bg.map(okColor) : ['#b4c3c4', '#2b4345'];
  const links = (Array.isArray(p.links) ? p.links : []).slice(0, 80).map((l) => ({
    id: String(l.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24), title: String(l.title || '').slice(0, 120), url: okUrl(l.url), thumb: okImg(l.thumb), color: okColor(l.color),
  })).filter((l) => l.id && l.url && l.title);
  const recent = (Array.isArray(p.recent) ? p.recent : []).map((x) => String(x)).filter((x, i, a) => links.some((l) => l.id === x) && a.indexOf(x) === i).slice(0, 5);
  return { name: String(p.name || '').slice(0, 80), tagline: String(p.tagline || '').slice(0, 240), avatar: okImg(p.avatar), hero: okImg(p.hero), pill: okColor(p.pill || '#ffffff'), ink: okColor(p.ink || '#ffffff'), card: okColor(p.card || '#4a7f98'), anim: p.anim === true, bg, socials: soc, links, recent, at: new Date().toISOString() };
}

const readable = (hex) => { const n = parseInt(String(hex).slice(1), 16), L = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return L > 0.5 ? '#0b1b26' : '#ffffff'; };
const DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const SCRIPT = `(function(){var f=document.querySelector('.feat');if(!f)return;var b=document.querySelectorAll('.arrow');for(var i=0;i<b.length;i++){b[i].addEventListener('click',function(e){f.scrollBy({left:(e.currentTarget.dataset.d==='l'?-1:1)*Math.max(160,f.clientWidth*0.7),behavior:'smooth'});});}function u(){var l=document.querySelector('.arrow.l'),r=document.querySelector('.arrow.r');if(l)l.style.opacity=f.scrollLeft>8?1:0;if(l)l.style.pointerEvents=f.scrollLeft>8?'auto':'none';if(r)r.style.opacity=f.scrollLeft+f.clientWidth<f.scrollWidth-8?1:0;}f.addEventListener('scroll',u,{passive:true});u();})();`;
const scriptHash = () => "'sha256-" + require('crypto').createHash('sha256').update(SCRIPT).digest('base64') + "'";

function render(page) {
  const title = page.name || 'Links';
  const fg = page.ink || '#ffffff', cardBg = page.card || '#4a7f98';
  const tx = readable(page.pill);
  const tile = (l, cls) => (l.thumb ? `<img class="${cls}" src="${esc(l.thumb)}" alt="">` : `<span class="${cls}" style="background:${esc(l.color)}">${esc((l.title || '?')[0].toUpperCase())}</span>`);
  const go = (l) => esc('/api/links?go=' + encodeURIComponent(l.id));
  const feat = (page.recent || []).map((id) => page.links.find((l) => l.id === id)).filter(Boolean), rest = page.links;
  const featHtml = feat.length ? `<div class="featwrap"><button class="arrow l" data-d="l" aria-label="Previous" style="opacity:0">&#8249;</button><div class="feat">${feat.map((l) => `<a class="fc" href="${go(l)}" target="_blank" rel="noopener">${tile(l, 'fi')}<span class="ft"><span>${esc(l.title)}</span>${DOTS}</span></a>`).join('')}</div><button class="arrow r" data-d="r" aria-label="Next">&#8250;</button></div>` : '';
  const pills = rest.map((l, i) => `<a class="pill${page.anim && i === 0 ? ' anim' : ''}" href="${go(l)}" target="_blank" rel="noopener">${tile(l, 'th')}<span class="pt">${esc(l.title)}</span><span class="dots">${DOTS}</span></a>`).join('');
  const soc = Object.keys(page.socials).map((k) => `<a class="s" href="${esc(page.socials[k])}" target="_blank" rel="noopener" aria-label="${esc(SOC_NAME[k])}">${SOC_SVG[k]}</a>`).join('');
  const head = page.hero
    ? `<div class="hero"><img src="${esc(page.hero)}" alt=""></div><h1 class="big">${esc(title)}</h1>`
    : `<div class="av">${page.avatar ? `<img src="${esc(page.avatar)}" alt="">` : esc((title || 'H')[0].toUpperCase())}</div><h1>${esc(title)}</h1>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(page.tagline)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(page.tagline)}"><meta name="theme-color" content="${esc(page.bg[0])}">
<style>
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${fg};background:${page.bg[0]};background:linear-gradient(180deg,${page.bg[0]} 0,${page.bg[1]} 100%);background-attachment:scroll;display:flex;justify-content:center;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:540px;padding:0 16px 56px;display:flex;flex-direction:column;align-items:center;overflow:hidden}
.hero{position:relative;width:calc(100% + 32px);margin:0 -16px;height:clamp(230px,62vw,330px);flex:none}.hero img{width:100%;height:100%;object-fit:cover;display:block}.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 50%,${page.bg[0]} 100%)}
h1{margin:12px 0 0;font-size:26px;letter-spacing:-.015em;text-align:center}h1.big{margin-top:-46px;font-size:clamp(30px,8.5vw,40px);font-weight:800;position:relative;z-index:1}
.av{width:104px;height:104px;border-radius:50%;overflow:hidden;background:#111;color:#fff;display:grid;place-items:center;font-size:44px;font-weight:800;box-shadow:0 0 0 3px rgba(255,255,255,.35);margin-top:34px}.av img{width:100%;height:100%;object-fit:cover}
.tag{text-shadow:0 1px 6px rgba(0,0,0,.35);margin:8px 0 0;text-align:center;font-size:15px;font-weight:600;line-height:1.45;opacity:.96;max-width:430px}
.soc{display:flex;gap:18px;margin:16px 0 20px}.s{color:inherit;display:grid;place-items:center}.s svg{width:26px;height:26px}
.featwrap{position:relative;width:calc(100% + 32px);margin:0 -16px 18px}
.feat{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding:2px 16px 6px;scroll-padding:0 16px}.feat::-webkit-scrollbar{display:none}
.fc{flex:none;width:176px;scroll-snap-align:start;border-radius:26px;overflow:hidden;background:${cardBg};color:#fff;text-decoration:none;display:flex;flex-direction:column;box-shadow:0 3px 12px rgba(0,0,0,.18);transition:transform .15s}.fc:hover{transform:translateY(-2px)}
.fi{width:100%;aspect-ratio:1;object-fit:cover;display:grid;place-items:center;color:#fff;font-weight:800;font-size:44px}
.ft{display:flex;align-items:center;gap:6px;padding:12px 12px 14px;font-size:15px;font-weight:700;line-height:1.25;min-height:50px}.ft>span{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.ft svg{flex:none;opacity:.7}
.arrow{position:absolute;top:34%;width:38px;height:38px;border-radius:50%;border:0;background:#fff;color:#0b1b26;font-size:24px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .2s;z-index:2}.arrow.l{left:10px}.arrow.r{right:10px}
.links{width:100%;display:flex;flex-direction:column;gap:12px}
.pill{display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 16px 8px 9px;border-radius:999px;background:${page.pill};color:${tx};text-decoration:none;box-shadow:0 1px 0 rgba(0,0,0,.08);transition:transform .12s,filter .12s}.pill:hover{transform:scale(1.012);filter:brightness(1.04)}.pill:focus-visible,.fc:focus-visible{outline:3px solid #fff;outline-offset:2px}
.th{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;display:grid;place-items:center;color:#fff;font-weight:800;font-size:17px}.pt{flex:1;text-align:center;font-size:15px;font-weight:600;line-height:1.25}.dots{width:24px;display:grid;place-items:center;flex:none;opacity:.65}
.pill.anim{animation:nudge 4.5s ease-in-out infinite}@keyframes nudge{0%,82%,100%{transform:none}86%{transform:scale(1.035) rotate(-.6deg)}90%{transform:scale(1.035) rotate(.6deg)}94%{transform:scale(1.02)}}
@media (prefers-reduced-motion:reduce){.pill.anim{animation:none}}
@media (min-width:700px){main{margin-top:28px;border-radius:30px 30px 0 0}}
</style></head><body><main>
${head}
${page.tagline ? `<p class="tag">${esc(page.tagline)}</p>` : ''}
${soc ? `<div class="soc">${soc}</div>` : '<div style="height:18px"></div>'}
${featHtml}
<div class="links">${pills || (feat.length ? '' : '<p style="text-align:center;opacity:.8">No links yet</p>')}</div>
</main>${feat.length ? `<script>${SCRIPT}</script>` : ''}</body></html>`;
}

module.exports = async (req, res) => {
  const q = U.query(req);
  const origin = U.origin(req);

  // visitors: the page
  if (q.view) {
    const page = await readJson(PAGE_PATH);
    res.setHeader('Content-Security-Policy', `default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src ${scriptHash()}; base-uri 'none'; form-action 'none'`);
    res.setHeader('X-Robots-Tag', 'all');
    if (!page) return U.html(res, 404, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Links</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>This links page has not been published yet.</p>');
    res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.end(render(page));
  }

  // visitors: a click — count it, then go
  if (q.go) {
    const id = String(q.go).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const page = await readJson(PAGE_PATH);
    const link = page && page.links.find((l) => l.id === id);
    if (!link) { res.statusCode = 302; res.setHeader('Location', '/links'); return res.end(); }
    try {
      if (hasBlob()) { const { put } = require('@vercel/blob'); await put(`${CLICK_DIR}${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, '1', { access: 'public', addRandomSuffix: false, contentType: 'text/plain' }); }
      else { const c = JSON.parse(fs.existsSync(tmp('clicks')) ? fs.readFileSync(tmp('clicks'), 'utf8') : '{}'); c[id] = (c[id] || 0) + 1; fs.writeFileSync(tmp('clicks'), JSON.stringify(c)); }
    } catch { /* counting is best effort: the link must always work */ }
    res.statusCode = 302; res.setHeader('Location', link.url); res.setHeader('Cache-Control', 'no-store'); return res.end();
  }

  // you: counts and publishing
  if (!U.authorized(req, res)) return;
  if (q.stats) {
    const counts = {};
    try {
      if (hasBlob()) {
        const { list } = require('@vercel/blob'); let cursor;
        do { const r = await list({ prefix: CLICK_DIR, cursor, limit: 1000 }); for (const b of r.blobs) { const id = b.pathname.slice(CLICK_DIR.length).split('/')[0]; counts[id] = (counts[id] || 0) + 1; } cursor = r.hasMore ? r.cursor : null; } while (cursor);
      } else Object.assign(counts, JSON.parse(fs.existsSync(tmp('clicks')) ? fs.readFileSync(tmp('clicks'), 'utf8') : '{}'));
    } catch (e) { return U.send(res, 200, { counts: {}, note: e.message }); }
    return U.send(res, 200, { counts });
  }
  if (U.isDemo(req)) return U.send(res, 200, { ok: true, demo: true, url: origin + '/l', at: new Date().toISOString() });
  if (req.method !== 'POST') return U.send(res, 405, { error: 'POST the page to publish it' });
  const body = await U.readBody(req);
  const page = clean(body.page);
  if (JSON.stringify(page).length > MAX_BYTES) return U.send(res, 413, { error: 'The page is too big — use smaller thumbnails or fewer links.' });
  try { await writeJson(PAGE_PATH, page); } catch (e) { return U.send(res, 500, { error: e.message }); }
  return U.send(res, 200, { ok: true, url: origin + '/l', at: page.at, links: page.links.length });
};
