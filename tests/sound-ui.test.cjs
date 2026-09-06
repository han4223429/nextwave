const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function target(extra = {}) {
    const listeners = new Map();
    return Object.assign({
        addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
        emit(type, event = {}) { return (listeners.get(type) || []).map(handler => handler(event)); },
    }, extra);
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness({ enabled = true, available = true, runningBeforeResolved = false } = {}) {
    const label = {}, attributes = {}, toast = { textContent: '', classList: { add() {}, remove() {} } };
    const button = target({ dataset: {}, querySelector: () => label,
        setAttribute(name, value) { attributes[name] = value; }, getAttribute(name) { return attributes[name]; },
    });
    const document = target({ hidden: false, readyState: 'complete', documentElement: { lang: 'ko', dataset: {} },
        querySelectorAll(selector) { return selector.startsWith('[data-sound-toggle]') ? [button] : []; },
        getElementById: id => id === 'sound-toast' ? toast : null,
    });
    let state = 'uninitialized', gain = 0, epoch = 0, pending = null;
    const requests = [], played = [], observers = [];
    const snapshot = () => ({ enabled, available, contextState: state, masterGain: gain,
        activeVoices: 0, lastCue: played.at(-1) || '', cueCount: played.length });
    const notify = () => observers.forEach(handler => handler(snapshot()));
    const audio = {
        get enabled() { return enabled; }, getState: snapshot,
        subscribe(handler) { observers.push(handler); handler(snapshot()); },
        setEnabled(value) { enabled = value; epoch++; pending = null; gain = 0; if (!enabled) state = 'suspended'; notify(); },
        stop() { epoch++; pending = null; gain = 0; state = 'suspended'; notify(); },
        unlock() {
            if (!enabled || document.hidden || !available) return Promise.resolve(false);
            if (gain > 0 && state === 'running') return Promise.resolve(true);
            if (pending) return pending;
            const requestEpoch = epoch;
            state = runningBeforeResolved ? 'running' : 'suspended';
            pending = new Promise(resolve => requests.push({ resolve(ready = true) {
                const valid = ready && requestEpoch === epoch && enabled && !document.hidden;
                if (valid) { state = 'running'; gain = 0.16; pending = null; notify(); }
                resolve(valid);
            } }));
            return pending;
        },
        play(kind) { if (!enabled || !gain || state !== 'running' || document.hidden) return false; played.push(kind); notify(); return true; },
    };
    // The engine registers its lifecycle handler before the UI is initialized.
    document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stop(); });
    const window = target({ NextWaveAudio: audio, innerHeight: 800 });
    vm.runInNewContext(fs.readFileSync(require.resolve('../sound-ui.js'), 'utf8'), {
        window, document, performance: { now: () => 2000 }, setTimeout: () => 1, clearTimeout() {},
    });
    return { window, document, audio, requests, played, label, attributes, toast, button,
        toggle: () => button.emit('click')[0], cue: kind => window.NextWaveFeedback(kind) };
}

test('initialization stays silent and unsupported audio has an accurate disabled control', () => {
    const h = harness(); assert.equal(h.requests.length, 0); assert.equal(h.played.length, 0);
    assert.equal(h.label.textContent, 'SOUND ON');
    const unsupported = harness({ available: false });
    assert.equal(unsupported.button.disabled, true); assert.equal(unsupported.label.textContent, 'SOUND —');
    assert.equal(unsupported.attributes['aria-pressed'], 'false');
});

test('the first keyboard ripple waits for unlock even if the context already reports running', async () => {
    const h = harness({ runningBeforeResolved: true });
    h.document.emit('keydown', { isTrusted: true, key: 'Enter', target: { closest: () => null } });
    h.document.emit('nw:labchange', { detail: { action: 'ripple' } });
    assert.equal(h.requests.length, 1); assert.deepEqual(h.played, []);
    h.requests[0].resolve(); await flush();
    assert.deepEqual(h.played, ['ripple']);
});

test('queued cues coalesce to the latest interaction without an audible backlog', async () => {
    const h = harness(); h.cue('tap'); h.cue('ripple'); h.cue('wave');
    assert.equal(h.requests.length, 1); h.requests[0].resolve(); await flush();
    assert.deepEqual(h.played, ['wave']);
});

test('a stale pre-hide unlock cannot consume a new visible-page cue', async () => {
    const h = harness(); h.cue('tap');
    h.document.hidden = true; h.document.emit('visibilitychange');
    h.document.hidden = false; h.document.emit('visibilitychange'); h.cue('ripple');
    assert.equal(h.requests.length, 2);
    h.requests[0].resolve(); await flush(); assert.deepEqual(h.played, []);
    h.requests[1].resolve(); await flush(); assert.deepEqual(h.played, ['ripple']);
});

test('muting cancels the queued cue and a late unlock cannot replay it', async () => {
    const h = harness(); h.cue('wave'); await h.toggle();
    h.requests[0].resolve(); await flush();
    assert.equal(h.audio.enabled, false); assert.deepEqual(h.played, []);
    assert.equal(h.label.textContent, 'SOUND OFF');
});

test('an old enable attempt cannot overwrite feedback for a newer successful toggle', async () => {
    const h = harness({ enabled: false });
    const first = h.toggle(); await h.toggle(); const latest = h.toggle();
    h.requests[1].resolve(); await latest;
    const latestMessage = h.toast.textContent;
    h.requests[0].resolve(); await first;
    assert.equal(h.toast.textContent, latestMessage);
    assert.deepEqual(h.played, ['chime']); assert.equal(h.label.textContent, 'SOUND ON');
});
