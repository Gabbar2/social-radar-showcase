// Facebook Pages + Instagram (professional accounts linked to those Pages).
// The browser signs in with Facebook and gets a short-lived token; this route swaps it for a long-lived one
// (needs the app secret) and returns each Page with its never-expiring Page token and linked Instagram account.
// Everything else (posting, insights, comments) the browser does directly against graph.facebook.com.
'use strict';
const U = require('../lib/util');

async function g(path, params = {}, method = 'GET') {
  const u = new URL(U.GRAPH + path);
  let body;
  if (method === 'GET') for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  else body = new URLSearchParams(params);
  const r = await U.fetchT(u, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && (j.error.error_user_msg || j.error.message)) || 'Facebook HTTP ' + r.status);
  return j;
}

async function pages(userToken) {
  const j = await g('/me/accounts', {
    access_token: userToken, limit: '50',
    fields: 'id,name,access_token,tasks,picture.type(large){url},instagram_business_account{id,username,name,profile_picture_url}',
  });
  return (j.data || []).map((p) => ({
    id: p.id, name: p.name, token: p.access_token, tasks: p.tasks || [],
    picture: p.picture && p.picture.data && p.picture.data.url,
    ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username, name: p.instagram_business_account.name, picture: p.instagram_business_account.profile_picture_url } : null,
  }));
}

module.exports = async (req, res) => {
  if (!U.authorized(req, res)) return;
  const q = U.query(req);
  const body = req.method === 'POST' ? await U.readBody(req) : {};
  const { META_APP_ID: id, META_APP_SECRET: secret } = process.env;
  try {
    if (q.action === 'exchange') {
      if (!id || !secret) return U.send(res, 400, { error: 'META_APP_ID and META_APP_SECRET are not set on the server.' });
      const ll = await g('/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: body.token });
      const me = await g('/me', { access_token: ll.access_token, fields: 'id,name' });
      const list = await pages(ll.access_token);
      return U.send(res, 200, { user: me, userToken: ll.access_token, expiresIn: ll.expires_in || null, pages: list });
    }
    if (q.action === 'check') {
      // Is the saved login still good, and when does it run out? (Meta's own token inspector.)
      if (!id || !secret) return U.send(res, 400, { error: 'META_APP_ID and META_APP_SECRET are not set on the server.' });
      const one = async (t) => {
        if (!t) return null;
        const j = await g('/debug_token', { input_token: t, access_token: id + '|' + secret });
        const d = j.data || {};
        return { valid: !!d.is_valid, expiresAt: d.expires_at || 0, dataAccessExpiresAt: d.data_access_expires_at || 0, type: d.type || null, reason: d.error ? d.error.message : null };
      };
      return U.send(res, 200, { user: await one(body.userToken), page: await one(body.pageToken) });
    }
    if (q.action === 'pages') {
      return U.send(res, 200, { pages: await pages(body.userToken) });
    }
    if (q.action === 'reel') {
      // Facebook Reels upload: start → hand Facebook the public video link → finish (publishes with the description).
      const { pageId, pageToken, videoUrl, description } = body;
      const start = await g(`/${pageId}/video_reels`, { upload_phase: 'start', access_token: pageToken }, 'POST');
      const up = await U.fetchT(`https://rupload.facebook.com/video-upload/${(process.env.META_GRAPH_VERSION || 'v23.0')}/${start.video_id}`, {
        method: 'POST', headers: { Authorization: 'OAuth ' + pageToken, file_url: videoUrl },
      }, 120000);
      const uj = await up.json().catch(() => ({}));
      if (!up.ok || uj.success === false) throw new Error((uj.debug_info && uj.debug_info.message) || 'Facebook Reel upload failed (HTTP ' + up.status + ')');
      const fin = await g(`/${pageId}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: description || '', access_token: pageToken }, 'POST');
      return U.send(res, 200, { id: start.video_id, ok: !!fin.success });
    }
    if (q.action === 'video-story') {
      const { pageId, pageToken, videoUrl } = body;
      const start = await g(`/${pageId}/video_stories`, { upload_phase: 'start', access_token: pageToken }, 'POST');
      const up = await U.fetchT(start.upload_url, { method: 'POST', headers: { Authorization: 'OAuth ' + pageToken, file_url: videoUrl } }, 120000);
      if (!up.ok) throw new Error('Facebook story upload failed (HTTP ' + up.status + ')');
      const fin = await g(`/${pageId}/video_stories`, { upload_phase: 'finish', video_id: start.video_id, access_token: pageToken }, 'POST');
      return U.send(res, 200, { id: fin.post_id || start.video_id });
    }
    return U.send(res, 400, { error: 'Unknown action' });
  } catch (e) {
    return U.send(res, 502, { error: e.message });
  }
};
