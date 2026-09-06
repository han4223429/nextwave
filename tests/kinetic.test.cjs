const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { surfacePoint, ringHeight, WAVE_COMPONENTS, rotate, cameraFor, projectPoint, makeWaterGrid, makeSphere, pickSurface, dropletPoint, pointerPosition, packRipples, MAX_RIPPLES, RIPPLE_LIFE } = require('../kinetic.js');

test('water is a substantial indexed 3D mesh within WebGL1 Uint16 limits', () => {
    const mesh = makeWaterGrid();
    assert.equal(mesh.positions.length / 3, 145 * 91);
    assert.equal(mesh.indices.length / 3, 25920);
    assert.ok(mesh.indices.every(index => index < mesh.positions.length / 3));
    assert.throws(() => makeWaterGrid(300, 300), RangeError);
    const sphere = makeSphere();
    for (let i = 0; i < sphere.positions.length; i += 3) assert.ok(Math.abs(Math.hypot(...sphere.positions.slice(i, i + 3)) - 1) < 1e-6);
});

test('all modes form an open ocean surface with real moving crests and no fixed cylindrical curl', () => {
    for (const mode of [0, 1, 2]) {
        let movement = 0;
        for (let row = 0; row <= 20; row++) for (let column = 0; column <= 30; column++) {
            const u = column / 30, v = row / 20, a = surfacePoint(u, v, 0, mode), b = surfacePoint(u, v, 2.5, mode);
            a.concat(b).forEach(value => assert.ok(Number.isFinite(value) && Math.abs(value) < 5));
            movement += Math.hypot(...a.map((value, index) => value - b[index]));
        }
        assert.ok(movement > 50, `mode ${mode} moves actual vertices`);
        for (let column = 0; column <= 12; column++) for (let row = 0; row < 20; row++) {
            const u = column / 12;
            assert.ok(surfacePoint(u, row / 20, 1.7, mode)[2] > surfacePoint(u, (row + 1) / 20, 1.7, mode)[2]);
        }
    }
});

test('Gerstner waves remain below overturning steepness and travel coherently with dispersion', () => {
    const strongestEnergy = 1.65;
    assert.ok(WAVE_COMPONENTS.reduce((total, wave) => total + wave.amplitude * wave.k * 0.32, 0) * strongestEnergy < 1);
    WAVE_COMPONENTS.slice(0, 4).forEach(wave => {
        assert.ok(Math.abs(Math.hypot(wave.x, wave.z) - 1) < 1e-12);
        assert.ok(wave.x * WAVE_COMPONENTS[0].x + wave.z * WAVE_COMPONENTS[0].z > 0.9);
    });
    assert.ok(WAVE_COMPONENTS[0].omega / WAVE_COMPONENTS[0].k > WAVE_COMPONENTS.at(-1).omega / WAVE_COMPONENTS.at(-1).k);
});

test('rotation preserves 3D lengths and perspective projects nearer geometry larger', () => {
    for (let index = 0; index < 60; index++) {
        const point = surfacePoint(index / 60, 0.6, 2);
        const result = rotate(point, index * 0.17, index * 0.04);
        assert.ok(Math.abs(Math.hypot(...point) - Math.hypot(...result)) < 1e-10);
    }
    const camera = cameraFor(1440, 850, 0, 0);
    assert.ok(projectPoint([1, 1, 2], camera).x > projectPoint([1, 1, -2], camera).x);
});

test('mobile ocean has substantial visible coverage while its edges can extend beyond the viewport', () => {
    for (const width of [360, 390, 430]) for (const mode of [0, 1, 2]) {
        const camera = cameraFor(width, 500);
        const points = [];
        for (let v = 0; v <= 20; v++) for (let u = 0; u <= 30; u++) {
            const point = projectPoint(surfacePoint(u / 30, v / 20, 0, mode), camera);
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.depth > 0);
            points.push(point);
        }
        const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
        const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
        assert.ok(Math.min(1, maxX) - Math.max(0, minX) > 0.90);
        assert.ok(Math.min(1, maxY) - Math.max(0, minY) > 0.50);
    }
});

test('perspective-correct picking hits the visible surface and rejects empty sky', () => {
    for (const [width, height] of [[1440, 850], [390, 500]]) {
        const camera = cameraFor(width, height);
        for (const [u, v] of [[0.7, 0.1], [0.5, 0.15]]) {
            const point = projectPoint(surfacePoint(u, v, 2, 0), camera);
            const hit = pickSurface(point.x, point.y, camera, 2, 0);
            assert.ok(hit && Math.abs(hit.u - u) < 0.01 && Math.abs(hit.v - v) < 0.01);
        }
        assert.equal(pickSurface(0.05, 0.95, camera, 0, 0), null);
    }
});

test('ripples displace geometry locally, then expire; droplets follow finite 3D trajectories', () => {
    const impact = { x: 0.65, y: 0.42, born: 0, strength: 1.5 };
    const disturbed = surfacePoint(0.7, 0.42, 0.4, 0, [impact]);
    const calm = surfacePoint(0.7, 0.42, 0.4, 0);
    assert.ok(Math.hypot(...disturbed.map((value, i) => value - calm[i])) > 0.005);
    assert.equal(ringHeight(0.7, 0.42, impact, RIPPLE_LIFE), 0);
    assert.ok(Math.abs(ringHeight(0.01, 0.01, impact, 0.4)) < 1e-8);
    for (let i = 0; i < 12; i++) for (const time of [0, 0.7, 3, 100]) {
        const drop = dropletPoint(i, time, 2);
        assert.ok(drop.every(Number.isFinite)); assert.ok(drop[3] >= 0 && drop[3] <= 0.08);
    }
});

test('pointer ripples respect the canvas bounds and bottom-up surface coordinates', () => {
    const box = { left: 50, top: 300, width: 390, height: 470 };
    assert.deepEqual(pointerPosition(245, 535, box), [0.5, 0.5]);
    assert.deepEqual(pointerPosition(50, 300, box), [0, 1]);
    assert.deepEqual(pointerPosition(440, 770, box), [1, 0]);
    assert.deepEqual(pointerPosition(-10, 900, box), [0, 0]);
});

test('ripple uploads expire old/future impacts and bound GPU work to the eight newest', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ x: i / 12, y: 0.5, born: 7 + i / 12, strength: 1 }));
    history.unshift({ x: 0.5, y: 0.5, born: 10 - RIPPLE_LIFE, strength: 1 });
    history.push({ x: 0.5, y: 0.5, born: 11, strength: 1 });
    const packed = packRipples(history, 10);
    assert.equal(packed.length, MAX_RIPPLES * 4);
    assert.ok(Math.abs(packed[0] - 4 / 12) < 1e-6);
    assert.ok(Math.abs(packed[30] - (7 + 11 / 12)) < 1e-6);
    const empty = packRipples(history, 100);
    for (let i = 0; i < MAX_RIPPLES; i++) assert.equal(empty[i * 4 + 2], -100);
});

// This harness runs the actual controller and its event listeners without a browser.
// The WebGL API is a stub: these checks do not claim GPU shader compilation or visual QA.
function controller({ reduced = false, webgl = true } = {}) {
    const callbacks = new Map(), uniformValues = new Map(), events = [];
    let nextFrame = 0, drawCount = 0, observerCallback = null;
    function target(extra = {}) {
        const listeners = new Map(), attrs = new Map();
        return Object.assign({
            dataset: {}, style: {}, hidden: false, disabled: false, children: [],
            append(child) { this.children.push(child); },
            addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
            emit(type, extraEvent = {}) { const event = { type, preventDefault() {}, ...extraEvent }; (listeners.get(type) || []).forEach(callback => callback(event)); },
            setAttribute(name, value) { attrs.set(name, value); },
            getAttribute(name) { return attrs.get(name); }, hasAttribute(name) { return attrs.has(name); },
            getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; },
        }, extra);
    }
    const gl = new Proxy({
        getShaderParameter() { return true; }, getProgramParameter() { return true; },
        getShaderPrecisionFormat() { return { precision: 23 }; },
        getUniformLocation(_program, name) { return name; }, getAttribLocation() { return 0; },
        uniform1f(name, value) { uniformValues.set(name, value); },
        uniform2f(name, x, y) { uniformValues.set(name, [x, y]); },
        uniform4f(name, ...values) { uniformValues.set(name, values); },
        uniform2fv(name, value) { uniformValues.set(name, Array.from(value)); },
        uniform4fv(name, value) { uniformValues.set(name, Array.from(value)); },
        drawElements() { drawCount++; },
    }, { get(object, key) { if (key in object) return object[key]; return /^[A-Z_\d]+$/.test(key) ? 1 : () => ({}); } });
    const ids = Object.fromEntries(['kinetic-canvas', 'kinetic-stage', 'motion-toggle', 'motion-label', 'lab-shuffle'].map(id => [id, target()]));
    const canvas = ids['kinetic-canvas'];
    canvas.getContext = () => webgl ? gl : null;
    const captures = new Set();
    canvas.setPointerCapture = id => captures.add(id);
    canvas.hasPointerCapture = id => captures.has(id);
    canvas.releasePointerCapture = id => captures.delete(id);
    const buttons = ['wave', 'orbit', 'burst'].map(mode => target({ dataset: { labMode: mode } }));
    const document = target({
        readyState: 'complete', hidden: false, baseURI: 'http://localhost:8000/', documentElement: { lang: 'ko', dataset: {} },
        createElement() { return target(); }, getElementById(id) { return ids[id]; }, querySelectorAll() { return buttons; }, dispatchEvent(event) { events.push(event); },
    });
    const media = target({ matches: reduced });
    const window = target({
        document, location: { origin: 'http://localhost:8000' }, devicePixelRatio: 2,
        matchMedia() { return media; },
        requestAnimationFrame(callback) { const id = ++nextFrame; callbacks.set(id, callback); return id; },
        cancelAnimationFrame(id) { callbacks.delete(id); },
        IntersectionObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
        ResizeObserver: class { observe() {} disconnect() {} },
    });
    vm.runInNewContext(fs.readFileSync(require.resolve('../kinetic.js'), 'utf8'), { window, URL, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
    return {
        ids, buttons, canvas, document, media, window, captures, uniformValues, events,
        frames: () => callbacks.size, draws: () => drawCount,
        step(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(now)); },
        visible(value) { observerCallback([{ isIntersecting: value }]); },
    };
}

test('reduced motion and manual pause stop continuous frames but preserve explicit interaction', () => {
    const h = controller({ reduced: true });
    assert.equal(h.document.documentElement.dataset.motion, 'paused');
    h.step(0); assert.equal(h.frames(), 0);
    h.canvas.emit('keydown', { key: 'Enter' }); h.step(16);
    assert.equal(h.frames(), 0);
    assert.ok(h.uniformValues.get('uRipples[0]')[2] > -1);
    h.ids['motion-toggle'].emit('click'); h.step(32); h.step(48);
    assert.equal(h.document.documentElement.dataset.motion, 'running'); assert.equal(h.frames(), 1);
    h.ids['motion-toggle'].emit('click'); h.step(64);
    assert.equal(h.frames(), 0); assert.equal(h.ids['motion-toggle'].getAttribute('aria-pressed'), 'false');
});

test('offscreen, hidden documents and page teardown cancel the renderer without time jumps', () => {
    const h = controller(); h.step(0); h.step(16);
    const time = h.uniformValues.get('uTime');
    h.visible(false); assert.equal(h.frames(), 0);
    h.visible(true); h.step(50000); assert.equal(h.uniformValues.get('uTime'), time);
    h.document.hidden = true; h.document.emit('visibilitychange'); assert.equal(h.frames(), 0);
    h.document.hidden = false; h.document.emit('visibilitychange'); assert.equal(h.frames(), 1);
    h.window.emit('pagehide', { persisted: true }); assert.equal(h.frames(), 0);
    h.window.emit('pageshow'); assert.equal(h.frames(), 1);
    h.window.emit('pagehide', { persisted: false }); h.window.emit('pageshow'); assert.equal(h.frames(), 0);
});

test('WebGL loss shows readable fallback, restores controls, and preserves the page motion toggle', () => {
    const h = controller();
    h.canvas.emit('webglcontextlost'); assert.equal(h.frames(), 0); assert.equal(h.canvas.hidden, true);
    assert.ok(h.buttons.every(button => button.disabled));
    h.ids['motion-toggle'].emit('click'); assert.equal(h.document.documentElement.dataset.motion, 'paused');
    h.canvas.emit('webglcontextrestored'); assert.equal(h.canvas.hidden, false); assert.ok(h.buttons.every(button => !button.disabled));
    h.step(0); assert.equal(h.frames(), 0);
    const fallback = controller({ webgl: false, reduced: true });
    assert.equal(fallback.ids['kinetic-stage'].dataset.renderer, 'static');
    assert.equal(fallback.ids['kinetic-stage'].children[0].hidden, false);
    assert.ok(fallback.ids['kinetic-stage'].children[0].textContent.includes('NEXTWAVE'));
    fallback.ids['motion-toggle'].emit('click'); assert.equal(fallback.document.documentElement.dataset.motion, 'running');
    assert.equal(fallback.frames(), 0);
});

test('only explicit splash actions emit ripple events for optional sound', () => {
    const h = controller(); h.step(0); h.step(16);
    assert.equal(h.events.length, 0);
    h.canvas.emit('keydown', { key: 'ArrowLeft' }); h.step(32);
    assert.equal(h.events.length, 0);
    h.canvas.emit('keydown', { key: 'Enter' });
    h.ids['lab-shuffle'].emit('click');
    assert.equal(h.events.length, 2);
    assert.ok(h.events.every(event => event.detail.action === 'ripple'));
    h.buttons[1].emit('click');
    assert.equal(h.events.at(-1).detail.mode, 'orbit');
    assert.equal(h.events.at(-1).detail.action, undefined);
});

test('touch vertical scrolling is not captured; horizontal drags manipulate water', () => {
    const h = controller();
    const touch = { isPrimary: true, pointerType: 'touch', pointerId: 7, clientX: 500, clientY: 300 };
    h.canvas.emit('pointerdown', touch);
    h.canvas.emit('pointermove', { ...touch, clientX: 503, clientY: 350 }); assert.equal(h.captures.size, 0);
    h.canvas.emit('pointercancel', touch);
    h.canvas.emit('pointerdown', touch);
    h.canvas.emit('pointermove', { ...touch, clientX: 530, clientY: 303 }); assert.equal(h.captures.size, 1);
    h.canvas.emit('pointerup', { ...touch, clientX: 530, clientY: 303 }); assert.equal(h.captures.size, 0);
});
