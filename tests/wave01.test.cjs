// WAVE 01 redesign: the boarding-pass maths, the recruitment clock, the cheat-code matcher, and the copy rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sanitizeName, ticketNumber, MAX_NAME } = require('../ticket.js');
const { countdownParts, recruitPhase, sequenceMatcher, KONAMI } = require('../extras.js');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('names are trimmed, stripped of control and invisible characters, and capped by characters not bytes', () => {
    assert.equal(sanitizeName('  김파도  '), '김파도');
    assert.equal(sanitizeName('a\u0000b​c‮d'), 'abcd');
    assert.equal(sanitizeName('a   \n\t b'), 'a b');
    assert.equal(sanitizeName(null), '');
    assert.equal(sanitizeName(undefined), '');
    assert.equal(sanitizeName(42), '42');
    const long = '파'.repeat(40);
    assert.equal([...sanitizeName(long)].length, MAX_NAME);
    assert.equal([...sanitizeName('🌊'.repeat(30))].length, MAX_NAME, 'emoji count as one character each');
});

test('a ticket number is stable for the same input and shaped NW-02-####', () => {
    assert.equal(ticketNumber('', 'dev'), 'NW-02-0000');
    const a = ticketNumber('김파도', 'dev');
    assert.match(a, /^NW-02-\d{4}$/);
    assert.equal(ticketNumber('김파도', 'dev'), a);
    assert.equal(ticketNumber('  김파도 ', 'dev'), a, 'whitespace does not change the number');
    assert.notEqual(ticketNumber('김파도', 'game'), a, 'the field is part of the number');
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(ticketNumber('member' + i, 'dev'));
    assert.ok(seen.size > 180, 'numbers spread out (' + seen.size + ' unique of 200)');
});

test('the countdown splits time into days, hours, minutes and seconds and stops at zero', () => {
    const now = Date.UTC(2026, 0, 1);
    assert.deepEqual(countdownParts(now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000, now), { done: false, days: 2, hours: 3, mins: 4, secs: 5 });
    assert.deepEqual(countdownParts(now + 999, now), { done: false, days: 0, hours: 0, mins: 0, secs: 1 }, 'a partial second still shows 1');
    assert.deepEqual(countdownParts(now, now), { done: true, days: 0, hours: 0, mins: 0, secs: 0 });
    assert.deepEqual(countdownParts(now - 5000, now), { done: true, days: 0, hours: 0, mins: 0, secs: 0 });
    assert.equal(countdownParts(NaN, now).done, true);
});

test('the recruitment phase comes from the configured dates and hides itself when they are missing or broken', () => {
    const now = Date.parse('2026-12-01T00:00:00+09:00');
    assert.deepEqual(recruitPhase('', '', now), { phase: 'none' });
    assert.deepEqual(recruitPhase('not a date', '', now), { phase: 'none' });
    assert.deepEqual(recruitPhase('2026-12-10T00:00:00+09:00', '2026-12-20T23:59:59+09:00', now), { phase: 'before', target: Date.parse('2026-12-10T00:00:00+09:00') });
    assert.deepEqual(recruitPhase('2026-11-20T00:00:00+09:00', '2026-12-20T23:59:59+09:00', now), { phase: 'open', target: Date.parse('2026-12-20T23:59:59+09:00') });
    assert.deepEqual(recruitPhase('2026-11-01T00:00:00+09:00', '2026-11-20T00:00:00+09:00', now), { phase: 'closed' });
    assert.deepEqual(recruitPhase('2026-11-01T00:00:00+09:00', '', now), { phase: 'open', target: null }, 'open with no end date');
    assert.deepEqual(recruitPhase('2026-12-20T00:00:00+09:00', '2026-12-10T00:00:00+09:00', now), { phase: 'none' }, 'end before start is ignored');
});

test('the cheat code matches only the full sequence and recovers from a wrong key', () => {
    const match = sequenceMatcher(KONAMI);
    const feed = keys => keys.map(key => match(key)).pop();
    assert.equal(feed(KONAMI.slice(0, -1)), false);
    assert.equal(match(KONAMI[KONAMI.length - 1]), true);
    assert.equal(feed(['ArrowUp', ...KONAMI]), true, 'an extra leading key still matches');
    assert.equal(feed(['x', 'ArrowUp', 'ArrowUp', 'x']), false);
    assert.equal(feed(KONAMI.map(key => key.length === 1 ? key.toUpperCase() : key)), true, 'letters are case-insensitive');
});

function loadI18n() {
    const context = {
        window: {}, navigator: { language: 'ko' }, localStorage: { getItem: () => null, setItem() {} },
        document: { addEventListener() {}, documentElement: {}, querySelectorAll: () => [], dispatchEvent() {} },
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    };
    vm.runInNewContext(read('i18n.js'), context);
    return context.window.I18N;
}

test('every placeholder and label key on the home page exists in both languages', () => {
    const home = read('index.html');
    const i18n = loadI18n();
    const keys = new Set([...home.matchAll(/data-i18n-(?:ph|aria)="([^"]+)"/g)].map(match => match[1]));
    ['w1.ticket.empty', 'w1.ticket.saved', 'w1.ticket.shared', 'w1.ticket.needName', 'w1.ticket.failed', 'w1.cd.before', 'w1.cd.open', 'w1.cmdk.placeholder', 'w1.cmdk.empty', 'w1.surge'].forEach(key => keys.add(key));
    for (const key of keys) {
        i18n.set('ko'); const ko = i18n.t(key);
        assert.notEqual(ko, key, 'ko is missing ' + key);
        i18n.set('en'); assert.notEqual(i18n.t(key), ko, 'en is missing ' + key);
    }
});

// Phrases that the research in docs/research-2026-11-26.md lists as machine-written tells.
const BANNED = ['—', '혁신', '여정', '함께 만들어가', '을 넘어', '를 넘어', '증명합니다', '다양한', '효과적', '패러다임', '를 통해', '을 통해', '에 있어서', '도전하세요', '경험하세요',
    'seamless', 'empower', 'unlock', 'cutting-edge', 'journey', 'delve', 'leverage', 'not just', 'elevate', 'next level'];
test('new copy avoids the phrases listed as AI tells', () => {
    const home = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const visible = home.replace(/<[^>]+>/g, ' ');
    const i18n = loadI18n();
    const dict = [];
    for (const lang of ['ko', 'en']) {
        i18n.set(lang);
        for (const key of [...read('i18n.js').matchAll(/"(w1\.[^"]+)"/g)].map(match => match[1])) dict.push(key + ' → ' + i18n.t(key));
    }
    for (const phrase of BANNED) {
        assert.equal(visible.toLowerCase().includes(phrase.toLowerCase()), false, 'index.html contains "' + phrase + '"');
        const hit = dict.find(line => line.toLowerCase().includes(phrase.toLowerCase()));
        assert.equal(hit, undefined, 'i18n contains "' + phrase + '": ' + hit);
    }
});

test('the hero scene reads its colors from tokens and cleans up after itself', () => {
    const scene = read('wave-scene.js');
    assert.equal(/#[0-9a-fA-F]{6}\b|0x[0-9a-fA-F]{6}/.test(scene), false, 'wave-scene.js hard-codes a color');
    assert.match(scene, /getPropertyValue\(/);
    assert.match(scene, /css\('--/);
    assert.match(scene, /dispose\(\)/);
    assert.match(scene, /prefers-reduced-motion/);
    assert.match(scene, /visibilitychange/);
});

test('only the track buttons act as track switches, not the panel that carries the current track', () => {
    const script = read('script.js');
    assert.equal(/querySelectorAll\('\[data-track\]'\)/.test(script), false, 'a bare [data-track] selector also matches .track-lab');
    assert.match(script, /\.track-selector \[data-track\]/);
});

test('on phones the field panel nearest the middle of the screen is the one that opens', () => {
    const { FIELDS, PORTAL, nearestToCenter } = require('../fields.js');
    assert.equal(FIELDS.length, 7);
    assert.equal(nearestToCenter([{ top: -300, bottom: -100 }, { top: 300, bottom: 364 }, { top: 380, bottom: 444 }], 844), 2);
    assert.equal(nearestToCenter([{ top: 900, bottom: 1000 }], 844), -1, 'nothing on screen, nothing opens');
    const home = read('index.html');
    for (const field of FIELDS) assert.match(home, new RegExp('data-field="' + field + '"'));
    for (const [field, category] of Object.entries(PORTAL)) assert.match(home, new RegExp('data-field="' + field + '"[\\s\\S]*?category=' + category));
});

test('the video band treats an empty clip path as no clip', () => {
    const extras = read('extras.js');
    assert.match(extras, /if \(typeof value !== 'string' \|\| !value\.trim\(\)\) return '';/);
    assert.match(read('index.html'), /<section id="reel"[^>]*hidden>/);
});
