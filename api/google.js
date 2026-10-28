// Google sign-in that stays signed in. The browser-only sign-in gives a token that dies after an hour; this
// route runs the server-side flow instead (needs GOOGLE_CLIENT_SECRET), which hands back a long-lived refresh
// token. The app keeps that token and quietly trades it for a fresh hour-long token whenever it needs one.
'use strict';
const U = require('../lib/util');

const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

async function tokenRequest(params) {
  const r = await U.fetchT('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'invalid_grant' : (j.error_description || j.error || 'Google HTTP ' + r.status));
  return { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) - 90) * 1000, refresh: j.refresh_token || null, scopes: String(j.scope || '') };
}

module.exports = async (req, res) => {
  const q = U.query(req);
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return U.send(res, 400, { error: 'GOOGLE_CLIENT_SECRET is not set on the server.' });
  if (q.action === 'auth-url') {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', id);
    u.searchParams.set('redirect_uri', U.origin(req) + '/api/google-callback');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES);
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('prompt', q.switch ? 'consent select_account' : 'consent');
    if (q.hint && !q.switch) u.searchParams.set('login_hint', q.hint);
    u.searchParams.set('state', q.state || '');
    return U.send(res, 200, { url: u.toString() });
  }
  if (!U.authorized(req, res)) return;
  const body = req.method === 'POST' ? await U.readBody(req) : {};
  try {
    if (q.action === 'refresh') {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: body.refresh });
      return U.send(res, 200, { token: t.token, exp: t.exp, scopes: t.scopes });
    }
    return U.send(res, 400, { error: 'Unknown action' });
  } catch (e) {
    return U.send(res, e.message === 'invalid_grant' ? 401 : 502, { error: e.message });
  }
};
module.exports.tokenRequest = tokenRequest;
