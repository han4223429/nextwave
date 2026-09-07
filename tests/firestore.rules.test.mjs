// Run against an isolated Firestore emulator loaded with ../firestore.rules:
// java -Duser.language=en -Duser.country=US -jar /path/to/firestore-emulator.jar \
//   --host 127.0.0.1 --port 8187 --project_id demo-nextwave-security \
//   --single_project_mode --single_project_mode_error --rules "$PWD/firestore.rules"
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 node --test tests/firestore.rules.test.mjs
// No SDK or real Firebase credentials are used. Non-loopback endpoints are refused.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error('Set FIRESTORE_EMULATOR_HOST to a local emulator; live endpoints are prohibited.');
}
const project = 'demo-nextwave-security';
const root = `projects/${project}/databases/(default)/documents`;
const base = `http://${host}/v1/${root}`;
const suffix = Date.now().toString(36);
const ids = Object.fromEntries(['admin', 'member', 'other', 'pending'].map(role => [role, `${role}-${suffix}`]));
const email = uid => `${uid}@example.test`;
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function token(identity) {
    if (identity === 'owner') return 'owner'; // Emulator-only fixture seeding.
    const { uid, verified = true, provider = 'google.com' } = typeof identity === 'object' && identity
        ? identity : { uid: identity };
    if (!uid) return null;
    const now = Math.floor(Date.now() / 1000);
    return `${encoded({ alg: 'none', typ: 'JWT' })}.${encoded({
        iss: `https://securetoken.google.com/${project}`, aud: project,
        sub: uid, user_id: uid, email: email(uid),
        ...(verified === null ? {} : { email_verified: verified }),
        iat: now, exp: now + 3600, auth_time: now,
        firebase: { identities: { email: [email(uid)] }, sign_in_provider: provider }
    })}.`;
}

function field(value) {
    if (typeof value === 'boolean') return { booleanValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    return { stringValue: value };
}

async function request(url, uid, method = 'GET', body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token(uid)) headers.Authorization = `Bearer ${token(uid)}`;
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
}

function write(uid, path, data, { update = false, timestamps = [] } = {}) {
    const item = {
        update: { name: `${root}/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, field(v)])) },
        currentDocument: { exists: update }
    };
    if (update) item.updateMask = { fieldPaths: Object.keys(data) };
    if (timestamps.length) item.updateTransforms = timestamps.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
    return request(`${base}:commit`, uid, 'POST', { writes: [item] });
}

function expectStatus(result, status) {
    assert.equal(result.status, status, JSON.stringify(result.body));
}
function seoulDate() {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
function profile(uid, flags = {}) {
    return { uid, email: email(uid), displayName: '테스트 부원', photoURL: '', isAdmin: false, isMember: false, role: 'pending', ...flags };
}

before(async () => {
    for (const [role, uid] of Object.entries(ids)) {
        expectStatus(await write('owner', `members/${uid}`, profile(uid, {
            isMember: role !== 'pending', isAdmin: role === 'admin', role,
            createdAt: new Date(), updatedAt: new Date()
        })), 200);
    }
});

test('pending signup binds identity, role, types and server timestamps', async () => {
    const fresh = `new-${suffix}`;
    expectStatus(await write(fresh, `members/${fresh}`, profile(fresh), { timestamps: ['createdAt', 'updatedAt'] }), 200);
    for (const [label, patch] of Object.entries({
        admin: { isAdmin: true }, member: { isMember: true }, email: { email: 'other@example.test' },
        name: { displayName: 'x'.repeat(101) }, avatar: { photoURL: 'javascript:void(0)' },
        time: { createdAt: new Date('2000-01-01T00:00:00Z') }
    })) {
        const uid = `signup-${label}-${suffix}`;
        expectStatus(await write(uid, `members/${uid}`, profile(uid, patch), {
            timestamps: label === 'time' ? ['updatedAt'] : ['createdAt', 'updatedAt']
        }), 403);
    }
});

test('self profile changes cannot grant permissions or spoof timestamps', async () => {
    const path = `members/${ids.pending}`;
    expectStatus(await write(ids.pending, path, { displayName: '새 이름' }, { update: true, timestamps: ['updatedAt'] }), 200);
    expectStatus(await write(ids.pending, path, { isAdmin: true }, { update: true, timestamps: ['updatedAt'] }), 403);
    expectStatus(await write(ids.pending, path, { role: 'admin' }, { update: true, timestamps: ['updatedAt'] }), 403);
    expectStatus(await write(ids.pending, path, { displayName: 'stale', updatedAt: new Date('2000-01-01T00:00:00Z') }, { update: true }), 403);
});

test('only admins see pending applicants; approved directory queries remain usable', async () => {
    expectStatus(await request(`${base}/members/${ids.pending}`, ids.member), 403);
    expectStatus(await request(`${base}/members/${ids.pending}`, ids.pending), 200);
    expectStatus(await request(`${base}/members/${ids.pending}`, ids.admin), 200);
    expectStatus(await request(`${base}/members/${ids.other}`, ids.member), 200);
    expectStatus(await request(`${base}:runQuery`, ids.member, 'POST', {
        structuredQuery: { from: [{ collectionId: 'members' }], where: { fieldFilter: {
            field: { fieldPath: 'isMember' }, op: 'EQUAL', value: { booleanValue: true }
        } } }
    }), 200);
    expectStatus(await request(`${base}/members`, ids.member), 403);
});

test('chat enforces approved ownership, bounded text, URL scheme and server time', async () => {
    const message = { uid: ids.member, displayName: '부원', text: '안녕하세요', photoURL: '' };
    expectStatus(await write(ids.member, `messages/valid-${suffix}`, message, { timestamps: ['createdAt'] }), 200);
    const cases = [
        [ids.pending, { ...message, uid: ids.pending }], [ids.member, { ...message, uid: ids.other }],
        [ids.member, { ...message, text: 'x'.repeat(2001) }], [ids.member, { ...message, photoURL: 'javascript:void(0)' }]
    ];
    for (const [i, [uid, data]] of cases.entries()) {
        expectStatus(await write(uid, `messages/invalid-${i}-${suffix}`, data, { timestamps: ['createdAt'] }), 403);
    }
    expectStatus(await write(ids.member, `messages/forged-${suffix}`, { ...message, createdAt: new Date('2000-01-01T00:00:00Z') }), 403);
    expectStatus(await request(`${base}/messages/valid-${suffix}`, null), 403);
});

test('first attendance can be read and only today\'s canonical record can be created', async () => {
    const date = seoulDate();
    const path = `attendance/${ids.member}_${date}`;
    const record = { uid: ids.member, displayName: '부원', date };
    expectStatus(await request(`${base}/${path}`, ids.member), 404);
    expectStatus(await request(`${base}/${path}`, ids.other), 403);
    expectStatus(await write(ids.member, path, record, { timestamps: ['createdAt'] }), 200);
    expectStatus(await write(ids.member, `attendance/duplicate-${suffix}`, record, { timestamps: ['createdAt'] }), 403);
    expectStatus(await write(ids.member, `attendance/${ids.member}_2000-01-01`, { ...record, date: '2000-01-01' }, { timestamps: ['createdAt'] }), 403);
    expectStatus(await write(ids.other, `attendance/${ids.other}_${date}`, { ...record, uid: ids.other, createdAt: new Date('2000-01-01T00:00:00Z') }), 403);
    expectStatus(await write(ids.member, path, record, { update: true, timestamps: ['createdAt'] }), 403);
});

test('admins alone write announcements, opportunities and permission changes', async () => {
    for (const collection of ['announcements', 'opportunities']) {
        expectStatus(await write(ids.member, `${collection}/member-${suffix}`, { title: '금지' }), 403);
        expectStatus(await write(ids.admin, `${collection}/admin-${suffix}`, { title: '허용' }), 200);
    }
    expectStatus(await write(ids.admin, `members/${ids.pending}`, { isMember: true, role: 'member' }, { update: true, timestamps: ['updatedAt'] }), 200);
    expectStatus(await write(ids.admin, `members/${ids.other}`, { isMember: false, isAdmin: false, role: 'pending' }, { update: true, timestamps: ['updatedAt'] }), 200);
    expectStatus(await request(`${base}/messages/valid-${suffix}`, ids.other), 403);
});

test('an unverified password session cannot use existing member or admin permissions', async () => {
    for (const uid of [ids.member, ids.admin]) {
        const unverified = { uid, provider: 'password', verified: false };
        expectStatus(await request(`${base}/members/${uid}`, unverified), 403);
        expectStatus(await request(`${base}/members`, unverified), 403);
        expectStatus(await write(unverified, `members/${uid}`, { displayName: 'Unverified change' }, {
            update: true, timestamps: ['updatedAt']
        }), 403);
        expectStatus(await request(`${base}/messages/valid-${suffix}`, unverified), 403);
        expectStatus(await write(unverified, `messages/unverified-${uid}`, {
            uid, displayName: '부원', text: '금지', photoURL: ''
        }, { timestamps: ['createdAt'] }), 403);
        expectStatus(await request(`${base}/attendance/${uid}_${seoulDate()}`, unverified), 403);
        for (const collection of ['announcements', 'opportunities']) {
            expectStatus(await request(`${base}/${collection}/admin-${suffix}`, unverified), 403);
            expectStatus(await write(unverified, `${collection}/unverified-${uid}`, { title: '금지' }), 403);
        }
    }
});

test('unverified, missing or non-boolean verification claims cannot create pending members', async () => {
    for (const [index, verified] of [false, null, 'true'].entries()) {
        const uid = `unverified-signup-${index}-${suffix}`;
        expectStatus(await write({ uid, provider: 'password', verified }, `members/${uid}`, profile(uid), {
            timestamps: ['createdAt', 'updatedAt']
        }), 403);
        expectStatus(await request(`${base}/members/${uid}`, 'owner'), 404);
    }
});

test('verified password sessions keep the existing UID permissions and new users stay pending', async () => {
    const member = { uid: ids.member, provider: 'password', verified: true };
    const admin = { uid: ids.admin, provider: 'password', verified: true };
    expectStatus(await request(`${base}/members/${ids.member}`, member), 200);
    expectStatus(await write(member, `messages/verified-password-${suffix}`, {
        uid: ids.member, displayName: '기존 부원', text: '동일 UID', photoURL: ''
    }, { timestamps: ['createdAt'] }), 200);
    expectStatus(await write(admin, `opportunities/verified-password-${suffix}`, { title: '동일 관리자' }), 200);
    const uid = `verified-password-signup-${suffix}`, fresh = { uid, provider: 'password', verified: true };
    expectStatus(await write(fresh, `members/${uid}`, profile(uid), {
        timestamps: ['createdAt', 'updatedAt']
    }), 200);
    expectStatus(await request(`${base}/messages/valid-${suffix}`, fresh), 403);
    expectStatus(await write(fresh, `members/${uid}`, { isMember: true, isAdmin: true, role: 'admin' }, {
        update: true, timestamps: ['updatedAt']
    }), 403);
});
