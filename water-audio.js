/* NextWave: short, locally synthesized water cues. No media, network, or ambient loop. */
(function (root) {
    'use strict';

    const STORAGE_KEY = 'nw:sound';
    const MASTER_GAIN = 0.16;
    const MAX_VOICES = 4;
    const COOLDOWNS = Object.freeze({ tap: 70, ripple: 140, wave: 800, chime: 260, fire: 75, hit: 110, dash: 200 });
    const mutedValue = value => ['off', 'false', '0', 'muted'].includes(value);

    function createWaterAudio(options = {}) {
        const Context = options.AudioContext;
        const storage = options.storage;
        const document = options.document;
        const events = options.eventTarget;
        const now = options.now || (() => typeof performance !== 'undefined' ? performance.now() : Date.now());
        const contextFactory = options.createContext || (typeof Context === 'function' ? () => new Context({ latencyHint: 'interactive' }) : null);
        let enabled = true, failed = false, unlocked = false, epoch = 0, pendingUnlock = null;
        let context = null, master = null, noiseBuffer = null, gateLevel = 0;
        let cueCount = 0, lastCue = '', lastAny = -Infinity;
        const voices = new Set(), subscribers = new Set(), lastByKind = new Map();
        const outputNodes = [];
        try { enabled = !mutedValue(storage?.getItem(STORAGE_KEY)); } catch (_) { /* Storage is optional. */ }

        function getState() {
            return Object.freeze({
                enabled,
                available: Boolean(contextFactory) && !failed,
                contextState: context?.state || 'uninitialized',
                // AudioParam.value can lag a scheduled zero while a context is suspended.
                // Report the last successfully requested gate, not the last rendered quantum.
                masterGain: gateLevel,
                activeVoices: voices.size,
                lastCue,
                cueCount,
            });
        }
        function notify() {
            const state = getState();
            subscribers.forEach(listener => { try { listener(state); } catch (_) { /* UI observers cannot interrupt audio cleanup. */ } });
        }
        function gate(value) {
            if (!master || !context) return;
            try { master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(value, context.currentTime); gateLevel = value; } catch (_) { /* Closed or interrupted context. */ }
        }
        function silenceContext() {
            if (!context || context.state === 'closed') return;
            try { Promise.resolve(context.suspend()).catch(() => {}).then(notify); } catch (_) { /* Already unavailable. */ }
        }
        function disposeVoice(voice, stopSources = false) {
            if (voice.disposed) return;
            voice.disposed = true;
            if (stopSources) {
                try { voice.output.gain.cancelScheduledValues(context.currentTime); voice.output.gain.setValueAtTime(0, context.currentTime); } catch (_) {}
            }
            voice.sources.forEach(source => {
                source.onended = null;
                if (stopSources) { try { source.stop(); } catch (_) {} }
            });
            voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
            voices.delete(voice); notify();
        }
        function stop() {
            epoch += 1; unlocked = false; pendingUnlock = null;
            gate(0);
            [...voices].forEach(voice => disposeVoice(voice, true));
            silenceContext(); notify();
        }
        function changeEnabled(value, persist) {
            const next = Boolean(value);
            if (persist) { try { storage?.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch (_) {} }
            if (next === enabled) { if (!next) stop(); else notify(); return; }
            enabled = next;
            // Enabling is a preference change. Only unlock(), called by a user gesture, resumes audio.
            if (!enabled) stop();
            else { epoch += 1; unlocked = false; pendingUnlock = null; gate(0); notify(); }
        }

        function makeNoise() {
            const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.8), context.sampleRate);
            const samples = buffer.getChannelData(0);
            let seed = 0x5f3759df, smooth = 0;
            for (let i = 0; i < samples.length; i++) {
                seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
                const white = (seed >>> 0) / 2147483648 - 1;
                smooth = smooth * 0.68 + white * 0.32;
                samples[i] = white * 0.28 + smooth * 0.44;
            }
            return buffer;
        }
        function initializeContext() {
            context = contextFactory();
            master = context.createGain(); master.gain.setValueAtTime(0, context.currentTime); gateLevel = 0;
            const highpass = context.createBiquadFilter(), lowpass = context.createBiquadFilter(), limiter = context.createDynamicsCompressor();
            highpass.type = 'highpass'; highpass.frequency.value = 95; highpass.Q.value = 0.5;
            lowpass.type = 'lowpass'; lowpass.frequency.value = 4300; lowpass.Q.value = 0.55;
            limiter.threshold.value = -22; limiter.knee.value = 10; limiter.ratio.value = 4;
            limiter.attack.value = 0.003; limiter.release.value = 0.12;
            master.connect(highpass); highpass.connect(lowpass); lowpass.connect(limiter); limiter.connect(context.destination);
            outputNodes.push(master, highpass, lowpass, limiter);
            noiseBuffer = makeNoise();
            context.addEventListener?.('statechange', () => {
                if (unlocked && context.state !== 'running') stop();
                else notify();
            });
        }
        function unlock() {
            if (!enabled || document?.hidden || !contextFactory || failed) return Promise.resolve(false);
            if (unlocked && context?.state === 'running') return Promise.resolve(true);
            if (pendingUnlock?.epoch === epoch) return pendingUnlock.promise;
            const requestEpoch = epoch;
            let current;
            try {
                if (!context || context.state === 'closed') {
                    outputNodes.splice(0).forEach(node => { try { node.disconnect(); } catch (_) {} });
                    initializeContext();
                }
                current = context;
                // Call resume synchronously within the caller's gesture, before awaiting anything.
                const resume = current.state === 'running' ? Promise.resolve() : current.resume();
                const promise = Promise.resolve(resume).then(() => {
                    if (requestEpoch !== epoch || !enabled || document?.hidden || current !== context) {
                        // A stale unlock must not cancel a newer successful user unlock.
                        if (!enabled || document?.hidden || (!unlocked && (!pendingUnlock || pendingUnlock.epoch === requestEpoch))) { gate(0); silenceContext(); }
                        return false;
                    }
                    if (current.state !== 'running') return false;
                    unlocked = true; gate(MASTER_GAIN); notify(); return true;
                }).catch(() => {
                    if (requestEpoch === epoch) { unlocked = false; gate(0); notify(); }
                    return false;
                }).finally(() => { if (pendingUnlock?.promise === promise) pendingUnlock = null; });
                pendingUnlock = { epoch: requestEpoch, promise };
                return promise;
            } catch (_) {
                // Constructor/graph failures are unavailable; a resume rejection remains retryable.
                if (!current) {
                    failed = true; gate(0);
                    outputNodes.splice(0).forEach(node => { try { node.disconnect(); } catch (_) {} });
                    try { Promise.resolve(context?.close()).catch(() => {}); } catch (_) {}
                }
                unlocked = false; notify(); return Promise.resolve(false);
            }
        }

        function keep(voice, node) { voice.nodes.push(node); return node; }
        function envelope(parameter, start, duration, peak, attack = 0.006) {
            parameter.setValueAtTime(0.0001, start);
            parameter.linearRampToValueAtTime(peak, start + Math.min(attack, duration * 0.3));
            parameter.exponentialRampToValueAtTime(0.0001, start + duration);
        }
        function scheduleSource(voice, source, start, duration) {
            voice.sources.push(source); voice.remaining += 1;
            source.onended = () => {
                if (voice.disposed) return;
                voice.remaining -= 1;
                if (!voice.remaining) disposeVoice(voice);
            };
            source.start(start); source.stop(start + duration + 0.008);
        }
        function oscillator(voice, start, duration, frequency, peak, pan = 0, crystal = false) {
            const source = keep(voice, context.createOscillator()), gain = keep(voice, context.createGain());
            source.type = 'sine';
            if (crystal) source.frequency.setValueAtTime(frequency, start);
            else {
                // A rising cavity resonance followed by a soft settling pitch makes a liquid plop.
                source.frequency.setValueAtTime(frequency * 0.68, start);
                source.frequency.exponentialRampToValueAtTime(frequency * 1.6, start + 0.019);
                source.frequency.exponentialRampToValueAtTime(frequency * 0.93, start + duration);
            }
            envelope(gain.gain, start, duration, peak);
            source.connect(gain);
            if (typeof context.createStereoPanner === 'function') {
                const panner = keep(voice, context.createStereoPanner()); panner.pan.value = pan;
                gain.connect(panner); panner.connect(voice.output);
            } else gain.connect(voice.output);
            scheduleSource(voice, source, start, duration);
        }
        function bubble(voice, start, frequency, peak, duration = 0.17, pan = 0) {
            oscillator(voice, start, duration, frequency, peak, pan);
            oscillator(voice, start + 0.003, duration * 0.42, frequency * 2.05, peak * 0.16, pan);
        }
        function waterNoise(voice, start, duration, peak, low = 650, high = 1700) {
            const source = keep(voice, context.createBufferSource()), filter = keep(voice, context.createBiquadFilter()), gain = keep(voice, context.createGain());
            source.buffer = noiseBuffer; source.loop = false;
            filter.type = 'bandpass'; filter.Q.value = 0.6;
            filter.frequency.setValueAtTime(low, start);
            filter.frequency.exponentialRampToValueAtTime(high, start + duration * 0.42);
            filter.frequency.exponentialRampToValueAtTime(low * 0.85, start + duration);
            envelope(gain.gain, start, duration, peak, duration * 0.18);
            source.connect(filter); filter.connect(gain); gain.connect(voice.output);
            scheduleSource(voice, source, start, duration);
        }
        function synthesize(voice, kind, time) {
            const variation = [0.96, 1.04, 1, 1.07][cueCount % 4];
            if (kind === 'ripple') {
                bubble(voice, time, 330 * variation, 0.16, 0.19, -0.18);
                bubble(voice, time + 0.055, 500 * variation, 0.115, 0.20, 0.06);
                bubble(voice, time + 0.12, 690 * variation, 0.065, 0.19, 0.20);
                waterNoise(voice, time + 0.005, 0.24, 0.07);
            } else if (kind === 'wave') {
                waterNoise(voice, time, 0.54, 0.19, 300, 1450);
                bubble(voice, time + 0.22, 310 * variation, 0.065, 0.15, -0.10);
                bubble(voice, time + 0.36, 470 * variation, 0.04, 0.14, 0.16);
            } else if (kind === 'chime') {
                // D and A are a clean pentatonic pair, with quiet glass-like upper partials.
                oscillator(voice, time, 0.28, 587.33, 0.12, -0.12, true);
                oscillator(voice, time, 0.16, 1409.59, 0.018, -0.12, true);
                oscillator(voice, time + 0.075, 0.31, 880, 0.09, 0.12, true);
                oscillator(voice, time + 0.075, 0.18, 2112, 0.013, 0.12, true);
            } else if (kind === 'dash') {
                waterNoise(voice, time, 0.23, 0.16, 540, 1850);
                bubble(voice, time + 0.04, 300 * variation, 0.075, 0.13, 0.10);
            } else if (kind === 'hit') {
                bubble(voice, time, 560 * variation, 0.17, 0.17, -0.06);
                bubble(voice, time + 0.045, 750 * variation, 0.075, 0.15, 0.12);
                waterNoise(voice, time, 0.055, 0.045, 850, 1600);
            } else if (kind === 'fire') {
                bubble(voice, time, 255 * variation, 0.145, 0.105);
                waterNoise(voice, time, 0.055, 0.04, 780, 1400);
            } else {
                bubble(voice, time, 375 * variation, 0.185, 0.145);
                waterNoise(voice, time, 0.038, 0.035, 1050, 1550);
            }
        }
        function play(requestedKind = 'tap') {
            if (!enabled || !unlocked || document?.hidden || context?.state !== 'running') return false;
            const kind = Object.hasOwn(COOLDOWNS, requestedKind) ? requestedKind : 'tap';
            const clock = now();
            if (clock - lastAny < 35 || clock - (lastByKind.get(kind) ?? -Infinity) < COOLDOWNS[kind]) return false;
            let voice;
            try {
                if (voices.size >= MAX_VOICES) disposeVoice(voices.values().next().value, true);
                const output = context.createGain(); output.gain.value = 0.9; output.connect(master);
                voice = { output, sources: [], nodes: [output], remaining: 0, disposed: false };
                voices.add(voice);
                synthesize(voice, kind, context.currentTime + 0.004);
                lastAny = clock; lastByKind.set(kind, clock); lastCue = kind; cueCount += 1;
                notify(); return true;
            } catch (_) {
                if (voice) disposeVoice(voice, true);
                return false;
            }
        }

        document?.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
        events?.addEventListener('pagehide', stop);
        events?.addEventListener('storage', event => { if (event.key === STORAGE_KEY) changeEnabled(!mutedValue(event.newValue), false); });
        return Object.freeze({
            get enabled() { return enabled; },
            get available() { return Boolean(contextFactory) && !failed; },
            unlock,
            setEnabled(value) { changeEnabled(value, true); },
            play,
            stop,
            getState,
            subscribe(listener) {
                if (typeof listener !== 'function') return () => {};
                subscribers.add(listener); try { listener(getState()); } catch (_) {}
                return () => subscribers.delete(listener);
            },
        });
    }

    if (typeof module === 'object' && module.exports) { module.exports = { createWaterAudio, STORAGE_KEY, MASTER_GAIN, MAX_VOICES, COOLDOWNS }; return; }
    let storage;
    try { storage = root.localStorage; } catch (_) {}
    if (!root.NextWaveAudio) root.NextWaveAudio = createWaterAudio({ AudioContext: root.AudioContext || root.webkitAudioContext, storage, document: root.document, eventTarget: root });
})(typeof window === 'undefined' ? globalThis : window);
