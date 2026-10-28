// Local runner: `node server.js` serves the page and the same /api routes Vercel uses.
// Reads a .env file in this folder if present. Open http://localhost:3000 (add ?demo=1 for sample data).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  try {
    // your public links page: same dynamic loading as the other /api routes (a literal require here would make Vercel bundle the server differently)
    if (pathname === '/links' || pathname === '/l') { req.url = '/api/links?view=1'; return await require(path.join(__dirname, 'api', 'links.js'))(req, res); }
    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const file = path.join(__dirname, 'api', name + '.js');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"not found"}'); }
      return await require(file)(req, res);
    }
    let file = path.join(PUB, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUB, 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(process.env.PORT || 3000, () => console.log('Social Radar on http://localhost:' + (process.env.PORT || 3000)));
