// TikTok sends you back here after you allow access. Swap the code for tokens and hand them to the app.
'use strict';
const U = require('../lib/util');
const { tokenRequest } = require('./tiktok');

module.exports = async (req, res) => {
  const q = U.query(req);
  if (q.error) return U.html(res, 200, U.oauthReturnPage('tiktok', { error: q.error_description || q.error, state: q.state }));
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: q.code, redirect_uri: U.origin(req) + '/api/tiktok-callback' });
    return U.html(res, 200, U.oauthReturnPage('tiktok', { state: q.state, account: t }));
  } catch (e) {
    return U.html(res, 200, U.oauthReturnPage('tiktok', { error: e.message, state: q.state }));
  }
};
