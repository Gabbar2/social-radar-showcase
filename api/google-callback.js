// Google sends you back here after you allow access. Swap the code for tokens and hand them to the app.
'use strict';
const U = require('../lib/util');
const { tokenRequest } = require('./google');

module.exports = async (req, res) => {
  const q = U.query(req);
  if (q.error) return U.html(res, 200, U.oauthReturnPage('google', { error: q.error_description || q.error, state: q.state }));
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: q.code, redirect_uri: U.origin(req) + '/api/google-callback' });
    const u = await (await U.fetchT('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + t.token } })).json().catch(() => ({}));
    if (!t.refresh) throw new Error('Google did not return a long-lived sign-in. Remove "Social Radar" at myaccount.google.com/permissions and try again.');
    return U.html(res, 200, U.oauthReturnPage('google', { state: q.state, account: { ...t, email: u.email || null, name: u.name || u.email || null, picture: u.picture || null } }));
  } catch (e) {
    return U.html(res, 200, U.oauthReturnPage('google', { error: e.message, state: q.state }));
  }
};
