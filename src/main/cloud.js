'use strict';
// Clipy Cloud: Firebase Auth + Firestore over plain REST (no SDK needed).
// Powers online accounts (Google / email + password) and the friends system.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');

module.exports = function createCloud({ userDir, config }) {
  const apiKey = String(config.firebaseApiKey || '').trim();
  const projectId = String(config.firebaseProjectId || '').trim();
  const SESSION_FILE = path.join(userDir, 'cloud-session.bin');
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  let session = loadSession(); // { uid, idToken, refreshToken, expires, email, provider }

  const configured = () => !!(apiKey && projectId);

  // ── session persistence (encrypted with Windows DPAPI via safeStorage when available)
  function loadSession() {
    try {
      const raw = fs.readFileSync(SESSION_FILE);
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
      return JSON.parse(json);
    } catch { return null; }
  }
  function saveSession() {
    try {
      if (!session) { fs.rmSync(SESSION_FILE, { force: true }); return; }
      const json = JSON.stringify(session);
      fs.writeFileSync(SESSION_FILE, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json));
    } catch {}
  }

  // ── auth
  const AUTH_ERRORS = {
    EMAIL_EXISTS: 'An account with this email already exists – sign in instead',
    EMAIL_NOT_FOUND: 'Wrong email or password',
    INVALID_PASSWORD: 'Wrong email or password',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password',
    USER_DISABLED: 'This account has been disabled',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts – try again in a few minutes',
    INVALID_EMAIL: 'Enter a valid email address',
    OPERATION_NOT_ALLOWED: 'This sign-in method is not enabled in Firebase yet',
    CONFIGURATION_NOT_FOUND: 'Firebase Authentication is not set up yet',
  };
  async function idp(endpoint, body) {
    if (!configured()) throw new Error('Clipy Cloud is not set up');
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) {
      const code = String((j.error && j.error.message) || 'ERROR').split(' ')[0];
      if (code.startsWith('WEAK_PASSWORD')) throw new Error('Password needs at least 6 characters');
      throw new Error(AUTH_ERRORS[code] || code.replace(/_/g, ' ').toLowerCase());
    }
    return j;
  }
  function setSession(j, provider) {
    session = {
      uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken,
      expires: Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000,
      email: j.email || null, provider, name: j.displayName || j.fullName || null, photo: j.photoUrl || null,
    };
    saveSession();
    return session;
  }
  const signUpEmail = async (email, password) => setSession(await idp('signUp', { email, password, returnSecureToken: true }), 'password');
  const signInEmail = async (email, password) => setSession(await idp('signInWithPassword', { email, password, returnSecureToken: true }), 'password');
  const signInGoogle = async (googleIdToken) => setSession(await idp('signInWithIdp', {
    postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
    requestUri: 'http://localhost', returnIdpCredential: true, returnSecureToken: true,
  }), 'google');
  async function changePassword(newPassword) {
    const t = await token();
    const j = await idp('update', { idToken: t, password: newPassword, returnSecureToken: true });
    session.idToken = j.idToken; session.refreshToken = j.refreshToken;
    session.expires = Date.now() + (Number(j.expiresIn) || 3600) * 1000 - 60000;
    saveSession();
  }
  const resetPassword = (email) => idp('sendOobCode', { requestType: 'PASSWORD_RESET', email });
  function signOut() { session = null; saveSession(); }

  async function token() {
    if (!session) throw new Error('Not signed in');
    if (Date.now() < session.expires) return session.idToken;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
    });
    const j = await r.json();
    if (!r.ok) { signOut(); throw new Error('Session expired – please sign in again'); }
    session.idToken = j.id_token; session.refreshToken = j.refresh_token;
    session.expires = Date.now() + Number(j.expires_in) * 1000 - 60000;
    saveSession();
    return session.idToken;
  }

  // ── Firestore value encoding
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
    return { stringValue: String(v) };
  }
  function dec(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return Date.parse(v.timestampValue);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    return null;
  }
  const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
  const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
  const docOut = (d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields) });

  async function api(method, url, body) {
    const t = await token();
    const r = await fetch(url, {
      method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || `HTTP ${r.status}`;
      if (/PERMISSION_DENIED/i.test(j.error && j.error.status)) throw new Error('Permission denied – check the Firestore rules');
      if (/NOT_FOUND|does not exist/i.test(msg)) throw new Error('Firestore database not created yet');
      throw new Error(msg);
    }
    return j;
  }
  async function getDoc(p) { const d = await api('GET', `${FS_BASE}/${p}`); return d ? docOut(d) : null; }
  async function setDoc(p, data, merge = true) {
    const mask = merge ? '?' + Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&') : '';
    return api('PATCH', `${FS_BASE}/${p}${mask}`, { fields: toFields(data) });
  }
  async function createDoc(p, data) {
    // fails if the document already exists
    return api('PATCH', `${FS_BASE}/${p}?currentDocument.exists=false`, { fields: toFields(data) });
  }
  const delDoc = (p) => api('DELETE', `${FS_BASE}/${p}`);
  async function listDocs(p, pageSize = 100, orderBy = '') {
    const j = await api('GET', `${FS_BASE}/${p}?pageSize=${pageSize}${orderBy ? `&orderBy=${encodeURIComponent(orderBy)}` : ''}`);
    return j && j.documents ? j.documents.map(docOut) : [];
  }
  async function query(collection, field, value, { parent = '', orderBy, limit } = {}) {
    const sq = { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } } };
    if (orderBy) sq.orderBy = [{ field: { fieldPath: orderBy }, direction: 'DESCENDING' }];
    if (limit) sq.limit = limit;
    const j = await api('POST', `${FS_BASE}${parent ? '/' + parent : ''}:runQuery`, { structuredQuery: sq });
    return (j || []).filter((x) => x.document).map((x) => docOut(x.document));
  }

  // ── profile + friend code
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const makeCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  async function ensureProfile({ name, photo }) {
    const uid = session.uid;
    let me = await getDoc(`users/${uid}`);
    if (!me || !me.code) {
      let code;
      for (let i = 0; i < 5; i++) {
        code = makeCode();
        try { await createDoc(`codes/${code}`, { uid }); break; } catch (e) { if (i === 4) throw e; }
      }
      me = { ...(me || {}), code, created: Date.now() };
    }
    const data = { name: name || me.name || (session.email || 'Player').split('@')[0], photo: photo || session.photo || me.photo || '', code: me.code, created: me.created || Date.now(), lastSeen: Date.now() };
    await setDoc(`users/${uid}`, data);
    return { uid, ...data };
  }
  async function heartbeat({ name, game, clipping }) {
    if (!session) return;
    const patch = { lastSeen: Date.now(), game: game || '', clipping: !!clipping };
    if (name) patch.name = name;
    await setDoc(`users/${session.uid}`, patch);
  }

  // ── friends
  async function sendRequest(rawCode, myName) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) throw new Error('Friend codes have 6 characters');
    const c = await getDoc(`codes/${code}`);
    if (!c) throw new Error('No player with that code');
    if (c.uid === session.uid) throw new Error('That is your own code');
    if (await getDoc(`users/${session.uid}/friends/${c.uid}`).catch(() => null)) throw new Error('You are already friends');
    // if they already invited me, accept straight away (rules deny reading a missing request → treat as none)
    const back = await getDoc(`requests/${c.uid}_${session.uid}`).catch(() => null);
    if (back) { await accept(back); return { accepted: true, name: back.fromName }; }
    const them = await getDoc(`users/${c.uid}`);
    await setDoc(`requests/${session.uid}_${c.uid}`, { from: session.uid, to: c.uid, fromName: myName || '', toName: (them && them.name) || '', created: Date.now() }, false);
    return { accepted: false, name: them && them.name };
  }
  async function accept(req) {
    const me = session.uid, other = req.from;
    const meDoc = await getDoc(`users/${me}`);
    await setDoc(`users/${me}/friends/${other}`, { since: Date.now(), name: req.fromName || '' }, false);
    await setDoc(`users/${other}/friends/${me}`, { since: Date.now(), name: (meDoc && meDoc.name) || '' }, false);
    await delDoc(`requests/${req.id}`).catch(() => {});
  }
  const decline = (req) => delDoc(`requests/${req.id}`);
  async function removeFriend(uid) {
    await delDoc(`users/${session.uid}/friends/${uid}`).catch(() => {});
    await delDoc(`users/${uid}/friends/${session.uid}`).catch(() => {});
  }
  async function overview() {
    const uid = session.uid;
    const [me, friendDocs, incoming, outgoing] = await Promise.all([
      getDoc(`users/${uid}`),
      listDocs(`users/${uid}/friends`),
      query('requests', 'to', uid),
      query('requests', 'from', uid),
    ]);
    const friends = await Promise.all(friendDocs.map(async (f) => {
      const u = await getDoc(`users/${f.id}`).catch(() => null);
      let activity = [];
      try { activity = await listDocs(`users/${f.id}/activity`, 8, 'at desc'); } catch {}
      return { uid: f.id, since: f.since, name: (u && u.name) || f.name || 'Player', photo: (u && u.photo) || '', lastSeen: (u && u.lastSeen) || 0, game: (u && u.game) || '', clipping: !!(u && u.clipping), activity };
    }));
    return { me, friends, incoming, outgoing };
  }
  async function postActivity({ title, game, duration, type }) {
    if (!session) return;
    const id = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
    await setDoc(`users/${session.uid}/activity/${id}`, { title: title || '', game: game || '', duration: duration || 0, type: type || 'clip', at: Date.now() }, false);
    // keep only the latest 20 entries
    const all = await listDocs(`users/${session.uid}/activity`, 100, 'at desc');
    all.slice(20).forEach((d) => delDoc(`users/${session.uid}/activity/${d.id}`).catch(() => {}));
  }

  return {
    configured, session: () => session, signUpEmail, signInEmail, signInGoogle, signOut, changePassword, resetPassword,
    ensureProfile, heartbeat, sendRequest, accept, decline, removeFriend, overview, postActivity,
  };
};
