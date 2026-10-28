// Media hosting for publishing. Instagram, Facebook, TikTok and LinkedIn fetch your photo or video from a
// public link, so each file goes from the browser straight into Vercel Blob (no size limit from this
// server), and is deleted again once every platform has it.
'use strict';
const U = require('../lib/util');

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

module.exports = async (req, res) => {
  const q = U.query(req);
  if (q.action === 'delete') {
    if (!U.authorized(req, res)) return;
    const body = await U.readBody(req);
    const urls = (body.urls || []).filter((u) => /\.blob\.vercel-storage\.com\//.test(u));
    if (!urls.length) return U.send(res, 200, { ok: true, deleted: 0 });
    try {
      const { del } = require('@vercel/blob');
      await del(urls);
      return U.send(res, 200, { ok: true, deleted: urls.length });
    } catch (e) { return U.send(res, 500, { error: e.message }); }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) return U.send(res, 400, { error: 'Media storage is not set up. In Vercel, open Storage → Create → Blob and connect it to this project, then redeploy.' });
  const body = await U.readBody(req);
  // The token request comes from your browser and carries the passcode in clientPayload;
  // Vercel's own "upload completed" callback has no passcode and doesn't need one.
  try {
    const { handleUpload } = require('@vercel/blob/client');
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const key = process.env.APP_PASSCODE;
        let p = {};
        try { p = JSON.parse(clientPayload || '{}'); } catch { /* ignore */ }
        if (key && p.passcode !== key) throw new Error('Passcode required — open Settings and enter the app passcode.');
        return { allowedContentTypes: TYPES, maximumSizeInBytes: 1024 * 1024 * 1024, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {},
    });
    return U.send(res, 200, out);
  } catch (e) {
    return U.send(res, 400, { error: e.message });
  }
};
