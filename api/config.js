// Tells the page what the server has configured (never returns secret values).
'use strict';
const U = require('../lib/util');

module.exports = async (req, res) => {
  U.send(res, 200, {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleServerFlow: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    metaAppId: process.env.META_APP_ID || '',
    metaConfigId: process.env.META_CONFIG_ID || '',
    metaReady: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    graphVersion: process.env.META_GRAPH_VERSION || 'v23.0',
    tiktokReady: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
    linkedinReady: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_ORG !== 'only'),
    linkedinPagesReady: !!((process.env.LINKEDIN_PAGES_CLIENT_ID && process.env.LINKEDIN_PAGES_CLIENT_SECRET) || (process.env.LINKEDIN_ORG === 'only' && process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)),
    linkedinOrg: process.env.LINKEDIN_ORG === '1',
    blobReady: !!process.env.BLOB_READ_WRITE_TOKEN,
    passcodeRequired: !!process.env.APP_PASSCODE,
    passcodeOk: !process.env.APP_PASSCODE || req.headers['x-app-key'] === process.env.APP_PASSCODE,
    demo: U.isDemo(req),
  });
};
