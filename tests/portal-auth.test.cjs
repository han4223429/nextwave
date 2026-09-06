const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const source = readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Execute production auth functions with controlled SDK responses and a small DOM.
// This is not a browser, token verifier, Google request, or live Firebase connection.
function harness({ query = '?signin=google', loaded = true, factoryError = null, renderError = false } = {}) {
  const nodes = new Map(), scripts = [], timers = new Map(), logs = [], storageWrites = [];
  const credentials = [], verifications = [], memberReads = [];
  let callback, renderOptions, observer, timerId = 0;
  function node(id = '') {
    return { id, hidden: false, disabled: false, inert: false, open: false, value: '', textContent: '',
      clientWidth: 320, children: [], dataset: {}, attributes: {},
      classList: { add() {}, remove() {}, toggle() {} },
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; }, removeAttribute(name) { delete this.attributes[name]; },
      querySelectorAll() { return []; }, querySelector() { return null; }, contains() { return false; },
      addEventListener() {}, close() { this.open = false; } };
  }
  function getNode(id) { if (!nodes.has(id)) nodes.set(id, node(id)); return nodes.get(id); }
  getNode('google-signin').hidden = true;
  getNode('portal-app').hidden = true;
  getNode('pending-screen').hidden = true;
  const auth = {
    currentUser: null,
    setPersistence: () => Promise.resolve(),
    onAuthStateChanged(fn) { observer = fn; },
    signInWithCredential(credential) {
      const result = deferred();
      verifications.push({ credential, ...result });
      return result.promise;
    }
  };
  const db = { collection(name) {
    assert.equal(name, 'members', 'Unapproved login must not subscribe to private collections');
    return { doc(uid) { return { get() { memberReads.push(uid); return new Promise(() => {}); } }; } };
  } };
  class Provider {}
  Provider.credential = token => {
    if (factoryError) throw factoryError;
    const result = Object.freeze({ opaqueFirebaseCredential: Symbol('verified-by-SDK-only') });
    credentials.push({ token, result });
    return result;
  };
  const firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth: () => auth, firestore: () => db };
  firebase.auth.GoogleAuthProvider = Provider;
  firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  const identity = {
    initialize(options) { callback = options.callback; },
    renderButton(container, options) { if (renderError) throw new Error('Button rendering unavailable'); renderOptions = options; }
  };
  const context = {
    Date, Intl, URL, URLSearchParams, firebase,
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    localStorage: { setItem: (...args) => storageWrites.push(args) }, sessionStorage: { setItem: (...args) => storageWrites.push(args) },
    window: { location: { search: query }, firebase, NEXTWAVE_GOOGLE_CLIENT_ID: 'public-test-client.apps.googleusercontent.com', NEXTWAVE_FIREBASE_CONFIG: { apiKey: 'public-test-key' } },
    document: { getElementById: getNode, querySelectorAll: () => [], createElement: () => node(),
      createDocumentFragment: () => node(), createTextNode: text => ({ textContent: text }), head: { append(script) { scripts.push(script); } } }
  };
  if (loaded) context.window.google = { accounts: { id: identity } };
  vm.createContext(context);
  const instrumented = source.replace(/  init\(\);\n\}\)\(\);\s*$/, `
    globalThis.testAuth = { initAuth, initGoogleIdentity, getState: () => ({ currentUser, currentProfile }) };
  })();`);
  assert.notEqual(instrumented, source, 'The harness must suppress only application boot');
  vm.runInContext(instrumented, context);
  context.testAuth.initAuth();
  return { api: context.testAuth, auth, getNode, nodes, scripts, timers, logs, storageWrites, credentials, verifications, memberReads,
    callback: response => callback(response), click: () => renderOptions.click_listener(),
    installGoogle() { context.window.google = { accounts: { id: identity } }; },
    emitAuth(user) { auth.currentUser = user; observer(user); },
    hasCallback: () => !!callback };
}

function assertNoTokenExposure(h, token) {
  const visible = [...h.nodes.values()].map(node => ({ text: node.textContent, attributes: node.attributes, dataset: node.dataset }));
  assert.equal(JSON.stringify([visible, h.logs, h.storageWrites]).includes(token), false);
  assert.equal(h.storageWrites.length, 0);
}

test('Google callback goes through Firebase verification and never grants membership from its payload', async () => {
  const h = harness();
  await h.api.initGoogleIdentity();
  const token = 'synthetic-id-token-never-log';
  const attempt = h.callback({ credential: token, user: { uid: 'untrusted', isMember: true, isAdmin: true } });
  assert.equal(h.verifications.length, 1);
  assert.equal(h.verifications[0].credential, h.credentials[0].result);
  assert.equal(h.getNode('google-signin').inert, true);
  assert.equal(h.getNode('google-signin').getAttribute('aria-busy'), 'true');
  assert.equal(h.getNode('portal-app').hidden, true);
  assert.equal(h.memberReads.length, 0);
  h.verifications[0].resolve({ user: { uid: 'sdk-return-value', isMember: true } });
  await attempt;
  assert.equal(h.api.getState().currentUser, null, 'Only the Firebase auth observer may set application identity');
  assert.equal(h.getNode('portal-app').hidden, true);
  h.emitAuth({ uid: 'firebase-confirmed-user' });
  assert.equal(h.getNode('pending-screen').hidden, false);
  assert.equal(h.getNode('portal-app').hidden, true, 'Firebase authentication still requires a member profile');
  assert.deepEqual(h.memberReads, ['firebase-confirmed-user']);
  assertNoTokenExposure(h, token);
});

test('concurrent tokens are ignored while verification is pending and failure permits a clean retry', async () => {
  const h = harness();
  await h.api.initGoogleIdentity();
  const token = 'synthetic-rejected-token';
  const first = h.callback({ credential: token });
  await h.callback({ credential: 'concurrent-token' });
  assert.equal(h.verifications.length, 1);
  h.verifications[0].reject({ code: 'auth/network-request-failed', message: token });
  await first;
  assert.equal(h.getNode('google-signin').inert, false);
  assert.equal(h.getNode('google-signin').getAttribute('aria-busy'), null);
  assert.equal(h.getNode('login-error').dataset.code, 'auth/network-request-failed');
  assert.equal(h.getNode('portal-app').hidden, true);
  assertNoTokenExposure(h, token);
  const retry = h.callback({ credential: 'retry-token' });
  assert.equal(h.verifications.length, 2);
  assert.equal(h.getNode('login-error').textContent, '');
  h.verifications[1].resolve({}); await retry;
  h.auth.currentUser = { uid: 'already-connected' };
  await h.callback({ credential: 'late-token' });
  assert.equal(h.verifications.length, 2, 'A late GIS response must not replace an existing Firebase user');
});

test('cancelled or malformed Google responses leave the sign-in control usable without authenticating', async () => {
  const h = harness();
  await h.api.initGoogleIdentity();
  h.getNode('login-error').textContent = 'Previous attempt';
  h.click(); // Cancelled Google UI returns no credential callback.
  for (const response of [undefined, {}, { credential: '' }, { credential: null }, { credential: { isMember: true } }]) await h.callback(response);
  assert.equal(h.verifications.length, 0);
  assert.equal(h.credentials.length, 0);
  assert.equal(h.getNode('google-signin').hidden, false);
  assert.equal(h.getNode('google-signin').inert, false);
  assert.equal(h.getNode('google-signin').getAttribute('aria-busy'), null);
  assert.equal(h.getNode('login-error').textContent, '');
});

test('credential-construction failure restores controls and never surfaces raw provider errors', async () => {
  const token = 'Synthetic.Raw.Token';
  const h = harness({ factoryError: { code: 'auth/' + token, message: token } });
  await h.api.initGoogleIdentity();
  await h.callback({ credential: token });
  assert.equal(h.verifications.length, 0);
  assert.equal(h.getNode('login-error').dataset.code, 'unknown');
  assert.equal(h.getNode('google-signin').inert, false);
  assert.equal(h.getNode('google-signin').getAttribute('aria-busy'), null);
  assertNoTokenExposure(h, token);
});

test('GIS loading error, missing API and button-render failure preserve the standard login fallback', async () => {
  for (const mode of ['network', 'missing-api', 'render']) {
    const h = harness({ loaded: mode === 'render', renderError: mode === 'render' });
    const loading = h.api.initGoogleIdentity();
    if (mode === 'network') h.scripts[0].onerror();
    if (mode === 'missing-api') h.scripts[0].onload();
    await loading;
    assert.equal(h.getNode('google-signin').hidden, true);
    assert.equal(h.getNode('login-btn').hidden, false);
    assert.equal(h.getNode('login-btn').disabled, false);
    assert.equal(h.getNode('portal-app').hidden, true);
    assert.equal(h.verifications.length, 0);
    assert.equal(h.timers.size, 0);
  }
});

test('a Google script that arrives after the timeout cannot hide the restored fallback', async () => {
  const h = harness({ loaded: false });
  const loading = h.api.initGoogleIdentity();
  [...h.timers.values()][0]();
  await loading;
  h.installGoogle(); h.scripts[0].onload();
  await Promise.resolve();
  assert.equal(h.hasCallback(), false);
  assert.equal(h.getNode('login-btn').hidden, false);
  assert.equal(h.getNode('google-signin').hidden, true);
  assert.equal(h.verifications.length, 0);
});

test('the regular portal does not initialize the experimental Google path', async () => {
  const h = harness({ query: '' });
  await h.api.initGoogleIdentity();
  assert.equal(h.hasCallback(), false);
  assert.equal(h.getNode('login-btn').hidden, false);
  assert.equal(h.scripts.length, 0);
});
