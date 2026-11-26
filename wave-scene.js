/* NextWave: the logo's wave as a 3D sculpture (three.js, already vendored for the RESCUE JET viewer).
   Strands follow the logo's two strokes: the long swell that rises to a crest, and the curl underneath it.
   Each strand is a ribbon with depth that breathes slowly. A light follows the pointer, and on the home page
   the camera drifts into the wave as you scroll. Colors come from the CSS tokens.
   It renders only while visible and moving; with reduced motion or the pause switch it holds one still frame. */
const THREE_URL = './assets/vendor/three/three.module.min.js';

// The logo's strokes, drawn in a 2D plane (x right, y up). Each strand is one of these, shifted and scaled.
const SWELL = [[-4.6, -1.3], [-3.0, -1.0], [-1.4, -0.35], [0.1, 0.55], [1.4, 1.25], [2.5, 1.5], [3.4, 1.38], [3.9, 1.08]];
const CURL = [[3.25, 1.12], [2.4, 1.02], [1.8, 0.62], [1.62, 0.05], [2.05, -0.42], [2.95, -0.6], [4.1, -0.42]];
const STRANDS = [
    { path: SWELL, color: '--navy', dy: -0.62, dx: -0.4, scale: 1.0, width: 0.55, phase: 0.0 },
    { path: SWELL, color: '--blue', dy: -0.3, dx: -0.2, scale: 1.0, width: 0.6, phase: 0.9 },
    { path: SWELL, color: '--blue', dy: 0.0, dx: 0.0, scale: 1.0, width: 0.5, phase: 1.7 },
    { path: SWELL, color: '--sky', dy: 0.26, dx: 0.12, scale: 0.98, width: 0.42, phase: 2.6 },
    { path: SWELL, color: '--crest', dy: 0.46, dx: 0.3, scale: 0.94, width: 0.16, phase: 3.3 },
    { path: CURL, color: '--aqua', dy: 0.0, dx: 0.0, scale: 1.0, width: 0.5, phase: 4.1 },
    { path: CURL, color: '--sky', dy: -0.2, dx: 0.18, scale: 0.9, width: 0.3, phase: 5.0 }
];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = value => value * value * (3 - 2 * value);

async function mount(host) {
    if (!host || host.dataset.waveReady) return;
    host.dataset.waveReady = 'pending';
    const compact = host.dataset.waveScene === 'compact';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const html = document.documentElement;
    const still = () => reduce.matches || html.dataset.motion === 'paused';

    let THREE;
    try { THREE = await import(THREE_URL); } catch (error) { host.dataset.waveReady = 'failed'; return; }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) { host.dataset.waveReady = 'failed'; return; }
    const weak = (navigator.hardwareConcurrency || 4) <= 2 || matchMedia('(max-width: 520px)').matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, weak ? 1.25 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(new THREE.Color(css('--abyss')), 0);
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(compact ? 30 : 34, 1, 0.1, 100);
    const wave = new THREE.Group();
    scene.add(wave);

    // Light: dim sea, a cold key from above, the curl's aqua from behind, and a sky light that follows the pointer.
    const ambient = new THREE.HemisphereLight(new THREE.Color(css('--sky-soft')), new THREE.Color(css('--abyss')), 0.55);
    const key = new THREE.DirectionalLight(new THREE.Color(css('--crest')), 2.4);
    key.position.set(-3, 6, 7);
    const rim = new THREE.DirectionalLight(new THREE.Color(css('--aqua')), 2.2);
    rim.position.set(5, -1, -6);
    const follow = new THREE.PointLight(new THREE.Color(css('--sky')), 26, 14, 1.6);
    follow.position.set(1.5, 1, 4);
    scene.add(ambient, key, rim, follow);

    const ALONG = weak ? 96 : 180, ACROSS = weak ? 6 : 9;
    const strands = STRANDS.map((strand, index) => {
        const curve = new THREE.CatmullRomCurve3(strand.path.map(([x, y]) => new THREE.Vector3(x * strand.scale + strand.dx, y * strand.scale + strand.dy, 0)), false, 'centripetal');
        const spine = curve.getSpacedPoints(ALONG - 1);
        const count = ALONG * ACROSS;
        const base = new Float32Array(count * 3);
        const meta = new Float32Array(count * 2);
        // Ribbon: across the strand it leans mostly into depth with a little in-plane tilt, tapered at both ends.
        for (let i = 0; i < ALONG; i++) {
            const u = i / (ALONG - 1);
            const prev = spine[Math.max(0, i - 1)], next = spine[Math.min(ALONG - 1, i + 1)];
            const tx = next.x - prev.x, ty = next.y - prev.y, tl = Math.hypot(tx, ty) || 1;
            const nx = -ty / tl, ny = tx / tl;
            const half = strand.width * Math.pow(Math.sin(Math.PI * u), 0.7) * (compact ? 0.9 : 1);
            for (let j = 0; j < ACROSS; j++) {
                const v = j / (ACROSS - 1) * 2 - 1;
                const at = (i * ACROSS + j) * 3;
                base[at] = spine[i].x + nx * v * half * 0.32;
                base[at + 1] = spine[i].y + ny * v * half * 0.32;
                base[at + 2] = v * half * 1.6 + (index - 3) * 0.12;
                meta[(i * ACROSS + j) * 2] = u;
                meta[(i * ACROSS + j) * 2 + 1] = v;
            }
        }
        const indices = [];
        for (let i = 0; i < ALONG - 1; i++) for (let j = 0; j < ACROSS - 1; j++) {
            const a = i * ACROSS + j, b = a + ACROSS;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(css(strand.color)), roughness: 0.32, metalness: 0.08,
            clearcoat: 1, clearcoatRoughness: 0.18, sheen: 0.4, sheenColor: new THREE.Color(css('--sky-soft')), side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        wave.add(mesh);
        return { strand, geometry, material, mesh, base, meta, total: indices.length };
    });

    // State
    let width = 1, height = 1, raf = 0, visible = true, last = 0, time = 0, grown = still() ? 1 : 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let scrolled = 0;

    function layout() {
        const box = host.getBoundingClientRect();
        width = Math.max(1, box.width); height = Math.max(1, box.height);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const narrow = width / height < 0.9;
                if (compact) { wave.position.set(0.2, -0.1, 0); wave.scale.setScalar(narrow ? 0.7 : 1.15); }
        // The hero holds only the name, so the wave is centred behind it and sized to the screen.
        else if (narrow) { wave.position.set(-0.2, 0.35, 0); wave.scale.setScalar(0.62); }
        else { wave.position.set(0.2, 0.1, 0); wave.scale.setScalar(clamp(width / height, 1, 1.9) * 0.68); }
        draw(0);
    }

    // Normals are the costliest part of a frame; light changes slowly, so they are refreshed every few frames.
    let frameCount = 0;
    const normalEvery = weak ? 4 : 2;
    function shape(delta) {
        time += delta;
        const refreshNormals = frameCount++ % normalEvery === 0 || delta === 0;
        strands.forEach(({ strand, geometry, base, meta, total }, index) => {
            const position = geometry.attributes.position.array;
            for (let n = 0; n < meta.length / 2; n++) {
                const u = meta[n * 2], v = meta[n * 2 + 1], at = n * 3;
                const swell = Math.sin(u * 5.2 - time * 0.9 + strand.phase) * 0.12 + Math.sin(u * 2.1 + time * 0.45 + index) * 0.07;
                position[at] = base[at] + Math.sin(time * 0.35 + u * 3 + strand.phase) * 0.04;
                position[at + 1] = base[at + 1] + swell * (0.35 + u);
                position[at + 2] = base[at + 2] + Math.sin(u * 4 + v * 1.3 + time * 0.7 + strand.phase) * 0.18 * u;
            }
            geometry.attributes.position.needsUpdate = true;
            if (refreshNormals) geometry.computeVertexNormals();
            // The opening: strands draw from tail to tip, each a little after the one behind it.
            const local = clamp(grown * 1.5 - index * 0.07, 0, 1);
            geometry.setDrawRange(0, Math.floor(smooth(local) * total / 6) * 6);
        });
    }

    function draw(delta) {
        pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-delta * 4));
        pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-delta * 4));
        wave.rotation.y = -0.38 + pointer.x * 0.22 + (compact ? 0 : scrolled * 0.35);
        wave.rotation.x = 0.16 - pointer.y * 0.12 + (compact ? 0 : scrolled * 0.2);
        wave.rotation.z = compact ? 0 : -scrolled * 0.12;
        follow.position.set(pointer.x * 5 + 1, -pointer.y * 3 + 1, 4);
        camera.position.set(0, 0, compact ? 12 : 11.5 - scrolled * 4.5);
        camera.lookAt(0, compact ? 0 : -scrolled * 0.6, 0);
        renderer.render(scene, camera);
    }

    function frame(now) {
        raf = 0;
        if (!visible || document.hidden) { last = 0; return; }
        // Phones draw at most ~30 times a second; the motion is slow enough that nobody sees the difference.
        if (weak && last && now - last < 32) { request(); return; }
        const delta = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (still()) { grown = 1; shape(0); draw(1); return; }
        grown = Math.min(1, grown + delta / 1.8);
        shape(delta);
        draw(delta);
        guard(delta);
        if (!tooSlow) request();
    }
    // Safety net for slow phones: after the opening, if frames keep taking longer than ~45 ms for two seconds,
    // drop the resolution once; if that is still too slow, hold a still frame (the pointer light still answers).
    let slowTime = 0, sampled = 0, downgraded = false, tooSlow = false;
    function guard(delta) {
        if (grown < 1 || tooSlow) return;
        sampled += delta;
        slowTime = delta > 0.045 ? slowTime + delta : Math.max(0, slowTime - delta * 0.5);
        if (sampled < 1 || slowTime < 2) return;
        slowTime = 0;
        if (!downgraded) { downgraded = true; renderer.setPixelRatio(1); layout(); }
        else { tooSlow = true; host.dataset.waveMode = 'still'; }
    }
    function request() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }

    // Inputs
    const zone = compact ? host : host.closest('.hero') || host;
    zone.addEventListener('pointermove', event => {
        const box = host.getBoundingClientRect();
        pointer.tx = clamp((event.clientX - box.left) / box.width * 2 - 1, -1, 1);
        pointer.ty = clamp((event.clientY - box.top) / box.height * 2 - 1, -1, 1);
        if (still()) { pointer.x = pointer.tx; pointer.y = pointer.ty; draw(1); }
        else if (tooSlow) draw(1); else request();
    }, { passive: true });
    zone.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; request(); });
    if (!compact) addEventListener('scroll', () => {
        scrolled = clamp(scrollY / Math.max(1, host.offsetHeight), 0, 1);
        renderer.domElement.style.opacity = String(1 - scrolled * 0.7);
        if (still()) draw(1); else request();
    }, { passive: true });
    new ResizeObserver(layout).observe(host);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) request(); }, { rootMargin: '80px' }).observe(host);
    document.addEventListener('visibilitychange', () => { last = 0; request(); });
    reduce.addEventListener('change', () => { last = 0; request(); });
    new MutationObserver(() => { last = 0; request(); }).observe(html, { attributes: true, attributeFilter: ['data-motion'] });

    renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        if (raf) cancelAnimationFrame(raf);
        raf = 0; visible = false;
        host.classList.remove('is-live');
    });
    addEventListener('pagehide', event => {
        if (event.persisted) return;
        if (raf) cancelAnimationFrame(raf);
        strands.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
        renderer.dispose();
    });

    layout();
    shape(0);
    host.classList.add('is-live');
    host.dataset.waveReady = 'live';
    request();
}

function start() { document.querySelectorAll('[data-wave-scene]').forEach(host => { mount(host); }); }
// The page's text and buttons come first; the 3D scene loads once the page has finished and the main thread is free.
function whenIdle() { if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 }); else setTimeout(start, 200); }
if (document.readyState === 'complete') whenIdle(); else addEventListener('load', whenIdle, { once: true });
