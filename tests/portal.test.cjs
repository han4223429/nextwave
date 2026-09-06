const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = readFileSync(path.join(root, 'portal.js'), 'utf8');
const html = readFileSync(path.join(root, 'portal.html'), 'utf8');

// Run the production functions in isolation: no Firebase credentials, browser, or writes.
// The boot call is replaced in memory only; production does not expose these internals.
function portalHarness(query = '') {
  const fixedNow = new Date('2026-09-06T12:00:00Z').valueOf();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  }
  const nodes = new Map();
  function getNode(id) {
    if (!nodes.has(id)) nodes.set(id, { children: [], hidden: false, value: '', open: false,
      replaceChildren(...children) { this.children = children; },
      removeAttribute() {}, setAttribute() {}, classList: { remove() {} } });
    return nodes.get(id);
  }
  const context = { Date: ClockDate, Intl, URL, URLSearchParams, console, setTimeout, clearTimeout,
    window: { location: { search: query } }, document: { getElementById: getNode } };
  vm.createContext(context);
  const instrumented = source.replace(/  init\(\);\n\}\)\(\);\s*$/, `
    globalThis.testPortal = { safeURL, seoulDate, deadlineDays, deadlineBadge, isClosed,
      dateObject, allOpportunities, listen, stopPrivateData, replaceChildrenKeepingFocus,
      setState: state => { publicSnapshot=state.publicSnapshot || null;
        currentProfile=state.currentProfile || null; manualOpportunities=state.manualOpportunities || []; },
      getFilter: () => currentFilter };
  })();`);
  assert.notEqual(instrumented, source, 'Test harness must replace the boot call');
  vm.runInContext(instrumented, context);
  return { api: context.testPortal, nodes, getNode, document: context.document };
}

test('deadline comparisons use the Korean calendar, including the UTC date boundary', () => {
  const { api } = portalHarness();
  assert.equal(api.seoulDate(new Date('2026-09-06T14:59:59Z')), '2026-09-06');
  assert.equal(api.seoulDate(new Date('2026-09-06T15:00:00Z')), '2026-09-07');
  assert.equal(api.deadlineDays('2026-09-06'), 0);
  assert.equal(api.deadlineBadge({ deadline: '2026-09-06' }).text, '오늘 마감');
  assert.equal(api.deadlineDays('2026-09-07'), 1);
  assert.equal(api.deadlineDays('2026-09-05'), -1);
});

test('unknown and invalid deadlines do not become an always-open offer or crash rendering', () => {
  const { api } = portalHarness();
  for (const value of [null, '', 'tomorrow', '2026-02-30', '2026-13-01']) {
    assert.equal(api.deadlineDays(value), null);
    assert.equal(api.deadlineBadge({ deadline: value }).text, '마감일 미확인');
  }
  assert.equal(api.dateObject({ toDate: 'malformed' }), null);
  assert.equal(api.dateObject('not-a-date'), null);
});

test('expired and explicitly archived opportunities stay out of the active list', () => {
  const { api } = portalHarness();
  assert.equal(api.isClosed({ deadline: '2026-09-05' }), true);
  assert.equal(api.isClosed({ status: 'archived', deadline: '2026-12-31' }), true);
  assert.equal(api.isClosed({ status: 'active', deadline: '2026-09-06' }), false);
  assert.equal(api.isClosed({ status: 'active', deadline: null }), false);
});

test('external link and avatar validation rejects executable, relative, and credential URLs', () => {
  const { api } = portalHarness();
  for (const url of ['javascript:alert(1)', 'data:text/html,payload', '//evil.example', '/relative', 'https://user:password@example.com/', 'x'.repeat(2049)]) assert.equal(api.safeURL(url), '');
  assert.equal(api.safeURL('http://example.com/', true), '');
  assert.equal(api.safeURL('https://example.com/avatar.png', true), 'https://example.com/avatar.png');
  assert.equal(api.safeURL('http://example.com/notice'), 'http://example.com/notice');
});

test('signed-out and pending visitors never receive member opportunity records', () => {
  const { api } = portalHarness();
  const publicSnapshot = { items: [{ id: 'auto_public', title: 'Public call' }] };
  const manualOpportunities = [{ id: 'private', title: 'Members only' }];
  for (const currentProfile of [null, { isMember: false }, { isMember: 'true' }]) {
    api.setState({ publicSnapshot, manualOpportunities, currentProfile });
    assert.deepEqual(Array.from(api.allOpportunities(), item => item.id), ['auto_public']);
  }
});

test('approved-member merging preserves source snapshot authority over stale crawler documents', () => {
  const { api } = portalHarness();
  api.setState({ currentProfile: { isMember: true }, publicSnapshot: { items: [{ id: 'auto_public', title: 'Fresh source' }] }, manualOpportunities: [
    { id: 'member_notice', title: 'Member-curated call' },
    { id: 'auto_public', title: 'Stale duplicate' },
    { id: 'crawler_legacy', title: 'Stale imported call', authorUid: 'crawler' },
    { id: 'managed_legacy', title: 'Stale imported call', managedBy: 'nextwave-crawler' }
  ] });
  const actual = api.allOpportunities();
  assert.deepEqual(Array.from(actual, item => item.id), ['auto_public', 'member_notice']);
  assert.equal(actual[0].title, 'Fresh source');
});

test('expired cached public imports disappear without removing member records or guessing unknown deadlines', () => {
  const { api } = portalHarness();
  const imported = { managedBy: 'nextwave-crawler', authorUid: 'crawler' };
  api.setState({ currentProfile: { isMember: true }, publicSnapshot: { items: [
    { ...imported, id: 'auto_expired', deadline: '2026-09-05' },
    { ...imported, id: 'auto_old_archive', status: 'archived', deadline: '2026-09-05' },
    { ...imported, id: 'auto_today', deadline: '2026-09-06' },
    { ...imported, id: 'auto_unknown', deadline: null },
    { ...imported, id: 'auto_invalid', deadline: '2026-02-30' }
  ] }, manualOpportunities: [
    { id: 'member_expired', authorUid: 'member', deadline: '2026-09-05' },
    { ...imported, id: 'auto_expired', deadline: '2026-09-05' }
  ] });
  assert.deepEqual(Array.from(api.allOpportunities(), item => item.id),
    ['auto_today', 'auto_unknown', 'auto_invalid', 'member_expired']);
});

test('unsubscribe and rights transitions invalidate already queued private-data callbacks', () => {
  const { api, getNode } = portalHarness();
  api.setState({ currentProfile: { isMember: true } });
  let callback, reads = 0, unsubscribed = 0;
  const query = { onSnapshot(onData) { callback = onData; return () => { unsubscribed++; }; } };
  api.listen('test-private', query, () => { reads++; });
  callback({}); assert.equal(reads, 1);
  getNode('chat-messages').children = ['private message'];
  api.stopPrivateData();
  callback({}); // A queued callback from the preceding rights generation.
  assert.equal(reads, 1);
  assert.equal(unsubscribed, 1);
  assert.deepEqual(getNode('chat-messages').children, []);
});

test('homepage category deep links preserve a valid category even when no records match', () => {
  for (const category of ['dev', 'gamedev', 'hackathon', 'marketing']) assert.equal(portalHarness('?category=' + category).api.getFilter(), category);
  assert.equal(portalHarness('?category=__proto__').api.getFilter(), 'all');
  assert.equal(portalHarness('?category=nonexistent').api.getFilter(), 'all');
});

test('portal keeps untrusted content out of HTML and inline JavaScript rendering sinks', () => {
  assert.equal(/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|setAttribute\(['"]on|onclick=/.test(source), false);
  assert.equal(/\son(?:click|error|load)\s*=/.test(html), false);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(match[1]), 'Missing DOM reference: ' + match[1]);
});


test('source and surviving card links retain keyboard focus when a periodic refresh replaces them', () => {
  const { api, document } = portalHarness();
  for (const key of ['source:kstartup', 'opportunity:auto_with_\"quotes', 'opportunities-more']) {
    const original = { dataset: { focusKey: key } };
    let focused = null;
    const replacement = { dataset: { focusKey: key }, focus(options) { focused = { node: this, preventScroll: options.preventScroll }; } };
    const unrelated = { dataset: { focusKey: 'another-item' }, focus() { assert.fail('Must not move focus to an unrelated item'); } };
    document.activeElement = original;
    const container = { children: [original], contains(node) { return this.children.includes(node); },
      replaceChildren(...children) { this.children = children; }, querySelectorAll() { return this.children; } };
    api.replaceChildrenKeepingFocus(container, unrelated, replacement);
    assert.equal(focused.node, replacement);
    assert.equal(focused.preventScroll, true);
  }
});
