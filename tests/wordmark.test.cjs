// Checks for the shared design system and the home hero: the wordmark math, the copy keys, and the token rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { waveWidth, crestWidth, MIN, MAX, REST } = require('../wordmark.js');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const home = read('index.html'), portal = read('portal.html'), system = read('site-system.css');

test('every letter stays inside the font\'s width axis', () => {
    for (let time = 0; time < 40; time += 0.013) for (let index = 0; index < 4; index++) {
        const width = waveWidth(time, index, 4, index);
        assert.ok(width >= MIN && width <= MAX, 'width ' + width + ' at ' + time);
    }
    assert.equal(crestWidth(0), MAX);
    assert.ok(crestWidth(6) - MIN < 0.01);
});

test('a line of letters keeps its total width while the wave passes', () => {
    for (const count of [4, 8]) for (let time = 0; time < 12; time += 0.07) {
        let total = 0;
        for (let index = 0; index < count; index++) total += waveWidth(time, index, count, 0.4);
        assert.ok(Math.abs(total - REST * count) < 1e-6, 'line of ' + count + ' drifts at ' + time);
    }
});

test('the hero wordmark is the logo lettering, hidden from assistive tech, beside a real heading', () => {
    const mark = home.match(/<p class="wordmark"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(mark, 'wordmark missing');
    assert.match(mark[0], /aria-hidden="true"/);
    assert.equal([...mark[1].matchAll(/<i>([A-Z])<\/i>/g)].map(match => match[1]).join(''), 'NEXTWAVE');
    assert.match(home, /<h1 id="hero-title"/);
});

test('the home page has copy in both languages for every key it uses', () => {
    const context = {
        window: {}, navigator: { language: 'ko' }, localStorage: { getItem: () => null, setItem() {} },
        document: { addEventListener() {}, documentElement: {}, querySelectorAll: () => [], dispatchEvent() {} },
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    };
    vm.runInNewContext(read('i18n.js'), context);
    const i18n = context.window.I18N;
    const keys = new Set([...home.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]));
    ['nx.motion.pause', 'nx.motion.play', 'act.dev.d', 'act.game.d', 'act.hack.d', 'act.mkt.d'].forEach(key => keys.add(key));
    const korean = new Map();
    i18n.set('ko');
    for (const key of keys) { korean.set(key, i18n.t(key)); assert.notEqual(korean.get(key), key, 'ko is missing ' + key); }
    // English falls back to Korean when a key is absent, so an identical value means a missing translation.
    i18n.set('en');
    for (const key of keys) assert.notEqual(i18n.t(key), korean.get(key), 'en is missing ' + key);
});

test('both pages load the shared system before their own stylesheet and share the header', () => {
    for (const [name, html, own] of [['index.html', home, 'styles.css'], ['portal.html', portal, 'portal.css']]) {
        const shared = html.indexOf('site-system.css'), page = html.indexOf(own);
        assert.ok(shared > 0 && page > shared, name + ' must load site-system.css first');
        assert.match(html, /class="nw-brand"[^>]*><span>NEXT<\/span><span class="nw-brand-wave">WAVE<\/span>/, name + ' brand lockup');
        for (const label of ['소개', '프로젝트', '공모전·지원사업', '참여 안내']) assert.ok(html.includes('>' + label + '</a>'), name + ' nav is missing ' + label);
        assert.equal(/↗|JetBrains|Space Grotesk|Pretendard/.test(html), false, name + ' still carries the old chrome');
    }
});

test('colors live in site-system.css as tokens, and every token in use is defined', () => {
    const defined = new Set([...system.matchAll(/(?:^|[\s;{])--([a-z0-9-]+)\s*:/g)].map(match => match[1]));
    for (const name of ['styles.css', 'portal.css', 'rescue-demo.css']) {
        const css = read(name);
        assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], name + ' has a hard-coded color');
        assert.equal(/rgba?\(/.test(css), false, name + ' has a hard-coded rgb color');
        const local = new Set([...css.matchAll(/(?:^|[\s;{])--([a-z0-9-]+)\s*:/g)].map(match => match[1]));
        for (const match of css.matchAll(/var\(--([a-z0-9-]+)/g)) assert.ok(defined.has(match[1]) || local.has(match[1]), name + ' uses undefined token --' + match[1]);
    }
    const rules = system.replace(/:root\s*\{[\s\S]*?\n\}/, '');
    assert.deepEqual(rules.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], 'site-system.css has a color outside :root');
});
