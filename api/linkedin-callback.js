// LinkedIn sends you back here after you allow access. Swap the code for a token and hand it to the app.
'use strict';
const U = require('../lib/util');
const { tokenRequest, profile } = require('./linkedin');

module.exports = async (req, res) => {
  const q = U.query(req);
  const m = String(q.state || '').match(/^(.*)\.(pages|me)$/);
  const state = m ? m[1] : q.state, kind = m ? m[2] : 'me';
  if (q.error) return U.html(res, 200, U.oauthReturnPage('linkedin', { error: q.error_description || q.error, state, kind }));
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: q.code, redirect_uri: U.origin(req) + '/api/linkedin-callback' }, kind);
    const p = await profile(t.token, kind);
    return U.html(res, 200, U.oauthReturnPage('linkedin', { state, kind, account: { ...t, ...p } }));
  } catch (e) {
    return U.html(res, 200, U.oauthReturnPage('linkedin', { error: e.message, state, kind }));
  }
};
