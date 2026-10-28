// Shared helpers for the /api routes (works on Vercel and in the local server.js).
'use strict';

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function html(res, status, markup) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(markup);
}

function query(req) {
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; } }
    return req.body;
  }
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

// Optional passcode so strangers who find the URL can't use your server routes.
function authorized(req, res) {
  const key = process.env.APP_PASSCODE;
  if (!key) return true;
  if (req.headers['x-app-key'] === key) return true;
  send(res, 401, { error: 'Passcode required — open Settings (gear icon) and enter the app passcode.' });
  return false;
}

function isDemo(req) {
  return process.env.DEMO === '1' || query(req).demo === '1';
}

async function fetchT(url, opts = {}, ms = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

// The public address of this deployment, for OAuth redirect URIs.
function origin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v23.0');

// LinkedIn wants a dated API version (YYYYMM) that is still supported; three months back is always live.
function linkedinVersion() {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Page that hands an OAuth result back to the app (works in a pop-up and in a phone's single tab).
function oauthReturnPage(provider, payload) {
  const data = JSON.stringify({ provider, ...payload, at: Date.now() }).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connecting…</title><body style="background:#161316;color:#ece6ea;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p id="m">Finishing connection…</p>
<script>
var d=${data};
try{localStorage.setItem('sr:oauth-result',JSON.stringify(d));}catch(e){}
try{new BroadcastChannel('social-radar-oauth').postMessage(d);}catch(e){}
try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:'sr-oauth',data:d},location.origin);}}catch(e){}
document.getElementById('m').textContent=d.error?('Could not connect: '+d.error):'Connected — you can close this window.';
setTimeout(function(){ if(window.opener&&!window.opener.closed){window.close();} else {location.replace('/?connected='+encodeURIComponent(d.provider));} }, d.error?2500:600);
</script></body>`;
}

module.exports = { send, html, query, readBody, authorized, isDemo, fetchT, origin, GRAPH, linkedinVersion, oauthReturnPage };
