// TikTok: sign-in (Login Kit), Content Posting API and account/video stats.
// TikTok's API doesn't accept calls straight from a browser and needs the app secret, so this route sits in between.
'use strict';
const U = require('../lib/util');
const TT = 'https://open.tiktokapis.com';

async function tt(path, token, body, method = 'POST') {
  const r = await U.fetchT(TT + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error && j.error.code && j.error.code !== 'ok') {
    const hint = {
      unaudited_client_can_only_post_to_private_accounts: 'TikTok only lets apps that haven\'t passed its audit post to a PRIVATE account. Set the TikTok account to private, or use "Send to TikTok drafts" instead.',
      spam_risk_too_many_posts: 'TikTok\'s daily limit for posts from apps has been reached for this account. Try again tomorrow.',
      access_token_invalid: 'TikTok sign-in expired — reconnect TikTok under Accounts.',
      scope_not_authorized: 'TikTok permission missing — reconnect TikTok and allow every permission.',
    }[j.error.code];
    throw new Error(hint || j.error.message || j.error.code);
  }
  if (!r.ok) throw new Error('TikTok HTTP ' + r.status);
  return j.data || {};
}

async function tokenRequest(params) {
  const r = await U.fetchT(TT + '/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(j.error_description || j.error || 'TikTok sign-in failed');
  return { token: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000, refreshExp: Date.now() + (j.refresh_expires_in || 0) * 1000, openId: j.open_id, scope: j.scope };
}

// Upload the file from its public media link to TikTok in the chunk sizes TikTok asks for.
function chunkPlan(size) {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunk_size: size, total_chunk_count: 1 };
  const chunk = 10 * MB;
  return { chunk_size: chunk, total_chunk_count: Math.floor(size / chunk) };
}

module.exports = async (req, res) => {
  const q = U.query(req);
  const redirect = U.origin(req) + '/api/tiktok-callback';
  if (q.action === 'auth-url') {
    if (!process.env.TIKTOK_CLIENT_KEY) return U.send(res, 400, { error: 'TIKTOK_CLIENT_KEY is not set on the server.' });
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
    u.searchParams.set('scope', 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', redirect);
    u.searchParams.set('state', q.state || '');
    return U.send(res, 200, { url: u.toString(), redirect });
  }
  if (!U.authorized(req, res)) return;
  const body = req.method === 'POST' ? await U.readBody(req) : {};
  try {
    switch (q.action) {
      case 'refresh':
        return U.send(res, 200, await tokenRequest({ grant_type: 'refresh_token', refresh_token: body.refresh }));
      case 'creator': {
        const d = await tt('/v2/post/publish/creator_info/query/', body.token, {});
        return U.send(res, 200, d);
      }
      case 'publish': {
        // mode "direct" posts straight to the profile; "inbox" sends it to the TikTok app's drafts/inbox,
        // where you add sounds, stickers and text and post it publicly yourself.
        const { token, mediaUrl, size, mode, post } = body;
        const plan = chunkPlan(Number(size));
        const source_info = { source: 'FILE_UPLOAD', video_size: Number(size), ...plan };
        const init = mode === 'inbox'
          ? await tt('/v2/post/publish/inbox/video/init/', token, { source_info })
          : await tt('/v2/post/publish/video/init/', token, { post_info: post, source_info });
        const file = await U.fetchT(mediaUrl, {}, 120000);
        if (!file.ok) throw new Error('Could not read the uploaded video (HTTP ' + file.status + ')');
        const buf = Buffer.from(await file.arrayBuffer());
        for (let i = 0; i < plan.total_chunk_count; i++) {
          const start = i * plan.chunk_size;
          const end = i === plan.total_chunk_count - 1 ? buf.length - 1 : start + plan.chunk_size - 1;
          const put = await U.fetchT(init.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${buf.length}` },
            body: buf.subarray(start, end + 1),
          }, 120000);
          if (!put.ok && put.status !== 206 && put.status !== 201) throw new Error('TikTok upload failed at part ' + (i + 1) + ' (HTTP ' + put.status + ')');
        }
        return U.send(res, 200, { publishId: init.publish_id });
      }
      case 'status': {
        const d = await tt('/v2/post/publish/status/fetch/', body.token, { publish_id: body.publishId });
        return U.send(res, 200, d);
      }
      case 'stats': {
        const fields = 'open_id,display_name,avatar_url,username,follower_count,following_count,likes_count,video_count';
        const user = await tt('/v2/user/info/?fields=' + fields, body.token, null, 'GET');
        let videos = [];
        try {
          const v = await tt('/v2/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,duration,view_count,like_count,comment_count,share_count', body.token, { max_count: 20 });
          videos = v.videos || [];
        } catch (e) { /* video.list may not be approved yet */ }
        return U.send(res, 200, { user: user.user || user, videos });
      }
      default:
        return U.send(res, 400, { error: 'Unknown action' });
    }
  } catch (e) {
    return U.send(res, 502, { error: e.message });
  }
};
module.exports.tokenRequest = tokenRequest;
