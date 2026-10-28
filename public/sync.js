// Cross-device sync: connected accounts, settings, the post log and the phone story queue are kept in one
// small JSON file in your Google Drive "app data" folder — private to this app, hidden from your normal Drive,
// and the same on your computer and phone. Nothing goes through this site's server.

const FILE = 'social-radar-sync.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export function createSync({ getToken, collect, apply, onStatus }) {
  let fileId = null, timer = null, busy = false, again = false;

  async function call(url, opts = {}) {
    const token = getToken();
    if (!token) throw Object.assign(new Error('not signed in'), { quiet: true });
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (r.status === 401) throw Object.assign(new Error('Google sign-in expired — reconnect to keep syncing.'), { quiet: true });
    if (r.status === 403) {
      const j = await r.json().catch(() => ({}));
      const m = (j.error && j.error.message) || '';
      throw new Error(/not been used|disabled/i.test(m) ? 'Turn on the Google Drive API in your Google Cloud project to sync across devices.' : 'Sync needs the Drive permission — sign in to Google again and tick every box.');
    }
    if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
    return r.status === 204 ? null : r.json();
  }
  async function findFile() {
    if (fileId) return fileId;
    const j = await call(`${DRIVE}/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE}'`)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
    return (fileId = (j.files && j.files[0] && j.files[0].id) || null);
  }
  async function read() {
    const id = await findFile();
    if (!id) return null;
    const r = await fetch(`${DRIVE}/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (r.status === 404) { fileId = null; return null; }
    if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
    return r.json().catch(() => null);
  }
  async function write(data) {
    const body = JSON.stringify(data);
    const id = await findFile();
    if (id) return call(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    const b = 'sr' + Date.now();
    const mp = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const j = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: mp });
    fileId = j.id;
  }
  async function run() {
    if (busy) { again = true; return; }
    if (!getToken()) return onStatus({ state: 'off' });
    busy = true; onStatus({ state: 'syncing' });
    try {
      const remote = await read();
      const local = collect();
      const merged = merge(local, remote);
      apply(merged);
      if (!remote || JSON.stringify(strip(remote)) !== JSON.stringify(strip(merged))) await write({ ...merged, savedAt: new Date().toISOString() });
      onStatus({ state: 'ok', at: Date.now() });
    } catch (e) { onStatus({ state: 'error', message: e.message, quiet: e.quiet }); }
    busy = false;
    if (again) { again = false; run(); }
  }
  return { now: run, schedule(ms = 2500) { clearTimeout(timer); timer = setTimeout(run, ms); }, reset() { fileId = null; clearTimeout(timer); } };
}

const strip = (d) => { const { savedAt, ...rest } = d || {}; return rest; };
const t = (s) => Date.parse(s || 0) || 0;

// Newest wins per group (accounts, settings); posts and story-queue items merge one by one, deletions kept as tombstones.
export function merge(local, remote) {
  if (!remote) return local;
  const out = { v: 1 };
  for (const [key, at] of [['accounts', 'accountsAt'], ['settings', 'settingsAt']]) {
    const src = t(remote[at]) > t(local[at]) ? remote : local;
    out[key] = src[key] || {}; out[at] = src[at] || null;
  }
  const deleted = {};
  for (const src of [local, remote]) for (const [id, at] of Object.entries(src.deleted || {})) if (!deleted[id] || t(at) > t(deleted[id])) deleted[id] = at;
  for (const key of ['posts', 'stories']) {
    const byId = new Map();
    for (const src of [remote, local]) for (const x of src[key] || []) {
      const prev = byId.get(x.id);
      if (!prev || t(x.updatedAt || x.at) >= t(prev.updatedAt || prev.at)) byId.set(x.id, x);
    }
    out[key] = [...byId.values()].filter((x) => !deleted[x.id] || t(deleted[x.id]) < t(x.updatedAt || x.at)).sort((a, b) => t(b.at) - t(a.at)).slice(0, 500);
  }
  out.ttSeen = {};
  for (const src of [remote, local]) for (const [id, v] of Object.entries(src.ttSeen || {})) if (!out.ttSeen[id] || t(v.at) >= t(out.ttSeen[id].at)) out.ttSeen[id] = v;
  out.linktree = (t((remote.linktree || {}).at) > t((local.linktree || {}).at) ? remote.linktree : local.linktree) || null;
  for (const [id, at] of Object.entries(deleted)) if (Date.now() - t(at) > 60 * 86400e3) delete deleted[id];
  out.deleted = deleted;
  return out;
}
