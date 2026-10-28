// Imports the PUBLIC Linktree page (linktr.ee/<handle>) so the Linktree card can start from what is already live.
// Linktree has no public API for editing your page, so this only reads what any visitor can see.
'use strict';
const U = require('../lib/util');

function walk(o, fn, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return;
  fn(o);
  for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v, fn, depth + 1);
}

module.exports = async (req, res) => {
  if (!U.authorized(req, res)) return;
  const q = U.query(req);
  const handle = String(q.handle || '').trim().replace(/^(https?:\/\/)?(www\.)?linktr\.ee\/?/i, '').replace(/^@/, '').split(/[/?#]/)[0]; // accepts Acme_Studio, @Acme_Studio, linktr.ee/Acme_Studio, https://linktr.ee/Acme_Studio
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return U.send(res, 400, { error: 'Enter your Linktree name, e.g. linktr.ee/yourname' });
  if (U.isDemo(req)) return U.send(res, 200, { handle, imported: false, links: [] });
  try {
    const r = await fetch('https://linktr.ee/' + encodeURIComponent(handle), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialRadar/1.0)', Accept: 'text/html' }, redirect: 'follow' });
    if (r.status === 404) return U.send(res, 404, { error: 'No Linktree found at linktr.ee/' + handle });
    if (!r.ok) return U.send(res, 502, { error: 'Linktree answered HTTP ' + r.status });
    const html = await r.text();
    const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return U.send(res, 502, { error: 'Could not read that page (Linktree changed its layout).' });
    const data = JSON.parse(m[1]);
    const pp = (data.props && data.props.pageProps) || {};
    const acct = pp.account || pp.pageData || {};
    const links = [];
    const seen = new Set();
    const rawLinks = Array.isArray(pp.links) ? pp.links : (Array.isArray(acct.links) ? acct.links : null);
    const consider = (l) => {
      if (!l || typeof l !== 'object' || !l.url || !l.title || typeof l.url !== 'string') return;
      if (!/^https?:\/\//i.test(l.url) || seen.has(l.url)) return;
      seen.add(l.url);
      links.push({ title: String(l.title).slice(0, 140), url: l.url, thumb: l.thumbnail || l.thumbnailUrl || l.modifiedThumbnail || (l.thumbnails && l.thumbnails[0] && l.thumbnails[0].url) || null });
    };
    if (rawLinks) rawLinks.forEach(consider); else walk(pp, (o) => { if (!Array.isArray(o)) consider(o); });
    const socials = {};
    const socialArr = Array.isArray(pp.socialLinks) ? pp.socialLinks : (Array.isArray(acct.socialLinks) ? acct.socialLinks : []);
    for (const s of socialArr) {
      const u = s && (s.url || s.link); const t = String((s && (s.type || s.name)) || '').toLowerCase();
      if (!u) continue;
      for (const k of ['instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'whatsapp']) if (t.includes(k) || u.includes(k)) socials[k] = u;
    }
    U.send(res, 200, {
      handle, imported: true,
      name: acct.pageTitle || acct.username || handle,
      tagline: acct.description || '',
      avatar: acct.profilePictureUrl || acct.profilePicture || null,
      socials, links: links.slice(0, 60),
    });
  } catch (e) {
    U.send(res, 502, { error: 'Import failed: ' + (e.message || e) });
  }
};
