// Talking to each platform: publishing, account + post stats, comments. Instagram, Facebook and YouTube are
// called straight from your browser; TikTok and LinkedIn go through this site's /api routes (they need the app secret).
import { api, store, sleep, DEMO, P, uid } from './core.js';
import { upload as blobUpload } from './vendor/blob-client.js';

const day = 86400e3;

// ───────────────────────── media preparation
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read the image')); i.src = src; });
}
const toBlob = (c, type = 'image/jpeg', q = 0.92) => new Promise((r) => c.toBlob(r, type, q));

// Instagram only takes JPEG, so every photo is re-encoded (max 2160 px on the long side).
export async function toJpeg(file, max = 2160) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { blob: await toBlob(c), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
// Instagram feed photos must be between 4:5 (tall) and 1.91:1 (wide); pad anything outside that with a blurred fill.
export const igRatioOk = (w, h) => { const r = w / h; return r >= 0.8 - 0.005 && r <= 1.91 + 0.005; };
export async function padTo(blob, w, h, target) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    let W = w, H = h;
    if (w / h < target.min) W = Math.round(h * target.min); else if (w / h > target.max) H = Math.round(w / target.max);
    if (target.exact) { if (w / h > target.exact) H = Math.round(w / target.exact); else W = Math.round(h * target.exact); }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cover = Math.max(W / w, H / h);
    g.filter = 'blur(40px) brightness(.8)';
    g.drawImage(img, (W - w * cover) / 2, (H - h * cover) / 2, w * cover, h * cover);
    g.filter = 'none';
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return { blob: await toBlob(c), w: W, h: H };
  } finally { URL.revokeObjectURL(url); }
}
export async function thumbOf(file, size = 160) {
  try {
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 4000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      await new Promise((r) => { v.onseeked = r; setTimeout(r, 2500); });
      const s = size / Math.max(v.videoWidth || size, v.videoHeight || size);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((v.videoWidth || size) * s)); c.height = Math.max(1, Math.round((v.videoHeight || size) * s));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const meta = { w: v.videoWidth, h: v.videoHeight, dur: v.duration };
      URL.revokeObjectURL(url);
      return { thumb: c.toDataURL('image/jpeg', 0.7), ...meta };
    }
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const s = size / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return { thumb: c.toDataURL('image/jpeg', 0.75), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return { thumb: null }; }
}

// Put a file where the platforms can fetch it (Vercel Blob). Returns its public link.
export async function hostFile(blob, name, onProgress) {
  if (DEMO) { await sleep(500); onProgress && onProgress(100); return URL.createObjectURL(blob); }
  const safe = String(name || 'media').replace(/[^a-z0-9._-]+/gi, '-').slice(-60);
  const r = await blobUpload('social-radar/' + Date.now() + '-' + safe, blob, {
    access: 'public', handleUploadUrl: '/api/blob', multipart: blob.size > 20 * 1024 * 1024,
    clientPayload: JSON.stringify({ passcode: store.get('passcode', '') || '' }),
    onUploadProgress: (e) => onProgress && onProgress(Math.round(e.percentage)),
  });
  return r.url;
}
export async function deleteHosted(urls) {
  urls = (urls || []).filter((u) => /^https:/.test(u));
  if (!urls.length || DEMO) return;
  try { await api('/api/blob?action=delete', { body: { urls } }); } catch { /* storage cleans up later */ }
}

// ───────────────────────── Facebook Graph (Instagram + Facebook)
export function createPlatforms(ctx) {
  const { S, google } = ctx;
  const GRAPH = () => 'https://graph.facebook.com/' + (S.config.graphVersion || 'v23.0');
  const page = () => (S.accounts.meta && S.accounts.meta.pages || []).find((p) => p.id === S.accounts.meta.pageId) || null;

  async function graph(path, params = {}, method = 'GET', token) {
    const u = new URL(GRAPH() + path);
    const tok = token || (page() && page().token);
    let body;
    if (method === 'GET') { for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('access_token', tok); }
    else { body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])), access_token: tok }); }
    let r;
    try { r = await fetch(u, { method, body }); } catch { throw new Error('Couldn\'t reach Facebook — check your connection or turn off an ad-blocker for this site.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = j.error || {};
      if (e.code === 190) throw new Error('Facebook sign-in expired — reconnect Facebook under Accounts.');
      if (e.code === 10 || e.code === 200) throw new Error((e.error_user_msg || e.message) + ' — reconnect Facebook and allow every permission.');
      throw Object.assign(new Error(e.error_user_msg || e.message || 'Facebook HTTP ' + r.status), { code: e.code, sub: e.error_subcode });
    }
    return j;
  }

  async function igWait(id, onStage) {
    for (let i = 0; i < 120; i++) {
      const s = await graph('/' + id, { fields: 'status_code,status' });
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram could not process the media: ' + (s.status || s.status_code));
      onStage && onStage('Instagram is processing…');
      await sleep(i < 5 ? 2000 : 4000);
    }
    throw new Error('Instagram is still processing after 8 minutes — check the app in a moment.');
  }
  async function igContainer(ig, params) {
    try { return (await graph(`/${ig}/media`, params, 'POST')).id; }
    catch (e) {
      if (params.alt_text && /alt_text/i.test(e.message)) { const { alt_text, ...rest } = params; return (await graph(`/${ig}/media`, rest, 'POST')).id; }
      throw e;
    }
  }

  // ───────────────────────── publishing
  const publish = {
    async ig({ media, caption, opt, onStage }) {
      if (DEMO) return demoPublish('ig', onStage);
      const pg = page();
      if (!pg || !pg.ig) throw new Error('No Instagram account is linked to the chosen Facebook Page.');
      const ig = pg.ig.id;
      if (!media.length) throw new Error('Instagram needs a photo or video.');
      let creation;
      if (opt.format === 'story') {
        const ids = [];
        for (const m of media) {
          onStage('Creating story…');
          const id = await igContainer(ig, m.type === 'video' ? { media_type: 'STORIES', video_url: m.igUrl || m.url } : { media_type: 'STORIES', image_url: m.igUrl || m.url });
          await igWait(id, onStage);
          ids.push((await graph(`/${ig}/media_publish`, { creation_id: id }, 'POST')).id);
        }
        return { id: ids[0], ids, url: `https://www.instagram.com/stories/${pg.ig.username}/`, note: media.length > 1 ? media.length + ' stories' : 'Story' };
      }
      if (media.length > 1) {
        const children = [];
        for (const [i, m] of media.slice(0, 10).entries()) {
          onStage(`Carousel item ${i + 1}/${Math.min(10, media.length)}…`);
          const id = await igContainer(ig, m.type === 'video' ? { media_type: 'VIDEO', video_url: m.url, is_carousel_item: true } : { image_url: m.igUrl || m.url, is_carousel_item: true, alt_text: m.alt || undefined });
          if (m.type === 'video') await igWait(id, onStage);
          children.push(id);
        }
        creation = await igContainer(ig, { media_type: 'CAROUSEL', children: children.join(','), caption });
      } else if (media[0].type === 'video') {
        creation = await igContainer(ig, { media_type: 'REELS', video_url: media[0].url, caption, share_to_feed: opt.shareToFeed !== false });
      } else {
        const p = { image_url: media[0].igUrl || media[0].url, caption };
        if (media[0].alt) p.alt_text = media[0].alt;
        creation = await igContainer(ig, p);
      }
      await igWait(creation, onStage);
      onStage('Publishing…');
      const id = (await graph(`/${ig}/media_publish`, { creation_id: creation }, 'POST')).id;
      let url = null;
      try { url = (await graph('/' + id, { fields: 'permalink' })).permalink; } catch { /* ignore */ }
      return { id, url };
    },

    async fb({ media, caption, opt, onStage }) {
      if (DEMO) return demoPublish('fb', onStage);
      const pg = page();
      if (!pg) throw new Error('Choose a Facebook Page under Accounts.');
      const pid = pg.id;
      const link = async (postId) => { try { return (await graph('/' + postId, { fields: 'permalink_url' })).permalink_url; } catch { return 'https://www.facebook.com/' + postId; } };
      const video = media.find((m) => m.type === 'video');
      if (opt.format === 'story') {
        if (!media.length) throw new Error('A Facebook story needs a photo or video.');
        const m = media[0];
        if (m.type === 'video') { onStage('Uploading story video…'); const r = await api('/api/meta?action=video-story', { body: { pageId: pid, pageToken: pg.token, videoUrl: m.url } }); return { id: r.id, url: 'https://www.facebook.com/' + pid, note: 'Story' }; }
        onStage('Creating story…');
        const ph = await graph(`/${pid}/photos`, { url: m.url, published: false }, 'POST');
        const st = await graph(`/${pid}/photo_stories`, { photo_id: ph.id }, 'POST');
        return { id: st.post_id || ph.id, url: 'https://www.facebook.com/' + pid, note: 'Story' };
      }
      if (media.length > 1 && opt.format !== 'reel') {
        // Multi-media feed post: upload every item unpublished (photos and videos), keep the order, then attach them all to one post.
        const ids = [];
        for (const [i, m] of media.entries()) {
          onStage(`${m.type === 'video' ? 'Video' : 'Photo'} ${i + 1}/${media.length}…`);
          if (m.type === 'video') {
            const v = await graph(`/${pid}/videos`, { file_url: m.url, published: false }, 'POST');
            for (let t = 0; t < 60; t++) {
              let st; try { st = (await graph('/' + v.id, { fields: 'status' })).status; } catch { st = null; }
              const vs = st && st.video_status;
              if (vs === 'ready') break;
              if (vs === 'error') throw new Error(`Facebook could not process video ${i + 1}.`);
              await new Promise((r) => setTimeout(r, 5000));
            }
            ids.push(v.id);
          } else ids.push((await graph(`/${pid}/photos`, { url: m.url, published: false, ...(m.alt ? { alt_text_custom: m.alt } : {}) }, 'POST')).id);
        }
        onStage('Posting…');
        const r = await graph(`/${pid}/feed`, { message: caption, attached_media: ids.map((x) => ({ media_fbid: x })) }, 'POST');
        return { id: r.id, url: await link(r.id), note: media.length + ' items' };
      }
      if (video && (opt.format === 'reel')) {
        onStage('Uploading reel…');
        const r = await api('/api/meta?action=reel', { body: { pageId: pid, pageToken: pg.token, videoUrl: video.url, description: caption } });
        return { id: r.id, url: 'https://www.facebook.com/reel/' + r.id };
      }
      if (video) {
        onStage('Uploading video…');
        const r = await graph(`/${pid}/videos`, { file_url: video.url, description: caption, title: (opt.title || '').slice(0, 250) || undefined }, 'POST');
        return { id: r.id, url: 'https://www.facebook.com/' + pid + '/videos/' + r.id };
      }
      if (media.length === 1) {
        onStage('Posting photo…');
        const r = await graph(`/${pid}/photos`, { url: media[0].url, message: caption, ...(media[0].alt ? { alt_text_custom: media[0].alt } : {}) }, 'POST');
        return { id: r.post_id || r.id, url: await link(r.post_id || r.id) };
      }
      if (media.length > 1) {
        const ids = [];
        for (const [i, m] of media.entries()) { onStage(`Photo ${i + 1}/${media.length}…`); ids.push((await graph(`/${pid}/photos`, { url: m.url, published: false, ...(m.alt ? { alt_text_custom: m.alt } : {}) }, 'POST')).id); }
        const r = await graph(`/${pid}/feed`, { message: caption, attached_media: ids.map((x) => ({ media_fbid: x })) }, 'POST');
        return { id: r.id, url: await link(r.id) };
      }
      onStage('Posting…');
      const r = await graph(`/${pid}/feed`, { message: caption, ...(opt.link ? { link: opt.link } : {}) }, 'POST');
      return { id: r.id, url: await link(r.id) };
    },

    async yt({ media, caption, opt, onStage, onProgress }) {
      const v = media.find((m) => m.type === 'video');
      if (!v) throw new Error('YouTube needs a video.');
      if (DEMO) return demoPublish('yt', onStage, onProgress);
      if (!google.valid()) await google.renew();
      if (!google.valid()) throw new Error('Reconnect Google (top of the page) to upload to YouTube.');
      let title = (opt.title || caption.split('\n')[0] || 'New video').slice(0, 100);
      let desc = (opt.desc || caption).slice(0, 5000);
      if (opt.short && !/#shorts/i.test(title + desc)) desc = (desc + '\n\n#Shorts').trim();
      const meta = {
        snippet: { title, description: desc, tags: String(opt.tags || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30), categoryId: opt.category || '28' },
        status: { privacyStatus: opt.privacy || 'public', selfDeclaredMadeForKids: !!opt.kids, containsSyntheticMedia: !!opt.ai },
      };
      onStage('Starting upload…');
      const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + google.token(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(v.file.size), 'X-Upload-Content-Type': v.file.type || 'video/mp4' },
        body: JSON.stringify(meta),
      });
      if (!start.ok) { const j = await start.json().catch(() => ({})); throw new Error((j.error && j.error.message) || 'YouTube HTTP ' + start.status); }
      const loc = start.headers.get('Location');
      const res = await new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('PUT', loc);
        x.setRequestHeader('Content-Type', v.file.type || 'video/mp4');
        x.upload.onprogress = (e) => { if (e.lengthComputable) { onProgress(Math.round((e.loaded / e.total) * 100)); onStage('Uploading to YouTube…'); } };
        x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 ? resolve(j) : reject(new Error((j.error && j.error.message) || 'YouTube HTTP ' + x.status)); } catch { reject(new Error('YouTube HTTP ' + x.status)); } };
        x.onerror = () => reject(new Error('The upload to YouTube was interrupted — check your connection and try again.'));
        x.send(v.file);
      });
      const locked = res.status && res.status.privacyStatus === 'private' && meta.status.privacyStatus !== 'private';
      return { id: res.id, url: 'https://youtu.be/' + res.id, note: locked ? 'Uploaded as private (YouTube audit pending)' : (opt.short ? 'Short' : null) };
    },

    async tt({ media, caption, opt, onStage }) {
      const v = media.find((m) => m.type === 'video');
      if (!v) throw new Error('TikTok needs a video (post photo slideshows from the TikTok app).');
      if (DEMO) return demoPublish('tt', onStage);
      const token = await ttToken();
      onStage(opt.mode === 'inbox' ? 'Sending to your TikTok drafts…' : 'Sending to TikTok…');
      const post = {
        title: caption.slice(0, 2200), privacy_level: opt.privacy || 'SELF_ONLY',
        disable_comment: !opt.comment, disable_duet: !opt.duet, disable_stitch: !opt.stitch,
        brand_content_toggle: !!opt.brandPartner, brand_organic_toggle: !!opt.brandOwn, is_aigc: !!opt.ai,
      };
      const r = await api('/api/tiktok?action=publish', { body: { token, mediaUrl: v.url, size: v.size, mode: opt.mode, post } });
      for (let i = 0; i < 90; i++) {
        await sleep(i < 5 ? 3000 : 5000);
        const s = await api('/api/tiktok?action=status', { body: { token, publishId: r.publishId } });
        if (s.status === 'PUBLISH_COMPLETE') {
          const pid = (s.publicaly_available_post_id || [])[0];
          return { id: pid || r.publishId, url: pid && S.accounts.tiktok.user && S.accounts.tiktok.user.username ? `https://www.tiktok.com/@${S.accounts.tiktok.user.username}/video/${pid}` : 'https://www.tiktok.com/', note: post.privacy_level === 'SELF_ONLY' ? 'Posted as private (TikTok audit pending)' : null };
        }
        if (s.status === 'SEND_TO_USER_INBOX') return { id: r.publishId, url: null, note: 'In your TikTok inbox — open the TikTok app to finish and post', inbox: true };
        if (s.status === 'FAILED') throw new Error('TikTok rejected the video: ' + (s.fail_reason || 'unknown reason'));
        onStage('TikTok is processing…');
      }
      return { id: r.publishId, note: 'Still processing on TikTok — check the app' };
    },

    async li({ media, caption, opt, onStage }) {
      if (DEMO) return demoPublish('li', onStage);
      const a = S.accounts.linkedin;
      if (!a || !(a.token || a.pagesToken)) throw new Error('Connect LinkedIn under Accounts.');
      const au = opt.author || a.author || (a.person && a.person.urn);
      const t0 = liTok(a, au);
      if (!t0.token) throw new Error(t0.page ? 'Connect the Acme Studio Page under Accounts → LinkedIn.' : 'Connect your LinkedIn profile under Accounts.');
      if (t0.exp && t0.exp < Date.now()) throw new Error('LinkedIn sign-in expired — reconnect LinkedIn under Accounts.');
      onStage(media.length ? 'Uploading to LinkedIn…' : 'Posting…');
      const r = await api('/api/linkedin?action=post', { body: { token: t0.token, author: au, text: caption, link: opt.link, media: media.map((m) => ({ url: m.url, type: m.type, alt: m.alt })) } });
      return { id: r.urn, url: r.url, author: au };
    },
  };

  async function firstComment(p, result, text) {
    if (!text || !result || !result.id || result.inbox) return;
    if (DEMO) return sleep(300);
    if (p === 'ig') return graph(`/${result.id}/comments`, { message: text }, 'POST');
    if (p === 'fb') return graph(`/${result.id}/comments`, { message: text }, 'POST');
    if (p === 'yt') return google.gfetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', { method: 'POST', body: { snippet: { videoId: result.id, topLevelComment: { snippet: { textOriginal: text } } } } });
    if (p === 'li') { const a = S.accounts.linkedin; const au = (result && result.author) || a.author || a.person.urn; return api('/api/linkedin?action=comment', { body: { token: liTok(a, au).token, actor: au, urn: result.id, text } }); }
  }

  async function ttToken() {
    const a = S.accounts.tiktok;
    if (!a || !a.token) throw new Error('Connect TikTok under Accounts.');
    if (a.exp > Date.now()) return a.token;
    const t = await api('/api/tiktok?action=refresh', { body: { refresh: a.refresh } });
    Object.assign(a, t);
    ctx.saveAccounts();
    return a.token;
  }

  async function tiktokCreator() {
    if (DEMO) return { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'], creator_nickname: 'acmestudio', max_video_post_duration_sec: 600 };
    return api('/api/tiktok?action=creator', { body: { token: await ttToken() } });
  }

  // ───────────────────────── stats: { account, posts }
  async function pool(items, size, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const n = i++; try { out[n] = await fn(items[n]); } catch { out[n] = null; } } }));
    return out;
  }
  const sum = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const within28 = (p) => Date.now() - new Date(p.at).getTime() <= 28 * day;

  const stats = {
    // Instagram stats, with a self-check: if Meta says the saved Instagram ID is unreadable, ask the Page which account is linked now.
    async ig() {
      try { return await stats.igRaw(); }
      catch (e) {
        const pg = page();
        if (!pg || !pg.ig || !/does not exist|missing permissions|Unsupported get request/i.test(e.message || '')) throw e;
        let cur = null; try { cur = (await graph('/' + pg.id, { fields: 'instagram_business_account{id,username}' })).instagram_business_account || null; } catch { /* can't tell */ }
        if (cur && cur.id !== pg.ig.id) { pg.ig.id = cur.id; if (cur.username) pg.ig.username = cur.username; ctx.saveAccounts(); return stats.igRaw(); }
        throw new Error(cur
          ? `Instagram @${pg.ig.username || ''} is linked to the Page, but this Facebook login can no longer read it. Reconnect Facebook (Accounts) and, in Meta's window, switch ON the Instagram account and every permission.`
          : `Meta says this Facebook Page has no Instagram account linked now. Link @${pg.ig.username || 'your Instagram'} to the Page (Meta Business Suite → Settings → Accounts → Instagram), then reconnect Facebook under Accounts.`);
      }
    },
    async igRaw() {
      const pg = page(); if (!pg || !pg.ig) throw new Error('not connected');
      const ig = pg.ig.id;
      const acct = await graph('/' + ig, { fields: 'username,name,profile_picture_url,followers_count,media_count' });
      let totals = {};
      try {
        const ins = await graph(`/${ig}/insights`, { metric: 'views,reach,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', since: Math.floor((Date.now() - 28 * day) / 1000), until: Math.floor(Date.now() / 1000) });
        for (const m of ins.data || []) totals[m.name] = m.total_value && m.total_value.value;
      } catch (e) { totals.note = e.message; }
      const media = await graph(`/${ig}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url', limit: 50 });
      const posts = (media.data || []).map((m) => ({ platform: 'ig', id: m.id, at: m.timestamp, text: m.caption || '', thumb: m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : null), url: m.permalink, type: m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : m.media_type === 'VIDEO' ? 'Video' : 'Photo', likes: m.like_count, comments: m.comments_count }));
      await pool(posts, 5, async (p) => {
        let d;
        try { d = await graph(`/${p.id}/insights`, { metric: 'views,reach,saved,shares,total_interactions' }); }
        catch { d = await graph(`/${p.id}/insights`, { metric: 'reach,saved,shares' }); }
        for (const m of d.data || []) { const v = m.values ? m.values[0].value : m.total_value && m.total_value.value; if (m.name === 'saved') p.saves = v; else p[m.name === 'total_interactions' ? 'interactions' : m.name] = v; }
      });
      const recent = posts.filter(within28);
      return {
        account: { platform: 'ig', name: acct.name || acct.username, handle: '@' + acct.username, picture: acct.profile_picture_url, followers: acct.followers_count, views28: totals.views ?? sum(recent, 'views'), reach28: totals.reach, eng28: totals.total_interactions ?? (sum(recent, 'likes') + sum(recent, 'comments') + sum(recent, 'shares') + sum(recent, 'saves')), posts: acct.media_count, note: totals.note },
        posts,
      };
    },
    async fb() {
      const pg = page(); if (!pg) throw new Error('not connected');
      const info = await graph('/' + pg.id, { fields: 'name,username,picture{url},followers_count,fan_count' });
      let views28 = null, eng28 = null, note;
      for (const set of [['page_media_view', 'page_post_engagements'], ['page_impressions_unique', 'page_post_engagements']]) {
        try {
          const ins = await graph(`/${pg.id}/insights`, { metric: set.join(','), period: 'days_28' });
          for (const m of ins.data || []) { const v = m.values && m.values[m.values.length - 1].value; if (m.name === 'page_post_engagements') eng28 = v; else views28 = v; }
          note = null; break;
        } catch (e) { note = e.message; }
      }
      const feed = await graph(`/${pg.id}/published_posts`, { fields: 'id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)', limit: 50 });
      const posts = (feed.data || []).map((p) => ({ platform: 'fb', id: p.id, at: p.created_time, text: p.message || '', thumb: p.full_picture, url: p.permalink_url, type: /video/.test(p.status_type || '') ? 'Video' : p.full_picture ? 'Photo' : 'Post', likes: p.reactions && p.reactions.summary.total_count, comments: p.comments && p.comments.summary.total_count, shares: p.shares ? p.shares.count : 0 }));
      let metric = store.get('fbPostMetric', 'post_media_view');
      await pool(posts.slice(0, 15), 4, async (p) => {
        try { const d = await graph(`/${p.id}/insights`, { metric }); p.views = d.data && d.data[0] && d.data[0].values[0].value; }
        catch { metric = metric === 'post_media_view' ? 'post_impressions_unique' : 'post_media_view'; store.set('fbPostMetric', metric); }
      });
      const recent = posts.filter(within28);
      return {
        account: { platform: 'fb', name: info.name, handle: info.username ? '@' + info.username : 'Page', picture: info.picture && info.picture.data && info.picture.data.url, followers: info.followers_count ?? info.fan_count, views28: views28 ?? sum(recent, 'views'), eng28: eng28 ?? (sum(recent, 'likes') + sum(recent, 'comments') + sum(recent, 'shares')), note },
        posts,
      };
    },
    async yt() {
      if (!google.valid()) await google.renew();
      if (!google.valid()) throw new Error('Reconnect Google to load YouTube.');
      const g = google.gfetch;
      const ch = await g('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true');
      const c = ch.items && ch.items[0];
      if (!c) throw new Error('This Google account has no YouTube channel.');
      S.accounts.youtube = { id: c.id, title: c.snippet.title, picture: c.snippet.thumbnails && c.snippet.thumbnails.default.url, handle: c.snippet.customUrl };
      let rep = {};
      try {
        const end = new Date().toISOString().slice(0, 10), start = new Date(Date.now() - 28 * day).toISOString().slice(0, 10);
        const r = await g(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=views,likes,comments,shares,subscribersGained`);
        (r.columnHeaders || []).forEach((hd, i) => { rep[hd.name] = r.rows && r.rows[0] ? r.rows[0][i] : 0; });
      } catch (e) { rep.note = e.message; }
      const up = c.contentDetails.relatedPlaylists.uploads;
      const pl = await g(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${up}`);
      const ids = (pl.items || []).map((x) => x.contentDetails.videoId);
      let posts = [];
      if (ids.length) {
        const vs = await g(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.join(',')}`);
        posts = (vs.items || []).map((v) => ({ platform: 'yt', id: v.id, at: v.snippet.publishedAt, text: v.snippet.title + (v.snippet.description ? '\n' + v.snippet.description : ''), title: v.snippet.title, thumb: v.snippet.thumbnails && (v.snippet.thumbnails.medium || v.snippet.thumbnails.default).url, url: 'https://youtu.be/' + v.id, type: /^PT(\d+S|[0-2]M(\d+S)?|3M)$/.test(v.contentDetails.duration) ? 'Short' : 'Video', privacy: v.status.privacyStatus, views: +v.statistics.viewCount || 0, likes: +v.statistics.likeCount || 0, comments: +v.statistics.commentCount || 0 }));
      }
      return {
        account: { platform: 'yt', name: c.snippet.title, handle: c.snippet.customUrl || 'Channel', picture: c.snippet.thumbnails && c.snippet.thumbnails.default.url, followers: +c.statistics.subscriberCount || 0, views28: rep.views ?? null, eng28: rep.likes != null ? rep.likes + rep.comments + rep.shares : null, totalViews: +c.statistics.viewCount, note: rep.note },
        posts,
      };
    },
    async tt() {
      const r = await api('/api/tiktok?action=stats', { body: { token: await ttToken() } });
      const u = r.user || {};
      S.accounts.tiktok.user = { name: u.display_name, username: u.username, picture: u.avatar_url };
      const posts = (r.videos || []).map((v) => ({ platform: 'tt', id: v.id, at: new Date(v.create_time * 1000).toISOString(), text: v.title || v.video_description || '', thumb: v.cover_image_url, url: v.share_url, type: 'Video', views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count }));
      const recent = posts.filter(within28);
      return { account: { platform: 'tt', name: u.display_name, handle: u.username ? '@' + u.username : '', picture: u.avatar_url, followers: u.follower_count, views28: posts.length ? sum(recent, 'views') : null, eng28: posts.length ? sum(recent, 'likes') + sum(recent, 'comments') + sum(recent, 'shares') : null, likesTotal: u.likes_count, note: posts.length ? 'Views counted from videos posted in the last 28 days' : 'Video stats need TikTok\'s video.list permission' }, posts };
    },
    async li() {
      const a = S.accounts.linkedin;
      const author = a.author || a.person.urn;
      const r = await api('/api/linkedin?action=stats', { body: { token: liTok(a, author).token, author } });
      const isOrg = author.includes('organization');
      const org = isOrg ? (a.orgs || []).find((o) => o.urn === author) : null;
      const posts = (r.posts || []).map((p) => ({ platform: 'li', id: p.urn, at: new Date(p.at || Date.now()).toISOString(), text: p.text || '', url: 'https://www.linkedin.com/feed/update/' + p.urn, type: 'Post', likes: p.likes, comments: p.comments }));
      return { account: { platform: 'li', name: org ? org.name : a.person.name, handle: isOrg ? 'Company page' : 'Profile', picture: isOrg ? null : a.person.picture, followers: r.followers, views28: r.totals ? r.totals.impressionCount : null, eng28: r.totals ? (r.totals.likeCount || 0) + (r.totals.commentCount || 0) + (r.totals.shareCount || 0) : null, note: r.note || (!isOrg ? 'LinkedIn gives views only for company Pages' : null) }, posts };
    },
  };


  // ───────────────────────── inbox (Instagram DMs + Facebook Messenger)
  // which LinkedIn token to use: the Pages app's for company Pages, the personal app's for you
  function liTok(a, author) { const page = String(author || '').includes('organization'); return page ? { page, token: a.pagesToken || (a.orgs && a.orgs.length ? a.token : null), exp: a.pagesToken ? a.pagesExp : a.exp } : { page, token: a.token, exp: a.exp }; }
  async function inboxList() {
    const pg = page();
    if (DEMO) return demoInbox();
    if (!pg) return { convs: [], errors: ['Connect Facebook under Accounts to read messages.'] };
    const convs = [], errors = [], ok = {};
    const fields = 'id,updated_time,unread_count,snippet,participants,messages.limit(1){message,from,created_time}';
    const mine = new Set([pg.id, pg.ig && pg.ig.id].filter(Boolean));
    const grab = async (platform) => {
      try {
        const base = platform === 'ig' ? { platform: 'instagram' } : {};
        const tries = platform === 'ig' ? [{ fields: 'id', limit: 1 }, { fields: 'id,updated_time', limit: 10 }, { fields: 'id', limit: 5 }, { fields: 'id,updated_time,participants', limit: 10 }, { fields, limit: 5 }] : [{ fields, limit: 25 }, { fields, limit: 10 }];
        let r, lastErr, firstErr;
        for (const t of tries) { try { r = await graph(`/${pg.id}/conversations`, { ...base, ...t }); break; } catch (e) { lastErr = firstErr || e; firstErr = firstErr || e; if (!/reduce the amount|too much data|code 1\b/i.test(e.message) && e.code !== 1) throw e; } }
        if (!r && platform === 'ig' && pg.ig && pg.ig.id) { // last resort: ask the Instagram account itself, tiny request
          for (const t of [{ fields: 'id', limit: 1 }, { fields: 'id,updated_time', limit: 5 }, { limit: 3 }]) { try { r = await graph(`/${pg.ig.id}/conversations`, { platform: 'instagram', ...t }); break; } catch (e) { /* keep the first error */ } }
        }
        if (!r) throw lastErr;
        ok[platform] = { complete: !(r.paging && r.paging.next) };
        let rows = r.data || [];
        if (rows.length && rows.some((c) => !c.participants)) {  // minimal list: fill each conversation in separately (small requests)
          rows = await Promise.all(rows.slice(0, 10).map(async (c) => { if (c.participants) return c; try { return { ...c, ...(await graph(`/${c.id}`, { fields: 'updated_time,participants,messages.limit(1){message,from,created_time}' })) }; } catch { return c; } }));
        }
        for (const c of rows) {
          const other = ((c.participants || {}).data || []).find((x) => !mine.has(x.id)) || {};
          const last = ((c.messages || {}).data || [])[0] || {};
          convs.push({ platform, id: c.id, userId: other.id, name: other.name || (other.username ? '@' + other.username : 'Unknown'), handle: other.username || '', snippet: last.message || c.snippet || '(attachment)', at: c.updated_time, unread: c.unread_count || 0, fromMe: !!(last.from && mine.has(last.from.id)) });
        }
      } catch (e) {
        errors.push((platform === 'ig' ? 'Instagram' : 'Messenger') + ' [inbox v44' + (e.code ? ', code ' + e.code : '') + (e.sub ? '/' + e.sub : '') + ']: ' + (String(e.sub) === '2534084' || /too many conversations/i.test(e.message) ? 'Meta timed out reading this account\'s conversations. While the Meta app is in Development mode it checks every chat against the app\'s role list, and @' + ((pg && pg.ig && pg.ig.username) || 'your account') + ' has too many. Fix: request Advanced Access for instagram_manage_messages in Meta App Review. Until then use the Instagram / Business Suite inbox buttons above.' : /permission|\(#3\)|#10|#200|manage_messages|pages_messaging/i.test(e.message) ? 'no permission to read messages yet. Reconnect Facebook (Accounts) and allow messaging.' : e.message));
      }
    };
    await Promise.all([grab('fb'), pg.ig ? grab('ig') : null]);
    convs.sort((a, b) => new Date(b.at) - new Date(a.at));
    return { convs, errors, ok };
  }
  async function metaPermissions() {
    const m = S.accounts.meta; if (!m || !m.userToken) throw new Error('Connect Facebook first.');
    const r = await graph('/me/permissions', {}, 'GET', m.userToken);
    const pg = page();
    let igLinked = null;
    if (pg) { try { const x = await graph(`/${pg.id}`, { fields: 'instagram_business_account{id,username}' }, 'GET', pg.token); igLinked = x.instagram_business_account ? '@' + (x.instagram_business_account.username || x.instagram_business_account.id) : 'none'; } catch (e) { igLinked = 'error: ' + e.message; } }
    return { perms: r.data || [], igLinked };
  }
  async function inboxThread(conv) {
    const pg = page();
    if (DEMO) return demoThread(conv);
    const r = await graph(`/${conv.id}`, { fields: 'messages.limit(25){id,message,from,created_time,attachments}' });
    const mine = new Set([pg.id, pg.ig && pg.ig.id].filter(Boolean));
    return (((r.messages || {}).data) || []).map((m) => ({ id: m.id, text: m.message || '', at: m.created_time, me: !!(m.from && mine.has(m.from.id)), att: !!(m.attachments && (m.attachments.data || m.attachments).length) })).reverse();
  }
  async function inboxSend(conv, text) {
    const pg = page();
    if (DEMO) { await sleep(300); return { id: 'demo' }; }
    if (!conv.userId) throw new Error('Cannot find who to reply to.');
    return graph(`/${pg.id}/messages`, { recipient: { id: conv.userId }, message: { text }, messaging_type: 'RESPONSE' }, 'POST');
  }
  function demoInbox() {
    const rows = [['ig', 'sara.city', 'Hi! Is the Nimbus Fold 8 in stock at the city store?', 0.4, 2], ['fb', 'Ahmed Khan', 'Can I pay by instalments on the Aurora Boom 5?', 2, 1], ['ig', 'techlover_99', 'Thanks, the delivery was quick 🔥', 5, 0], ['fb', 'Maria G.', 'Do you ship to another city on Fridays?', 26, 0], ['ig', 'aurora.fan', 'Any discount code for the Aurora Clip?', 50, 1]];
    return { errors: [], ok: { fb: { complete: true }, ig: { complete: true } }, convs: rows.map(([platform, name, snippet, h, unread], i) => ({ platform, id: 'dm' + i, userId: 'u' + i, name, handle: platform === 'ig' ? name : '', snippet, at: new Date(Date.now() - h * 3600e3).toISOString(), unread, fromMe: false })) };
  }
  function demoThread(c) {
    const t = Date.parse(c.at);
    const all = [{ id: c.id + 'a', text: 'Hello, is this available?', at: new Date(t - 3e5).toISOString(), me: false }, { id: c.id + 'b', text: 'Yes! Which colour would you like?', at: new Date(t - 2e5).toISOString(), me: true }, { id: c.id + 'c', text: c.snippet, at: c.at, me: false }];
    const gone = (window.__demoGone || []);
    return all.filter((m) => !gone.includes(m.id));
  }

  // ───────────────────────── comments
  const hasComments = (p) => !(typeof p.comments === 'number' && p.comments === 0);
  async function comments() {
    if (DEMO) return demoComments();
    const out = [];
    const tasks = [];
    const errs = [];
    const fails = { ig: [], fb: [] };
    const samples = {};
    const counts = {};
    const pg = page();
    const cache = S.stats;
    if (pg && !(cache.fb && cache.fb.posts && cache.fb.posts.length) && !(cache.ig && cache.ig.posts && cache.ig.posts.length)) errs.push('Facebook/Instagram posts have not loaded, so their comments cannot be read. Reconnect Facebook under Accounts, then refresh the Posts card.');
    if (pg && !pg.ig) errs.push('Instagram: this Facebook Page has no Instagram account linked in the saved login. Reconnect Facebook under Accounts and select your Instagram account.');
    if (pg && pg.ig) tasks.push((async () => {
      const posts = ((cache.ig && cache.ig.posts) || []).slice(0, 50).filter(hasComments);
      await pool(posts, 6, async (p) => { try {
        let r; try { r = await graph(`/${p.id}/comments`, { fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}', limit: 25 }); } catch (e0) { try { r = await graph(`/${p.id}/comments`, { fields: 'id,text,username,timestamp,like_count', limit: 25 }); } catch (e) { fails.ig.push(`${p.type || 'post'} ${p.id}: ${e.message || e}`); return; } }
        if (!(r.data && r.data.length)) {
          samples.ig = samples.ig || JSON.stringify(r).slice(0, 160);
          try { const x = await graph(`/${p.id}`, { fields: 'comments.limit(25){id,text,username,timestamp,like_count,hidden}' }); if (x.comments && x.comments.data && x.comments.data.length) r = x.comments; else samples.ig2 = samples.ig2 || JSON.stringify(x).slice(0, 160); } catch (e2) { samples.ig2 = samples.ig2 || String(e2.message || e2).slice(0, 160); }
        }
        for (const c of r.data || []) out.push({ platform: 'ig', id: c.id, post: p, author: c.username, text: c.text, at: c.timestamp, likes: c.like_count, hidden: c.hidden, replies: ((c.replies && c.replies.data) || []).map((x) => ({ author: x.username, text: x.text, at: x.timestamp })), mine: c.username === pg.ig.username });
        counts.ig = (counts.ig || 0) + ((r.data || []).length);
      } catch (eX) { fails.ig.push('processing: ' + (eX && eX.message || eX)); } });
    })());
    if (pg) tasks.push((async () => {
      const posts = ((cache.fb && cache.fb.posts) || []).slice(0, 50).filter(hasComments);
      await pool(posts, 4, async (p) => {
        let r; try { r = await graph(`/${p.id}/comments`, { fields: 'id,message,from{id,name},created_time,like_count,is_hidden,comments{id,message,from{name},created_time}', filter: 'toplevel', order: 'reverse_chronological', limit: 25 }); } catch (e) { fails.fb.push(`${p.type || 'post'} ${p.id}: ${e.message || e}`); return; }
        for (const c of r.data || []) out.push({ platform: 'fb', id: c.id, post: p, author: (c.from && c.from.name) || 'Facebook user', text: c.message, at: c.created_time, likes: c.like_count, hidden: c.is_hidden, replies: ((c.comments && c.comments.data) || []).map((x) => ({ author: x.from && x.from.name, text: x.message, at: x.created_time })), mine: c.from && c.from.id === pg.id });
      });
    })());
    if (!google.valid() && cache.yt) await google.renew();
    if (!google.valid() && cache.yt && cache.yt.posts && cache.yt.posts.length) errs.push('YouTube: your Google sign-in expired (it lasts about an hour). Click the Google button at the top and reconnect.');
    if (google.valid() && cache.yt) tasks.push((async () => {
      const posts = (cache.yt.posts || []).slice(0, 50).filter(hasComments);
      await pool(posts, 3, async (p) => {
        const r = await google.gfetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${p.id}&maxResults=25&order=time&textFormat=plainText`);
        for (const t of r.items || []) {
          const s = t.snippet.topLevelComment.snippet;
          out.push({ platform: 'yt', id: t.snippet.topLevelComment.id, post: p, author: s.authorDisplayName, text: s.textDisplay, at: s.publishedAt, likes: s.likeCount, replies: ((t.replies && t.replies.comments) || []).map((x) => ({ author: x.snippet.authorDisplayName, text: x.snippet.textDisplay, at: x.snippet.publishedAt })), mine: S.accounts.youtube && s.authorChannelId && s.authorChannelId.value === S.accounts.youtube.id });
        }
      });
    })());
    await Promise.all(tasks.map((t) => t.catch((e) => { errs.push(e && e.message ? e.message : String(e)); return null; })));
    if (!out.length && errs.length) throw new Error('Could not read comments: ' + errs[0]);
    // A few posts can't be read (for example shared Reels); only complain when a whole platform fails.
    for (const [k, name] of [['ig', 'Instagram'], ['fb', 'Facebook']]) {
      const total = (((cache[k] && cache[k].posts) || []).slice(0, 50).filter(hasComments)).length;
      const got = out.filter((c) => c.platform === k).length;
      if (fails[k].length && fails[k].length >= total) errs.push(name + ': ' + fails[k][0]);
      else if (total && !got) errs.push(`${name}: ${total} post(s) report comments but none were returned [v5: API sent ${counts[k] || 0} comments] (${fails[k].length} failed${fails[k].length ? ', e.g. ' + fails[k][0] : ''}).${samples[k] ? ' Instagram replied: ' + samples[k] + (samples[k + '2'] ? ' / ' + samples[k + '2'] : '') : ''}`);
      else if (!total && cache[k] && cache[k].posts) errs.push(`${name}: none of the ${cache[k].posts.length} loaded posts report any comments (newest ${cache[k].posts[0] ? cache[k].posts[0].at : 'n/a'}, oldest ${cache[k].posts.length ? cache[k].posts[cache[k].posts.length - 1].at : 'n/a'}).`);
    }
    // Keep our own comments when someone else has replied under them, so those replies can be answered.
    const me = { fb: ((pg && pg.name) || '').toLowerCase(), ig: ((pg && pg.ig && pg.ig.username) || '').toLowerCase() };
    const othersReplied = (c) => (c.replies || []).some((x) => !x.author || String(x.author).toLowerCase() !== me[c.platform]);
    const list = out.filter((c) => !c.mine || othersReplied(c)).sort((a, b) => new Date(b.at) - new Date(a.at));
    list.errors = errs;
    return list;
  }
  async function reply(c, text) {
    if (DEMO) { await sleep(400); return; }
    if (c.platform === 'ig') return graph(`/${c.id}/replies`, { message: text }, 'POST');
    if (c.platform === 'fb') return graph(`/${c.id}/comments`, { message: text }, 'POST');
    if (c.platform === 'yt') return google.gfetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', body: { snippet: { parentId: c.id, textOriginal: text } } });
  }
  async function hide(c, on = true) {
    if (DEMO) { await sleep(300); return; }
    if (c.platform === 'ig') return graph('/' + c.id, { hide: on }, 'POST');
    if (c.platform === 'fb') return graph('/' + c.id, { is_hidden: on }, 'POST');
    throw new Error('Hiding works for Instagram and Facebook comments.');
  }

  // ───────────────────────── demo data (?demo=1)
  async function demoPublish(p, onStage, onProgress) {
    const steps = { ig: ['Creating post…', 'Instagram is processing…', 'Publishing…'], fb: ['Posting…'], yt: ['Starting upload…', 'Uploading to YouTube…'], tt: ['Sending to TikTok…', 'TikTok is processing…'], li: ['Uploading to LinkedIn…'] }[p];
    for (const s of steps) {
      onStage(s);
      if (s.startsWith('Uploading to YouTube') && onProgress) for (let i = 10; i <= 100; i += 15) { onProgress(i); await sleep(120); }
      await sleep(400 + Math.random() * 500);
    }
    const id = 'demo_' + p + '_' + uid();
    return { id, url: 'https://example.com/' + p + '/' + id, note: p === 'tt' ? 'Posted as private (TikTok audit pending)' : p === 'yt' ? 'Uploaded as private (YouTube audit pending)' : null };
  }
  function demoComments() {
    const names = ['sara.city', 'Ahmed K.', 'techlover_99', 'Fatima Al M.', 'Ravi P.', 'aurora.fan', 'Maria G.'];
    const texts = ['Is this available in the city store store? 😍', 'What\'s the price of the Aurora Flip?', 'Does it come in blue?', 'Ordered mine yesterday, delivery was super fast 🔥', 'Can I pay in installments?', 'Battery life?', 'Great deal!! 👏'];
    const all = Object.values(S.stats).flatMap((x) => (x && x.posts) || []).filter((p) => ['ig', 'fb', 'yt'].includes(p.platform));
    return texts.map((t, i) => { const p = all[i % Math.max(1, all.length)] || { platform: 'ig', text: 'Demo post', id: 'x' }; return { platform: p.platform, id: 'c' + i, post: p, author: names[i], text: t, at: new Date(Date.now() - (i + 1) * 3.7 * 3600e3).toISOString(), likes: (i * 3) % 7, replies: i === 3 ? [{ author: 'acmestudio', text: 'Thank you! Enjoy 🎧', at: new Date().toISOString() }] : [] }; });
  }

  return { publish, firstComment, stats, comments, inboxList, metaPermissions, inboxThread, inboxSend, reply, hide, tiktokCreator, graph, page };
}

// Demo stats for every platform (deterministic, so the screens look the same each time).
export function demoStats(p) {
  let seed = { ig: 3, fb: 7, yt: 11, tt: 13, li: 17 }[p];
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const products = ['Aurora Flip', 'Aurora Boom 5', 'Nimbus Buds Pro', 'Hearth rice cooker', 'Hearth smart scale', 'Aurora Clip', 'Nimbus Phone 26', 'Aurora Tune 770', 'Hearth massager', 'Nimbus Watch'];
  const thumbs = ['#e8609c', '#5b7cfa', '#ff8a4e', '#2ad4d9', '#9d8cf0', '#e0a83a', '#4cc38a', '#38a3e8'];
  const base = { ig: 48200, fb: 126000, yt: 18400, tt: 31900, li: 9200 }[p];
  const posts = Array.from({ length: 10 }, (_, i) => {
    const views = Math.round(base * (0.08 + rnd() * 0.5));
    const likes = Math.round(views * (0.02 + rnd() * 0.06));
    const name = products[(i + seed) % products.length];
    return {
      platform: p, id: `demo-${p}-${i}`, at: new Date(Date.now() - (i * 2.6 + rnd()) * day).toISOString(),
      text: `${name} — ${['now in store', 'weekend offer 🔥', 'unboxing', 'how to set up', 'customer favourite', 'new arrival ✨'][i % 6]} #AcmeStudio`,
      thumb: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${thumbs[(i + seed) % thumbs.length]}"/><circle cx="40" cy="38" r="17" fill="none" stroke="#fff" stroke-width="4" opacity=".85"/><circle cx="40" cy="38" r="6" fill="#fff" opacity=".85"/></svg>`)}`,
      url: 'https://example.com/' + p + '/' + i, type: p === 'yt' ? (i % 3 ? 'Short' : 'Video') : p === 'ig' ? ['Reel', 'Carousel', 'Photo'][i % 3] : p === 'tt' ? 'Video' : 'Post',
      views, reach: Math.round(views * 0.8), likes, comments: Math.round(likes * (0.05 + rnd() * 0.15)), shares: Math.round(likes * rnd() * 0.3), saves: p === 'ig' ? Math.round(likes * rnd() * 0.4) : undefined,
    };
  });
  const recent = posts.filter((x) => Date.now() - new Date(x.at) <= 28 * day);
  const s = (k) => recent.reduce((a, x) => a + (x[k] || 0), 0);
  return {
    account: { platform: p, name: { ig: 'acmestudio', fb: 'Acme Studio', yt: 'Acme Studio Global', tt: 'acmestudio', li: 'Acme Studio' }[p], handle: { ig: '@acmestudio', fb: '@acmestudio', yt: '@acmestudio_global', tt: '@acmestudio', li: 'Company page' }[p], followers: { ig: 41850, fb: 96400, yt: 12760, tt: 22310, li: 8740 }[p], views28: s('views'), eng28: s('likes') + s('comments') + s('shares') + s('saves') },
    posts,
  };
}
export const PLATFORM_NAMES = P;
