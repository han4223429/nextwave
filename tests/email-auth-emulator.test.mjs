// Integration tests against the real Firebase Auth Emulator, not a mocked auth service.
// Start firebase-tools 15.22.4 with an isolated /tmp/firebase.json containing:
// {"emulators":{"auth":{"host":"127.0.0.1","port":9198},"ui":{"enabled":false},"singleProjectMode":true}}
// firebase emulators:start --only auth --project demo-nextwave-email --config /tmp/firebase.json
// FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node --test tests/email-auth-emulator.test.mjs
// No SDK package, real credentials, production configuration or delivered email is used.
// Calls are the official REST equivalents of signInWithCredential, signInWithEmailLink,
// updatePassword and signInWithEmailAndPassword. This does not test the web SDK or UI.
// Verified with firebase-tools 15.22.4: five checks pass; the final executed TODO
// reproduces its missing password invalidation, contrary to the production docs.
// Never interpret the TODO as a passing account-takeover defense in production.
// References:
// https://firebase.google.com/docs/emulator-suite/connect_auth#non-interactive_testing_3
// https://firebase.google.com/docs/auth/web/email-link-auth#security_concerns
// https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithEmailLink

import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { randomUUID } from 'node:crypto';

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) {
    throw new Error('Only FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:<port> is allowed.');
}
const project = 'demo-nextwave-email';
const base = new URL(`http://${host}`);
const key = 'fake-demo-nextwave-email-key';
const suffix = randomUUID();
const fixtureEmail = name => `${name}-${suffix}@example.test`;
const password = 'Emulator-only-test-password-42!';

async function request(path, body, method = 'POST') {
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin, 'External endpoints are prohibited.');
    assert.equal(url.hostname, '127.0.0.1');
    const response = await fetch(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
}
function api(operation, body) {
    return request(`/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${key}`, body);
}
function ok(result) {
    const code = result.body.error?.message?.split(' : ')[0];
    assert.equal(result.status, 200, code || 'Auth Emulator request failed');
    return result.body;
}
function claims(token) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(payload.aud, project);
    assert.equal(payload.iss, `https://securetoken.google.com/${project}`);
    return payload;
}
async function google(email, subject) {
    const response = ok(await api('signInWithIdp', {
        requestUri: base.href,
        postBody: new URLSearchParams({ providerId: 'google.com', id_token: JSON.stringify({
            sub: subject, email, email_verified: true
        }) }).toString(),
        returnSecureToken: true
    }));
    assert.equal(claims(response.idToken).email_verified, true);
    return response;
}
async function emailCode(email) {
    ok(await api('sendOobCode', {
        requestType: 'EMAIL_SIGNIN', email, canHandleCodeInApp: true,
        continueUrl: `${base.origin}/complete-email-sign-in`
    }));
    const result = ok(await request(`/emulator/v1/projects/${project}/oobCodes`, undefined, 'GET'));
    const code = result.oobCodes.findLast(item => item.email === email && item.requestType === 'EMAIL_SIGNIN');
    assert.ok(code, 'No synthetic email sign-in code was issued by the emulator');
    return code.oobCode;
}
async function emailLogin(email) {
    return ok(await api('signInWithEmailLink', { email, oobCode: await emailCode(email) }));
}
async function account(token) {
    claims(token);
    const response = ok(await api('lookup', { idToken: token }));
    assert.equal(response.users.length, 1);
    return response.users[0];
}
function assertGoogleProvider(user, uid, subject) {
    assert.equal(user.localId, uid);
    assert.equal(user.emailVerified, true);
    assert.ok(user.providerUserInfo.some(provider => provider.providerId === 'google.com' && provider.rawId === subject));
}

before(async () => {
    const config = ok(await request(`/emulator/v1/projects/${project}/config`, undefined, 'GET'));
    assert.equal(config.signIn.allowDuplicateEmails, false, 'These tests require one account per email.');
});

test('verified Google account retains its UID and provider after standalone email-link sign-in', async () => {
    const email = fixtureEmail('existing-google');
    const subject = 'existing-google-' + suffix;
    const original = await google(email, subject);
    const linked = await emailLogin(email);
    assert.equal(linked.localId, original.localId);
    assert.equal(linked.isNewUser, false);
    assert.equal(claims(linked.idToken).email_verified, true);
    assertGoogleProvider(await account(linked.idToken), original.localId, subject);
    assert.equal((await google(email, subject)).localId, original.localId);
});

test('verified email-link user can add a password without changing the Google UID or removing Google sign-in', async () => {
    const email = fixtureEmail('add-password');
    const subject = 'add-password-' + suffix;
    const original = await google(email, subject);
    const linked = await emailLogin(email);
    assert.equal(linked.localId, original.localId);
    const updated = ok(await api('update', { idToken: linked.idToken, password, returnSecureToken: true }));
    assert.equal(updated.localId, original.localId);
    const passwordLogin = ok(await api('signInWithPassword', { email, password, returnSecureToken: true }));
    assert.equal(passwordLogin.localId, original.localId);
    assert.equal(claims(passwordLogin.idToken).email_verified, true);
    assertGoogleProvider(await account(passwordLogin.idToken), original.localId, subject);
    const googleAgain = await google(email, subject);
    assert.equal(googleAgain.localId, original.localId);
    assertGoogleProvider(await account(googleAgain.idToken), original.localId, subject);
    assert.equal((await emailLogin(email)).localId, original.localId);
});

test('password registration or a different signed-in account cannot replace an existing verified Google account', async () => {
    const email = fixtureEmail('protected-google');
    const subject = 'protected-google-' + suffix;
    const original = await google(email, subject);
    const signup = await api('signUp', { email, password, returnSecureToken: true });
    assert.equal(signup.status, 400);
    assert.match(signup.body.error.message, /^EMAIL_EXISTS/);
    const guessedLogin = await api('signInWithPassword', { email, password, returnSecureToken: true });
    assert.equal(guessedLogin.status, 400);
    const attacker = ok(await api('signUp', { email: fixtureEmail('different-user'), password, returnSecureToken: true }));
    const changeEmail = await api('update', { idToken: attacker.idToken, email, returnSecureToken: true });
    assert.equal(changeEmail.status, 400);
    assert.match(changeEmail.body.error.message, /^EMAIL_EXISTS/);
    assertGoogleProvider(await account(original.idToken), original.localId, subject);
    assert.equal((await emailLogin(email)).localId, original.localId);
});

test('email links require the exact recipient and reject replay after successful consumption', async () => {
    const email = fixtureEmail('recipient');
    const original = await google(email, 'recipient-' + suffix);
    const code = await emailCode(email);
    const mismatch = await api('signInWithEmailLink', { email: fixtureEmail('wrong-recipient'), oobCode: code });
    assert.equal(mismatch.status, 400);
    const correct = ok(await api('signInWithEmailLink', { email, oobCode: code }));
    assert.equal(correct.localId, original.localId);
    const replay = await api('signInWithEmailLink', { email, oobCode: code });
    assert.equal(replay.status, 400);
    assert.match(replay.body.error.message, /^INVALID_OOB_CODE/);
});

test('verified Google sign-in removes a password pre-registered without email ownership', async () => {
    const email = fixtureEmail('google-pre-registration');
    const attacker = ok(await api('signUp', { email, password, returnSecureToken: true }));
    assert.equal(claims(attacker.idToken).email_verified, false);
    const verified = await google(email, 'preregistered-' + suffix);
    assert.equal(verified.localId, attacker.localId);
    const attackerAgain = await api('signInWithPassword', { email, password, returnSecureToken: true });
    assert.equal(attackerAgain.status, 400, 'Pre-registered password must not survive verified Google ownership');
    assert.equal((await emailLogin(email)).localId, verified.localId);
});

test('email verification removes an unverified pre-registered password as documented for production', {
    todo: 'Auth Emulator 15.22.4 retains the old password; production behavior is not verified by this emulator.'
}, async () => {
    const email = fixtureEmail('email-pre-registration');
    const attacker = ok(await api('signUp', { email, password, returnSecureToken: true }));
    assert.equal(claims(attacker.idToken).email_verified, false);
    const verified = await emailLogin(email);
    assert.equal(verified.localId, attacker.localId);
    assert.equal(claims(verified.idToken).email_verified, true);
    const attackerAgain = await api('signInWithPassword', { email, password, returnSecureToken: true });
    assert.equal(attackerAgain.status, 400, 'Unverified password must be removed after email-link verification');
});
