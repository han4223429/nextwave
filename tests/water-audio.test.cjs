const assert = require('node:assert/strict');
const test = require('node:test');
const { createWaterAudio, STORAGE_KEY, MASTER_GAIN, MAX_VOICES } = require('../water-audio.js');

function eventTarget(extra = {}) {
    const listeners = new Map();
    return Object.assign({
        addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
        emit(type, event = {}) { (listeners.get(type) || []).forEach(listener => listener(event)); },
    }, extra);
}
class Parameter {
    constructor() { this.current = 0; this.operations = []; }
    get value() { return this.current; }
    set value(value) { this.current = value; this.operations.push({ type: 'value', value }); }
    setValueAtTime(value, time) { this.current = value; this.operations.push({ type: 'set', value, time }); }
    linearRampToValueAtTime(value, time) { this.operations.push({ type: 'linear', value, time }); }
    exponentialRampToValueAtTime(value, time) { this.operations.push({ type: 'exponential', value, time }); }
    cancelScheduledValues(time) { this.operations.push({ type: 'cancel', time }); }
}
class AudioNode {
    constructor(kind) {
        this.kind = kind; this.disconnected = false; this.connections = [];
        for (const name of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release', 'pan']) this[name] = new Parameter();
        this.startTimes = []; this.stopTimes = [];
    }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; this.connections = []; }
    start(time) { this.startTimes.push(time); }
    stop(time) { this.stopTimes.push(time); }
    finish() { this.onended?.(); }
}

function harness({ deferred = false, rejectResume = 0, noContext = false, constructorError = false, stored = null, blockedStorage = false } = {}) {
    const contexts = [], document = eventTarget({ hidden: false }), events = eventTarget();
    let clock = 0, storageValue = stored, writes = 0;
    const storage = {
        getItem(key) { assert.equal(key, STORAGE_KEY); if (blockedStorage) throw new Error('Storage blocked'); return storageValue; },
        setItem(key, value) { assert.equal(key, STORAGE_KEY); if (blockedStorage) throw new Error('Storage blocked'); storageValue = value; writes++; },
    };
    class Context {
        constructor() {
            if (constructorError) throw new Error('Audio unavailable');
            Object.assign(this, eventTarget());
            this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 24000;
            this.nodes = []; this.buffers = []; this.resumeCalls = 0; this.suspendCalls = 0; this.requests = [];
            this.destination = new AudioNode('destination'); contexts.push(this);
        }
        resume() {
            this.resumeCalls++;
            if (rejectResume-- > 0) return Promise.reject(new Error('Gesture required'));
            if (!deferred) { this.state = 'running'; this.emit('statechange'); return Promise.resolve(); }
            return new Promise((resolve, reject) => this.requests.push({ resolve: () => { this.state = 'running'; this.emit('statechange'); resolve(); }, reject }));
        }
        suspend() { this.suspendCalls++; this.state = 'suspended'; this.emit('statechange'); return Promise.resolve(); }
        close() { this.state = 'closed'; this.emit('statechange'); return Promise.resolve(); }
        make(kind) {
            if (this.failAt === this.nodes.length + 1) throw new Error('Node allocation failed');
            const node = new AudioNode(kind); this.nodes.push(node); return node;
        }
        createGain() { return this.make('gain'); }
        createBiquadFilter() { return this.make('filter'); }
        createDynamicsCompressor() { return this.make('compressor'); }
        createOscillator() { return this.make('oscillator'); }
        createBufferSource() { return this.make('noise'); }
        createStereoPanner() { return this.make('panner'); }
        createBuffer(channels, length, sampleRate) {
            const data = new Float32Array(length), buffer = { channels, length, sampleRate, getChannelData: () => data };
            this.buffers.push(buffer); return buffer;
        }
    }
    const audio = createWaterAudio({ AudioContext: noContext ? undefined : Context, storage, document, eventTarget: events, now: () => clock });
    return { audio, contexts, document, events, setTime(value) { clock = value; }, stored: () => storageValue, writes: () => writes };
}

test('default sound preference is on, but no context or cue starts before unlock', async () => {
    const h = harness();
    assert.equal(h.audio.enabled, true); assert.equal(h.audio.available, true);
    assert.equal(h.audio.play('tap'), false); h.audio.setEnabled(true);
    assert.equal(h.contexts.length, 0);
    assert.deepEqual(h.audio.getState(), { enabled: true, available: true, contextState: 'uninitialized', masterGain: 0, activeVoices: 0, lastCue: '', cueCount: 0 });
    assert.equal(await h.audio.unlock(), true);
    assert.equal(h.contexts.length, 1); assert.equal(h.audio.getState().masterGain, MASTER_GAIN);
});

test('stored mute survives visits and unavailable storage does not break local controls', async () => {
    const muted = harness({ stored: 'off' });
    assert.equal(muted.audio.enabled, false); assert.equal(await muted.audio.unlock(), false);
    assert.equal(muted.contexts.length, 0);
    muted.audio.setEnabled(true); assert.equal(muted.stored(), 'on'); assert.equal(muted.contexts.length, 0);
    const local = harness({ blockedStorage: true });
    assert.equal(local.audio.enabled, true); local.audio.setEnabled(false); assert.equal(local.audio.enabled, false);
});

test('mute immediately zeros the output and cancels every active or future source', async () => {
    const h = harness(); await h.audio.unlock(); assert.equal(h.audio.play('wave'), true);
    const context = h.contexts[0], sources = context.nodes.filter(node => ['oscillator', 'noise'].includes(node.kind));
    assert.ok(sources.some(source => source.startTimes[0] > 0.2));
    h.audio.setEnabled(false);
    assert.equal(h.audio.getState().masterGain, 0); assert.equal(h.audio.getState().activeVoices, 0);
    assert.equal(context.state, 'suspended'); assert.equal(h.stored(), 'off');
    assert.ok(sources.every(source => source.stopTimes.includes(undefined) && source.disconnected && source.onended === null));
    assert.equal(h.audio.play('tap'), false);
});

test('hidden pages stop and suspend; becoming visible never resumes without a gesture', async () => {
    const h = harness(); await h.audio.unlock(); h.audio.play('ripple');
    h.document.hidden = true; h.document.emit('visibilitychange');
    assert.equal(h.audio.enabled, true); assert.equal(h.audio.getState().activeVoices, 0);
    assert.equal(h.audio.getState().masterGain, 0); assert.equal(h.contexts[0].state, 'suspended');
    assert.equal(await h.audio.unlock(), false);
    h.document.hidden = false; h.document.emit('visibilitychange');
    assert.equal(h.audio.play('tap'), false); assert.equal(h.contexts[0].resumeCalls, 1);
    assert.equal(await h.audio.unlock(), true);
    h.setTime(1000); assert.equal(h.audio.play('tap'), true);
    h.events.emit('pagehide'); assert.equal(h.audio.getState().activeVoices, 0); assert.equal(h.audio.enabled, true);
});

test('mute metadata reports the requested zero when AudioParam still exposes a past render quantum', async () => {
    const h = harness(); await h.audio.unlock();
    const master = h.contexts[0].nodes[0];
    Object.defineProperty(master.gain, 'value', { get: () => MASTER_GAIN });
    h.audio.setEnabled(false);
    assert.equal(master.gain.value, MASTER_GAIN);
    assert.equal(master.gain.operations.at(-1).value, 0);
    assert.equal(h.audio.getState().masterGain, 0);
    assert.equal(h.audio.getState().contextState, 'suspended');
});

test('a late resume cannot undo mute or visibility suspension', async () => {
    for (const reason of ['mute', 'hidden']) {
        const h = harness({ deferred: true }), pending = h.audio.unlock(), context = h.contexts[0];
        if (reason === 'mute') h.audio.setEnabled(false);
        else { h.document.hidden = true; h.document.emit('visibilitychange'); }
        context.requests[0].resolve(); assert.equal(await pending, false);
        assert.equal(h.audio.getState().masterGain, 0); assert.equal(context.state, 'suspended');
        assert.equal(h.audio.play('ripple'), false); assert.equal(h.audio.getState().cueCount, 0);
    }
});

test('a stale unlock cannot suspend a newer successful user unlock', async () => {
    const h = harness({ deferred: true }), first = h.audio.unlock(), context = h.contexts[0];
    h.audio.setEnabled(false); h.audio.setEnabled(true);
    const second = h.audio.unlock(); assert.equal(context.requests.length, 2);
    context.requests[1].resolve(); assert.equal(await second, true);
    context.requests[0].resolve(); assert.equal(await first, false);
    assert.equal(context.state, 'running'); assert.equal(h.audio.getState().masterGain, MASTER_GAIN);
    assert.equal(h.audio.play('tap'), true);
});

test('resume rejection is retryable and constructor failure is safely unavailable', async () => {
    const retry = harness({ rejectResume: 1 });
    assert.equal(await retry.audio.unlock(), false); assert.equal(retry.audio.available, true);
    assert.equal(retry.audio.getState().masterGain, 0); assert.equal(await retry.audio.unlock(), true);
    for (const options of [{ noContext: true }, { constructorError: true }]) {
        const failed = harness(options); assert.equal(await failed.audio.unlock(), false);
        assert.equal(failed.audio.available, false); assert.equal(failed.audio.play('wave'), false);
    }
});

test('wave/tap cooldowns prevent rapid repetition and polyphony evicts the oldest cue', async () => {
    const h = harness(); await h.audio.unlock();
    assert.equal(h.audio.play('wave'), true); h.setTime(799); assert.equal(h.audio.play('wave'), false);
    h.setTime(800); assert.equal(h.audio.play('wave'), true);
    h.setTime(900); assert.equal(h.audio.play('tap'), true); h.setTime(969); assert.equal(h.audio.play('tap'), false);
    h.setTime(970); assert.equal(h.audio.play('tap'), true);
    const firstSource = h.contexts[0].nodes.find(node => node.kind === 'noise');
    h.setTime(1100); assert.equal(h.audio.play('ripple'), true);
    assert.equal(h.audio.getState().activeVoices, MAX_VOICES); assert.ok(firstSource.stopTimes.includes(undefined));
    assert.equal(h.audio.getState().cueCount, 5);
});

test('onended disconnects the complete voice and node-allocation errors clean partial graphs', async () => {
    const h = harness(); await h.audio.unlock(); const context = h.contexts[0], globalCount = context.nodes.length;
    h.audio.play('ripple');
    const voiceNodes = context.nodes.slice(globalCount), sources = voiceNodes.filter(node => ['oscillator', 'noise'].includes(node.kind));
    assert.equal(sources.length, 7);
    sources.forEach(source => source.finish());
    assert.equal(h.audio.getState().activeVoices, 0); assert.ok(voiceNodes.every(node => node.disconnected));
    assert.ok(sources.every(source => source.onended === null));
    const beforeFailure = context.nodes.length;
    context.failAt = beforeFailure + 8; h.setTime(1000);
    assert.equal(h.audio.play('ripple'), false); assert.equal(h.audio.getState().activeVoices, 0);
    assert.ok(context.nodes.slice(beforeFailure).every(node => node.disconnected));
});

test('all cues use short, bounded envelopes, a low master gain and one non-looping noise buffer', async () => {
    const h = harness(); await h.audio.unlock(); const context = h.contexts[0];
    for (const [index, kind] of ['tap', 'ripple', 'wave', 'chime', 'fire', 'hit', 'dash'].entries()) {
        h.setTime(index * 1000); assert.equal(h.audio.play(kind), true);
        assert.ok(h.audio.getState().activeVoices <= MAX_VOICES);
    }
    assert.equal(context.buffers.length, 1);
    const buffer = context.buffers[0]; assert.ok(buffer.getChannelData(0).every(value => Number.isFinite(value) && Math.abs(value) <= 0.72));
    assert.ok(context.nodes.filter(node => node.kind === 'noise').every(source => source.buffer === buffer && source.loop === false));
    const sources = context.nodes.filter(node => ['oscillator', 'noise'].includes(node.kind));
    sources.forEach(source => {
        assert.equal(source.startTimes.length, 1);
        const scheduledStop = source.stopTimes.find(time => typeof time === 'number');
        assert.ok(scheduledStop > source.startTimes[0] && scheduledStop - source.startTimes[0] < 0.60);
        if (source.kind === 'oscillator') source.frequency.operations.forEach(operation => { if ('value' in operation) assert.ok(operation.value > 100 && operation.value < 4300); });
    });
    context.nodes.filter(node => node.kind === 'gain').forEach(node => node.gain.operations.forEach(operation => {
        if ('value' in operation) assert.ok(operation.value >= 0 && operation.value <= 0.9);
    }));
    assert.equal(h.audio.getState().masterGain, 0.16);
});

test('safe state subscriptions and storage events keep the shared sound preference in sync', async () => {
    const h = harness(), seen = [];
    const unsubscribe = h.audio.subscribe(state => seen.push(state));
    h.audio.subscribe(() => { throw new Error('Broken UI observer'); });
    await h.audio.unlock(); h.audio.play('chime');
    assert.ok(Object.isFrozen(seen.at(-1))); assert.equal(seen.at(-1).lastCue, 'chime');
    assert.equal(seen.at(-1).cueCount, 1);
    h.events.emit('storage', { key: STORAGE_KEY, newValue: 'off' });
    assert.equal(h.audio.enabled, false); assert.equal(h.audio.getState().masterGain, 0); assert.equal(h.writes(), 0);
    const count = seen.length; unsubscribe(); h.audio.setEnabled(true); assert.equal(seen.length, count);
});
