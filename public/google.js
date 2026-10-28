// Google sign-in: one consent gives YouTube (upload, comments, analytics) and a private Drive app folder that
// keeps your accounts, post log and story queue in sync between your computer and phone.
import { bus, store, DEMO, api } from './core.js';

export const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

let gisPromise;
function loadGis() {
  return (gisPromise ||= new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in. An ad-blocker or privacy extension may be blocking accounts.google.com.')); };
    document.head.append(s);
  }));
}

export function createGoogle({ clientId, onChange, toast, serverFlow = () => false, serverSignIn }) {
  const st = { token: null, exp: 0, email: null, scopes: '', name: null, picture: null };
  const KEY = (DEMO ? 'sr:demo:' : 'sr:') + 'gtoken';
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && saved.exp > Date.now()) Object.assign(st, saved);
  } catch { /* ignore */ }
  // Remember who signed in last on this device, even after the hour-long token expires.
  const last = store.get('lastGoogle', null);
  if (!st.email && last) Object.assign(st, { email: last.email, name: last.name, picture: last.picture });

  // Long-lived sign-in: a refresh token kept on this device that quietly buys a new hour-long token when needed.
  let refresh = store.get('grefresh', null), timer = null, refreshing = null;
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } };
  const valid = () => !!st.token && st.exp > Date.now();
  const has = (s) => valid() && st.scopes.includes(s);

  bus.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'g-token' && m.st && m.st.exp > st.exp) { Object.assign(st, m.st); save(); onChange('token'); }
    else if (m.type === 'g-token-request' && valid()) bus.postMessage({ type: 'g-token', st });
    else if (m.type === 'g-signout') { Object.assign(st, { token: null, exp: 0, email: null, name: null, picture: null }); save(); onChange('signout'); }
  });
  if (!valid()) bus.postMessage({ type: 'g-token-request' });

  function schedule() {
    clearTimeout(timer);
    if (!refresh || !st.exp) return;
    timer = setTimeout(() => { renew(); }, Math.max(20e3, st.exp - Date.now() - 60e3));
  }
  function renew() {
    if (!refresh || DEMO) return Promise.resolve(false);
    if (refreshing) return refreshing;
    const was = valid();
    refreshing = (async () => {
      try {
        const r = await api('/api/google?action=refresh', { body: { refresh } });
        Object.assign(st, { token: r.token, exp: r.exp, scopes: r.scopes || st.scopes });
        save(); bus.postMessage({ type: 'g-token', st }); schedule();
        onChange(was ? 'renewed' : 'token');
        return true;
      } catch (e) {
        if (/invalid_grant/.test(e.message)) { refresh = null; try { store.del('grefresh'); } catch { /* ignore */ } onChange('expired'); }
        return false;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  function adopt(a) {
    Object.assign(st, { token: a.token, exp: a.exp, scopes: a.scopes || '', email: a.email || st.email, name: a.name || st.name, picture: a.picture || null });
    if (a.refresh) { refresh = a.refresh; store.set('grefresh', refresh); }
    save(); store.set('lastGoogle', { email: st.email, name: st.name, picture: st.picture });
    bus.postMessage({ type: 'g-token', st }); schedule(); onChange('signin');
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !valid() && refresh) renew(); });
  if (!valid() && refresh) renew(); else schedule();

  async function signIn(opts = {}) {
    if (!DEMO && serverFlow() && serverSignIn) return serverSignIn({ switch: !!opts.switch, hint: st.email || '' });
    if (DEMO) {
      Object.assign(st, { token: 'demo', exp: Date.now() + 3600e3, email: 'marketing@acmestudio.example', name: 'Acme Studio', scopes: SCOPES });
      save(); store.set('lastGoogle', { email: st.email, name: st.name }); bus.postMessage({ type: 'g-token', st }); onChange('signin');
      return;
    }
    const id = clientId();
    if (!id) throw new Error('Google isn\'t set up yet — add GOOGLE_CLIENT_ID on Vercel (see the README), or paste a Client ID in Settings.');
    await loadGis();
    await new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: id, scope: SCOPES, include_granted_scopes: true, login_hint: st.email || undefined,
        callback: async (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          Object.assign(st, { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3600) - 90) * 1000, scopes: String(resp.scope || '') });
          try {
            const u = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + st.token } })).json();
            const changed = st.email && u.email && st.email !== u.email;
            Object.assign(st, { email: u.email || st.email, name: u.name || u.email, picture: u.picture || null });
            if (changed) toast('Signed in as ' + st.email);
          } catch { /* ignore */ }
          save();
          store.set('lastGoogle', { email: st.email, name: st.name, picture: st.picture });
          bus.postMessage({ type: 'g-token', st });
          onChange('signin');
          resolve();
        },
        error_callback: (err) => reject(new Error(err && err.type === 'popup_closed' ? 'The Google sign-in window was closed.' : (err && (err.message || err.type)) || 'Sign-in failed')),
      });
      tc.requestAccessToken({ prompt: opts.switch || !st.email ? 'select_account consent' : '' });
    });
  }

  function signOut() {
    if (st.token && st.token !== 'demo' && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(st.token, () => {});
    Object.assign(st, { token: null, exp: 0, email: null, name: null, picture: null, scopes: '' });
    refresh = null; clearTimeout(timer); try { store.del('grefresh'); } catch { /* ignore */ }
    save(); store.del('lastGoogle');
    bus.postMessage({ type: 'g-signout' });
    onChange('signout');
  }

  // fetch against a Google API with the current token; throws a friendly error when it has expired
  async function gfetch(url, opts = {}) {
    if (!valid() && refresh) await renew();
    if (!valid()) throw Object.assign(new Error('Your Google session has expired — click Reconnect Google (top of the page).'), { auth: true });
    const isJson = opts.body && typeof opts.body === 'object' && !(opts.body instanceof Blob) && !(opts.body instanceof FormData);
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + st.token, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: isJson ? JSON.stringify(opts.body) : opts.body });
    if (r.status === 401) { st.token = null; st.exp = 0; save(); onChange('expired'); throw Object.assign(new Error('Your Google session has expired — click Reconnect Google.'), { auth: true }); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = (j.error && (j.error.message || j.error)) || 'Google HTTP ' + r.status;
      if (/has not been used|is disabled/i.test(m)) throw new Error('Turn on this API in your Google Cloud project: ' + (m.match(/(YouTube[^.]*API[^.]*|Google Drive API)/) || ['the API'])[0] + '.');
      throw new Error(m);
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  return { st, valid, has, adopt, renew, hasRefresh: () => !!refresh, signIn, signOut, gfetch, token: () => (valid() ? st.token : null) };
}
