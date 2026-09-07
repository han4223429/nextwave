const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Production module + small DOM + deferred Firebase methods. No real email is sent.
// Firebase server/UID behavior is separately exercised in email-auth-emulator.test.mjs.
const source = readFileSync(path.join(__dirname, '..', 'email-auth.js'), 'utf8');
const html = readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
const EMAIL_KEY = 'nw:email-signin';
const NOW = Date.UTC(2026, 8, 7, 4);
const address = 'member@example.test';
const actionLink = 'https://wenw.ceo/portal.html?mode=signIn&oobCode=synthetic-one-time-code&apiKey=public-test-key#private-fragment';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function user(uid = 'verified-member', verified = true) {
  return { uid, email: address, emailVerified: verified, providerData: [{ providerId: 'google.com' }],
    updates: [], updatePassword(value) { const result = deferred(); this.updates.push({ value, ...result }); return result.promise; } };
}

function harness({ href = 'https://wenw.ceo/portal.html', saved = null, blockedStorage = false, currentUser = null, browserBoot = false } = {}) {
  let now = NOW, nextTimer = 0;
  const nodes = new Map(), timers = new Map(), storageWrites = [], logs = [], historyWrites = [], authenticated = [];
  const store = new Map(saved === null ? [] : [[EMAIL_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  function node(id) {
    const events = new Map();
    return { id, value: '', textContent: '', hidden: false, disabled: false, required: false, inert: false, open: false, attributes: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key] ?? null; },
      addEventListener(type, handler) { if (!events.has(type)) events.set(type, []); events.get(type).push(handler); },
      emit(type) { return Promise.all((events.get(type) || []).map(fn => fn({ preventDefault() {} }))); },
      focus() { doc.activeElement = this; }, showModal() { this.open = true; },
      close() { this.open = false; this.emit('close'); } };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], node(match[1]));
  const passwordOpen = [node('pending-password-open'), node('member-password-open')];
  const doc = { activeElement: null, getElementById: id => nodes.get(id) || null,
    querySelectorAll(selector) { assert.equal(selector, '[data-email-password-open]'); return passwordOpen; } };
  const storage = {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { storageWrites.push([key, value]); store.set(key, value); },
    removeItem(key) { store.delete(key); }
  };
  const win = { location: new URL(href), document: doc,
    history: { replaceState(_state, _title, url) { historyWrites.push(url); win.location = new URL(url, win.location); } },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); } };
  Object.defineProperty(win, 'localStorage', { get() { if (blockedStorage) throw new Error('Storage blocked'); return storage; } });
  const calls = { send: [], link: [], password: [], signOut: [] };
  function attempt(kind, args) { const result = deferred(); calls[kind].push({ args, ...result }); return result.promise; }
  const auth = { currentUser,
    isSignInWithEmailLink(url) { const parsed = new URL(url); return parsed.searchParams.get('mode') === 'signIn' && parsed.searchParams.has('oobCode'); },
    sendSignInLinkToEmail(...args) { return attempt('send', args); },
    signInWithEmailLink(...args) { return attempt('link', args); },
    signInWithEmailAndPassword(...args) { return attempt('password', args); },
    async signOut() { calls.signOut.push(this.currentUser?.uid); this.currentUser = null; } };
  class Clock extends Date { static now() { return now; } }
  const context = { URL, Date: Clock, window: win, console: { log: (...x) => logs.push(x), warn: (...x) => logs.push(x), error: (...x) => logs.push(x) } };
  if (!browserBoot) context.module = { exports: {} };
  vm.createContext(context); vm.runInContext(source, context);
  const api = browserBoot ? win.NextWaveEmailAuth : context.module.exports;
  const module = api.create({ auth, window: win, document: doc, onAuthenticated: u => authenticated.push(u) });
  return { module, auth, calls, nodes, win, doc, store, storageWrites, historyWrites, logs, authenticated, passwordOpen, timers,
    node: id => nodes.get(id), fire: (id, event = 'click') => nodes.get(id).emit(event),
    tick(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    async resolveLogin(kind, index, person) { auth.currentUser = person; calls[kind][index].resolve({ user: person }); },
    fillPassword(value, confirmation = value) { nodes.get('email-new-password').value = value; nodes.get('email-confirm-password').value = confirmation; }
  };
}
function assertNoExposure(h, ...values) {
  const rendered = [...h.nodes.values()].map(n => ({ text: n.textContent, attributes: n.attributes }));
  const output = JSON.stringify([rendered, h.storageWrites, h.logs, h.historyWrites]);
  for (const value of values) assert.equal(output.includes(value), false, 'Credential/link leaked outside its auth request or input');
}
async function linkMode(h) { await h.fire('email-login-mode'); h.node('email-login-address').value = address; }

test('browser boot removes action data from the URL before UI initialization and keeps confirmation explicit', async () => {
  const h = harness({ href: actionLink, browserBoot: true });
  assert.equal(h.win.location.href, 'https://wenw.ceo/portal.html');
  assert.equal(h.node('auth-referrer').getAttribute('content'), 'no-referrer');
  assert.equal(h.module.hasPendingLink(), true);
  assert.equal(h.calls.link.length, 0);
  h.node('email-login-address').value = address;
  const submitting = h.fire('email-login-form', 'submit');
  assert.equal(h.calls.link[0].args[1], actionLink, 'Only the auth call receives the original in-memory link');
  assert.equal(h.authenticated.length, 0);
  await h.resolveLogin('link', 0, user()); await submitting;
  assert.equal(h.module.hasPendingLink(), false);
  assert.equal(h.authenticated.length, 1);
  assertNoExposure(h, 'synthetic-one-time-code', 'private-fragment', actionLink);
});

test('link requests use a fixed same-origin callback without email, arbitrary return URLs or fragments', async () => {
  for (const [href, expected] of [
    ['https://wenw.ceo/portal.html?next=https://other.example/path&email=someone@example.test#secret', 'https://wenw.ceo/portal.html'],
    ['http://localhost:8000/portal.html?redirect=elsewhere#fragment', 'http://localhost:8000/portal.html']
  ]) {
    const h = harness({ href }); await linkMode(h);
    const submitting = h.fire('email-login-form', 'submit');
    const [email, settings] = h.calls.send[0].args;
    assert.equal(email, address); assert.equal(settings.url, expected); assert.equal(settings.handleCodeInApp, true);
    h.calls.send[0].resolve(); await submitting;
    const stored = JSON.parse(h.store.get(EMAIL_KEY));
    assert.deepEqual(stored, { email: address, at: NOW });
    assert.equal(h.authenticated.length, 0);
  }
  for (const href of ['http://wenw.ceo/portal.html', 'http://localhost.attacker.test/portal.html', 'file:///tmp/portal.html']) {
    const h = harness({ href }); await linkMode(h); await h.fire('email-login-form', 'submit');
    assert.equal(h.calls.send.length, 0); assert.equal(h.module.isBusy(), false); assert.ok(h.node('email-auth-error').textContent);
  }
});

test('blocked, stale or malformed storage requires typing the recipient and never automatically consumes a link', async () => {
  for (const options of [{ blockedStorage: true }, { saved: '{broken' }, { saved: { email: address, at: NOW - 86400000 } }, { saved: { email: address, at: NOW + 1 } }]) {
    const h = harness({ href: actionLink, ...options });
    assert.equal(h.node('email-login-address').value, ''); assert.equal(h.calls.link.length, 0);
    await h.fire('email-login-form', 'submit'); assert.equal(h.calls.link.length, 0);
    h.node('email-login-address').value = address;
    const submitting = h.fire('email-login-form', 'submit');
    await h.resolveLogin('link', 0, user()); await submitting;
    assert.equal(h.authenticated.length, 1); assert.equal(h.store.has(EMAIL_KEY), false);
    assertNoExposure(h, 'synthetic-one-time-code');
  }
  const remembered = harness({ href: actionLink, saved: { email: address, at: NOW - 1000 } });
  assert.equal(remembered.node('email-login-address').value, address);
  assert.equal(remembered.calls.link.length, 0);
});

test('wrong or expired links recover with safe errors and can be cancelled to request a fresh link', async () => {
  for (const code of ['auth/invalid-email', 'auth/expired-action-code']) {
    const h = harness({ href: actionLink }); h.node('email-login-address').value = address;
    const submitting = h.fire('email-login-form', 'submit');
    h.calls.link[0].reject({ code, message: 'synthetic-one-time-code RAW_PRIVATE_DETAILS' }); await submitting;
    assert.equal(h.module.isBusy(), false); assert.equal(h.node('email-login-submit').disabled, false);
    assert.equal(h.module.hasPendingLink(), true); assert.equal(h.authenticated.length, 0);
    assertNoExposure(h, 'synthetic-one-time-code', 'RAW_PRIVATE_DETAILS');
    await h.fire('email-login-cancel'); assert.equal(h.module.hasPendingLink(), false);
    assert.equal(h.store.has(EMAIL_KEY), false); assert.deepEqual(h.authenticated, [null], 'Cancel is a lifecycle notification, not a verified identity');
    await linkMode(h); const fresh = h.fire('email-login-form', 'submit');
    assert.equal(h.calls.send.length, 1); h.calls.send[0].resolve(); await fresh;
  }
});

test('double submit, resend cooldown and external Google activity do not create concurrent email requests', async () => {
  const h = harness(); await linkMode(h);
  h.module.setExternalBusy(true); await h.fire('email-login-form', 'submit'); assert.equal(h.calls.send.length, 0);
  h.module.setExternalBusy(false);
  const first = h.fire('email-login-form', 'submit'); await h.fire('email-login-form', 'submit');
  assert.equal(h.calls.send.length, 1); assert.equal(h.node('login-btn').disabled, true); assert.equal(h.node('google-signin').inert, true);
  h.calls.send[0].resolve(); await first; await h.fire('email-login-form', 'submit'); assert.equal(h.calls.send.length, 1);
  h.tick(60000); assert.equal(h.node('email-login-submit').disabled, false);
  const resend = h.fire('email-login-form', 'submit'); assert.equal(h.calls.send.length, 2); h.calls.send[1].resolve(); await resend;
  h.module.dispose(); assert.equal(h.timers.size, 0);
});

test('send failures restore controls and permit retry without storing a link or raw provider error', async () => {
  const h = harness(); await linkMode(h);
  const first = h.fire('email-login-form', 'submit');
  h.calls.send[0].reject({ code: 'auth/network-request-failed', message: actionLink }); await first;
  assert.equal(h.module.isBusy(), false); assert.equal(h.node('email-login-submit').disabled, false);
  assert.equal(h.store.size, 0); assertNoExposure(h, 'synthetic-one-time-code');
  const retry = h.fire('email-login-form', 'submit'); assert.equal(h.calls.send.length, 2); h.calls.send[1].resolve(); await retry;
});

test('unverified password users are signed out and must verify their email without an authenticated callback', async () => {
  const h = harness(); const unverified = user('unverified', false);
  h.node('email-login-address').value = address; h.node('email-login-password').value = 'NeverLogThisPassword';
  const submitting = h.fire('email-login-form', 'submit');
  await h.resolveLogin('password', 0, unverified); await submitting;
  assert.deepEqual(h.calls.signOut, ['unverified']); assert.equal(h.auth.currentUser, null); assert.equal(h.authenticated.length, 0);
  assert.equal(h.node('email-login-address').value, address); assert.equal(h.node('email-password-field').hidden, true);
  assert.match(h.node('email-auth-status').textContent, /이메일 인증/); assert.equal(h.node('email-login-password').value, '');
  assertNoExposure(h, 'NeverLogThisPassword');
});

test('stale login completion cannot authenticate another current UID or expose a password on error', async () => {
  const h = harness(); h.node('email-login-address').value = address; h.node('email-login-password').value = 'PrivatePasswordErrorMarker';
  const first = h.fire('email-login-form', 'submit');
  h.calls.password[0].reject({ code: 'auth/invalid-credential', message: 'PrivatePasswordErrorMarker' }); await first;
  assert.equal(h.node('email-login-password').value, ''); assertNoExposure(h, 'PrivatePasswordErrorMarker');
  h.node('email-login-password').value = 'PrivatePasswordErrorMarker'; const retry = h.fire('email-login-form', 'submit');
  h.auth.currentUser = user('different-current-uid'); h.calls.password[1].resolve({ user: user('original-request-uid') }); await retry;
  assert.equal(h.authenticated.length, 0); assert.equal(h.auth.currentUser.uid, 'different-current-uid');
  assert.equal(h.node('email-login-password').value, '');
});

test('a different signed-in email blocks an account switch before any Firebase request', async () => {
  const h = harness({ currentUser: { ...user(), email: 'another@example.test' } });
  h.node('email-login-address').value = address; h.node('email-login-password').value = 'UserEnteredPassword';
  await h.fire('email-login-form', 'submit');
  assert.equal(h.calls.password.length, 0); assert.equal(h.authenticated.length, 0);
  assert.match(h.node('email-auth-error').textContent, /다른 계정/);
});

test('password setup requires a verified current user, matching 12–128 characters and one update at a time', async () => {
  const unverified = user('unverified', false); const denied = harness({ currentUser: unverified });
  assert.equal(denied.passwordOpen.every(button => button.hidden), true);
  denied.fillPassword('ValidButNotVerified'); await denied.fire('email-password-form', 'submit'); assert.equal(unverified.updates.length, 0);
  const verified = user(); const h = harness({ currentUser: verified });
  await h.passwordOpen[0].emit('click'); assert.equal(h.node('email-password-modal').open, true);
  for (const [value, confirm] of [['short', 'short'], ['x'.repeat(129), 'x'.repeat(129)], ['TwelveOrMoreChars', 'DifferentPassword']]) {
    h.fillPassword(value, confirm); await h.fire('email-password-form', 'submit'); assert.equal(verified.updates.length, 0);
  }
  h.fillPassword('PrivateNewPassword42!'); const saving = h.fire('email-password-form', 'submit'); await h.fire('email-password-form', 'submit');
  assert.equal(verified.updates.length, 1); assert.equal(h.node('email-password-save').disabled, true);
  verified.updates[0].resolve(); await saving;
  assert.equal(h.auth.currentUser, verified); assert.equal(verified.providerData[0].providerId, 'google.com');
  assert.equal(h.node('email-new-password').value, ''); assert.equal(h.node('email-confirm-password').value, '');
  assert.equal(h.node('email-password-save').disabled, false); assert.ok(h.node('email-password-status').textContent);
  assert.equal(h.storageWrites.length, 0); assertNoExposure(h, 'PrivateNewPassword42!');
});

test('password errors clear inputs, suppress raw details and do not report completion after the UID changes', async () => {
  const verified = user(); const h = harness({ currentUser: verified });
  await h.passwordOpen[0].emit('click'); h.fillPassword('PasswordErrorSecret42');
  const first = h.fire('email-password-form', 'submit'); verified.updates[0].reject({ code: 'auth/requires-recent-login', message: 'PasswordErrorSecret42' }); await first;
  assert.match(h.node('email-password-error').textContent, /다시 로그인/); assert.equal(h.node('email-new-password').value, '');
  assert.equal(h.node('email-confirm-password').value, ''); assertNoExposure(h, 'PasswordErrorSecret42');
  h.fillPassword('PasswordForOriginalUser'); const second = h.fire('email-password-form', 'submit');
  const replacement = user('replacement'); h.auth.currentUser = replacement; h.module.syncUser(replacement);
  assert.equal(h.node('email-password-modal').open, false);
  verified.updates[1].resolve(); await second;
  assert.equal(replacement.updates.length, 0); assert.equal(h.node('email-password-status').textContent, '');
  assertNoExposure(h, 'PasswordForOriginalUser');
});
