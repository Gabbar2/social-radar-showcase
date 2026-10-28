// LinkedIn: sign-in, posting (text, link, images, video) as you or as a company Page, comments and stats.
// LinkedIn's API doesn't accept browser calls and needs the app secret, so it goes through here.
'use strict';
const U = require('../lib/util');
const LI = 'https://api.linkedin.com';

// Two LinkedIn apps can run side by side (LinkedIn won't let one app hold the Community Management API plus other products):
//   personal app  → LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET            (sign in + post as you)
//   Pages app     → LINKEDIN_PAGES_CLIENT_ID / LINKEDIN_PAGES_CLIENT_SECRET (post as the company Page)
// Legacy: LINKEDIN_ORG=only makes the main pair act as the Pages app; LINKEDIN_ORG=1 asks the main app for Page scopes too.
const ORG_SCOPES = ['w_organization_social', 'r_organization_social', 'rw_organization_admin'];
const legacyPages = () => process.env.LINKEDIN_ORG === 'only';
function creds(kind) {
  if (kind === 'pages') {
    if (process.env.LINKEDIN_PAGES_CLIENT_ID) return { id: process.env.LINKEDIN_PAGES_CLIENT_ID, secret: process.env.LINKEDIN_PAGES_CLIENT_SECRET };
    if (legacyPages()) return { id: process.env.LINKEDIN_CLIENT_ID, secret: process.env.LINKEDIN_CLIENT_SECRET };
    return { id: '', secret: '' };
  }
  return legacyPages() ? { id: '', secret: '' } : { id: process.env.LINKEDIN_CLIENT_ID, secret: process.env.LINKEDIN_CLIENT_SECRET };
}
function scopes(kind) {
  if (kind === 'pages') return ORG_SCOPES.join(' ');
  const s = ['openid', 'profile', 'email', 'w_member_social'];
  if (process.env.LINKEDIN_ORG === '1') s.push(...ORG_SCOPES);
  return s.join(' ');
}

async function li(path, token, { method = 'GET', body, raw } = {}) {
  const r = await U.fetchT(LI + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'LinkedIn-Version': U.linkedinVersion(),
      'X-Restli-Protocol-Version': '2.0.0',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return r;
  const text = await r.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!r.ok) {
    const msg = j.message || j.error_description || ('LinkedIn HTTP ' + r.status);
    if (r.status === 401) throw new Error('LinkedIn sign-in expired — reconnect LinkedIn under Accounts.');
    if (r.status === 403) throw new Error(msg + ' (your LinkedIn app may not have this permission yet)');
    throw new Error(msg);
  }
  return { json: j, headers: r.headers };
}

async function tokenRequest(params, kind) {
  const c = creds(kind);
  const r = await U.fetchT('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(j.error_description || j.error || 'LinkedIn sign-in failed');
  return { token: j.access_token, exp: Date.now() + (j.expires_in - 300) * 1000, refresh: j.refresh_token || null, scope: j.scope };
}

async function profile(token, kind) {
  const out = { person: { urn: null, name: 'LinkedIn', picture: null, email: null }, orgs: [] };
  if (kind !== 'pages') { const me = (await li('/v2/userinfo', token)).json; out.person = { urn: 'urn:li:person:' + me.sub, name: me.name, picture: me.picture, email: me.email }; }
  try {
    const acl = (await li('/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50', token)).json;
    const ids = (acl.elements || []).map((e) => e.organization).filter(Boolean);
    for (const urn of ids.slice(0, 20)) {
      const id = urn.split(':').pop();
      try {
        const o = (await li('/rest/organizations/' + id, token)).json;
        out.orgs.push({ urn, name: (o.localizedName || (o.name && Object.values(o.name.localized || {})[0])) || 'Company page ' + id, vanity: o.vanityName });
      } catch { out.orgs.push({ urn, name: 'Company page ' + id }); }
    }
  } catch (e) { out.orgNote = e.message; }
  return out;
}

async function uploadImage(token, owner, url) {
  const init = (await li('/rest/images?action=initializeUpload', token, { method: 'POST', body: { initializeUploadRequest: { owner } } })).json.value;
  const file = await U.fetchT(url, {}, 60000);
  const buf = Buffer.from(await file.arrayBuffer());
  const put = await U.fetchT(init.uploadUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + token }, body: buf }, 120000);
  if (!put.ok) throw new Error('LinkedIn image upload failed (HTTP ' + put.status + ')');
  return init.image;
}

async function uploadVideo(token, owner, url) {
  const file = await U.fetchT(url, {}, 120000);
  const buf = Buffer.from(await file.arrayBuffer());
  const init = (await li('/rest/videos?action=initializeUpload', token, { method: 'POST', body: { initializeUploadRequest: { owner, fileSizeBytes: buf.length, uploadCaptions: false, uploadThumbnail: false } } })).json.value;
  const etags = [];
  for (const part of init.uploadInstructions) {
    const put = await U.fetchT(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: buf.subarray(part.firstByte, part.lastByte + 1) }, 120000);
    if (!put.ok) throw new Error('LinkedIn video upload failed (HTTP ' + put.status + ')');
    etags.push(put.headers.get('etag'));
  }
  await li('/rest/videos?action=finalizeUpload', token, { method: 'POST', body: { finalizeUploadRequest: { video: init.video, uploadToken: init.uploadToken || '', uploadedPartIds: etags } } });
  return init.video;
}

module.exports = async (req, res) => {
  const q = U.query(req);
  const redirect = U.origin(req) + '/api/linkedin-callback';
  if (q.action === 'auth-url') {
    const kind = q.kind === 'pages' ? 'pages' : 'me';
    const c = creds(kind);
    if (!c.id) return U.send(res, 400, { error: kind === 'pages' ? 'LINKEDIN_PAGES_CLIENT_ID is not set on the server.' : 'LINKEDIN_CLIENT_ID is not set on the server.' });
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', c.id);
    u.searchParams.set('redirect_uri', redirect);
    u.searchParams.set('state', (q.state || '') + '.' + kind);
    u.searchParams.set('scope', scopes(kind));
    return U.send(res, 200, { url: u.toString(), redirect });
  }
  if (!U.authorized(req, res)) return;
  const body = req.method === 'POST' ? await U.readBody(req) : {};
  const token = body.token;
  try {
    switch (q.action) {
      case 'profile':
        return U.send(res, 200, await profile(token));
      case 'refresh':
        return U.send(res, 200, await tokenRequest({ grant_type: 'refresh_token', refresh_token: body.refresh }));
      case 'post': {
        const { author, text, link, linkTitle, media = [] } = body;
        const post = {
          author, commentary: text || '', visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
        };
        const video = media.find((m) => m.type === 'video');
        if (video) {
          post.content = { media: { id: await uploadVideo(token, author, video.url), title: (linkTitle || text || '').slice(0, 200) } };
        } else if (media.length === 1) {
          post.content = { media: { id: await uploadImage(token, author, media[0].url), altText: (media[0].alt || '').slice(0, 4086) } };
        } else if (media.length > 1) {
          const images = [];
          for (const m of media.slice(0, 20)) images.push({ id: await uploadImage(token, author, m.url), altText: (m.alt || '').slice(0, 4086) });
          post.content = { multiImage: { images } };
        } else if (link) {
          post.content = { article: { source: link, title: linkTitle || link } };
        }
        const r = await li('/rest/posts', token, { method: 'POST', body: post });
        const urn = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id');
        return U.send(res, 200, { urn, url: urn ? 'https://www.linkedin.com/feed/update/' + urn : null });
      }
      case 'comment': {
        const { actor, urn, text, parent } = body;
        const r = await li('/rest/socialActions/' + encodeURIComponent(urn) + '/comments', token, { method: 'POST', body: { actor, object: urn, message: { text }, ...(parent ? { parentComment: parent } : {}) } });
        return U.send(res, 200, { ok: true, id: r.headers.get('x-restli-id') });
      }
      case 'stats': {
        // Works for company Pages (needs the Community Management API). Personal profiles get post counts only.
        const { author } = body;
        const out = { followers: null, posts: [] };
        if (String(author).includes('organization')) {
          try { out.followers = (await li('/rest/networkSizes/' + encodeURIComponent(author) + '?edgeType=COMPANY_FOLLOWED_BY_MEMBER', token)).json.firstDegreeSize; } catch (e) { out.note = e.message; }
          try {
            const st = (await li('/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=' + encodeURIComponent(author), token)).json;
            out.totals = (st.elements && st.elements[0] && st.elements[0].totalShareStatistics) || null;
          } catch (e) { out.note = out.note || e.message; }
        }
        try {
          const p = (await li('/rest/posts?q=author&author=' + encodeURIComponent(author) + '&count=20&sortBy=LAST_MODIFIED', token)).json;
          out.posts = (p.elements || []).map((e) => ({ urn: e.id, text: e.commentary, at: e.publishedAt || e.createdAt }));
          if (out.posts.length) {
            const ids = out.posts.map((x) => encodeURIComponent(x.urn)).join(',');
            try {
              const sm = (await li('/rest/socialMetadata?ids=List(' + ids + ')', token)).json.results || {};
              for (const x of out.posts) {
                const m = sm[x.urn];
                if (!m) continue;
                x.likes = Object.values(m.reactionSummaries || {}).reduce((s, r) => s + (r.count || 0), 0);
                x.comments = (m.commentSummary && m.commentSummary.count) || 0;
              }
            } catch { /* optional */ }
          }
        } catch (e) { out.note = out.note || e.message; }
        return U.send(res, 200, out);
      }
      default:
        return U.send(res, 400, { error: 'Unknown action' });
    }
  } catch (e) {
    return U.send(res, 502, { error: e.message });
  }
};
module.exports.tokenRequest = tokenRequest;
module.exports.profile = profile;
module.exports.creds = creds;
