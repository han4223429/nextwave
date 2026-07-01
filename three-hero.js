// =============================================================================
// NextWave — Scroll-driven cinematic 3D hero (Three.js)
//   Apple/Samsung 제품 페이지처럼, 스크롤 진행도(p: 0→1)에 따라
//   "NEXTWAVE" 전체 워드마크가 N/W 두 글자로 압축되고 의미 카피와 맞물립니다.
//   WebGL/폰트 실패 시 #hero-fallback(정적 히어로)로 자동 전환.
// =============================================================================
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stage = document.getElementById('hero-stage');
const mount = document.getElementById('hero-3d');
if (stage && mount) boot();

function fallback() {
    const fb = document.getElementById('hero-fallback');
    const pin = document.getElementById('hero-pin');
    if (stage) stage.style.height = 'auto';
    if (pin) pin.classList.add('hidden');
    if (fb) fb.classList.remove('hidden');
}

function boot() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 동작 최소화 설정 사용자는 380vh 스크롤 스토리 대신 정적 히어로를 바로 보여줌
    if (reduce) { fallback(); return; }
    const palette = [0x5b6cff, 0x8b5cf6, 0xff6b6b, 0x18c29c, 0xffb020, 0x4f7cff, 0xa855f7, 0xff8f6b];
    const WORD = 'NEXTWAVE';

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { fallback(); return; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const cv = renderer.domElement;
    Object.assign(cv.style, { width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
    mount.appendChild(cv);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    camera.position.set(0, 0, 18);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 1.7); dl.position.set(3, 6, 8); scene.add(dl);
    const l1 = new THREE.PointLight(0x5b6cff, 140, 120); l1.position.set(-8, 5, 7); scene.add(l1);
    const l2 = new THREE.PointLight(0xff6b6b, 110, 120); l2.position.set(8, -5, 7); scene.add(l2);
    const l3 = new THREE.PointLight(0x18c29c, 90, 120); l3.position.set(0, 6, -6); scene.add(l3);

    const group = new THREE.Group();
    scene.add(group);
    const letters = [];
    const sparks = [];
    let baseZ = 18;

    function rnd(s) { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

    const loader = new FontLoader();
    loader.load(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        function (font) { build(font); layout(); start(); },
        undefined,
        function () { fallback(); }
    );

    function build(font) {
        for (let i = 0; i < WORD.length; i++) {
            const geo = new TextGeometry(WORD[i], {
                font, size: 2.5, height: 0.7, curveSegments: 8,
                bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 3
            });
            geo.computeBoundingBox();
            const bb = geo.boundingBox;
            geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
            const w = bb.max.x - bb.min.x;
            const mat = new THREE.MeshStandardMaterial({
                color: palette[i % palette.length],
                metalness: 0.82,
                roughness: 0.2,
                envMapIntensity: 1.15,
                transparent: true,
                opacity: 0.94
            });
            const pivot = new THREE.Group();
            pivot.add(new THREE.Mesh(geo, mat));
            pivot.userData = {
                w, mat,
                ex: { x: (rnd(i * 3 + 1) - 0.5) * 42, y: (rnd(i * 3 + 2) - 0.5) * 24, z: rnd(i * 3 + 3) * 18 - 5,
                      rx: (rnd(i + 10) - 0.5) * 14, ry: (rnd(i + 20) - 0.5) * 14, rz: (rnd(i + 30) - 0.5) * 14 },
                s1: 0.5 + rnd(i + 4) * 1.4, s2: 0.5 + rnd(i + 5) * 1.4, s3: 0.5 + rnd(i + 6) * 1.4,
                phase: i * 0.7, bx: 0, by: 0, nw: null, bg: null
            };
            group.add(pivot);
            letters.push(pivot);
        }

        const sparkGeo = new THREE.IcosahedronGeometry(0.08, 0);
        for (let i = 0; i < 48; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: palette[i % palette.length],
                transparent: true,
                opacity: 0.04
            });
            const spark = new THREE.Mesh(sparkGeo, mat);
            spark.userData = {
                mat,
                radius: 6 + rnd(i + 70) * 11,
                speed: 0.12 + rnd(i + 80) * 0.24,
                phase: rnd(i + 90) * Math.PI * 2,
                y: (rnd(i + 100) - 0.5) * 10,
                z: -6 - rnd(i + 110) * 18,
                scale: 0.75 + rnd(i + 120) * 1.8
            };
            spark.scale.setScalar(spark.userData.scale);
            scene.add(spark);
            sparks.push(spark);
        }
    }

    function fitCamera(worldW, worldH) {
        const fov = camera.fov * Math.PI / 180;
        const distH = (worldH / 2) / Math.tan(fov / 2);
        const fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
        const distW = (worldW / 2) / Math.tan(fovH / 2);
        baseZ = Math.max(distH, distW) * 1.18 + 1.5;
    }

    function layout() {
        const rect = mount.getBoundingClientRect();
        const w = Math.max(rect.width, 1), h = Math.max(rect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (!letters.length) return;
        const gap = 0.55;
        const twoLines = w < 720;
        if (!twoLines) {
            let total = letters.reduce((s, l) => s + l.userData.w, 0) + gap * (letters.length - 1);
            let x = -total / 2;
            letters.forEach((l) => { x += l.userData.w / 2; l.userData.bx = x; l.userData.by = 0; x += l.userData.w / 2 + gap; });
            fitCamera(total, 3.4);
        } else {
            const rows = [letters.slice(0, 4), letters.slice(4)];
            let maxW = 0;
            rows.forEach((row, r) => {
                let total = row.reduce((s, l) => s + l.userData.w, 0) + gap * (row.length - 1);
                maxW = Math.max(maxW, total);
                let x = -total / 2;
                const y = r === 0 ? 2.0 : -2.0;
                row.forEach((l) => { x += l.userData.w / 2; l.userData.bx = x; l.userData.by = y; x += l.userData.w / 2 + gap; });
            });
            fitCamera(maxW, 8.0);
        }
        const nwSpread = twoLines ? 2.28 : 5.25;
        const nwY = twoLines ? 1.55 : 0.32;
        const anchorScale = twoLines ? 1.16 : 1.42;
        letters.forEach((l, i) => {
            const u = l.userData;
            if (i === 0 || i === 4) {
                u.nw = {
                    x: (i === 0 ? -1 : 1) * nwSpread,
                    y: nwY,
                    z: -0.72,
                    scale: anchorScale
                };
            } else {
                u.bg = {
                    x: (rnd(i + 210) - 0.5) * (twoLines ? 10 : 23),
                    y: (rnd(i + 230) - 0.5) * (twoLines ? 10 : 15),
                    z: -8 - rnd(i + 250) * 14,
                    scale: 0.34 + rnd(i + 270) * 0.34
                };
            }
        });
        if (reduce) { applyFrame(0, 0); renderer.render(scene, camera); }
    }

    // 캡션 페이드 (DOM)
    const caps = Array.prototype.slice.call(document.querySelectorAll('.hero-cap'));
    const scrollHint = document.getElementById('hero-scrollhint');
    const eyebrow = document.getElementById('hero-eyebrow');
    function updateCaptions(p) {
        const fade = 0.035;
        caps.forEach((c) => {
            const from = parseFloat(c.dataset.from), to = parseFloat(c.dataset.to);
            let o = 0;
            if (p >= from - fade && p <= to + fade) {
                const fadeIn = from <= 0 ? 1 : smooth(from - fade, from + fade, p);
                o = Math.min(fadeIn, 1 - smooth(to - fade, to + fade, p));
            }
            c.style.opacity = o;
            const introOffset = c.classList.contains('hero-cap-intro') ? Math.min(window.innerHeight * 0.24, 170) : 0;
            c.style.transform = 'translateY(' + (introOffset + ((1 - o) * 18)) + 'px)';
            c.classList.toggle('cap-on', o > 0.5);
        });
        if (scrollHint) scrollHint.style.opacity = String(1 - smooth(0.0, 0.08, p));
        if (eyebrow) eyebrow.style.opacity = String(1 - smooth(0.06, 0.22, p));
    }

    function progress() {
        const rect = stage.getBoundingClientRect();
        const total = stage.offsetHeight - window.innerHeight;
        if (total <= 0) return 0;
        return clamp(-rect.top / total, 0, 1);
    }

    let mx = 0, my = 0;
    window.addEventListener('mousemove', function (e) {
        mx = (e.clientX / window.innerWidth - 0.5);
        my = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    function applyFrame(p, t) {
        const split = smooth(0.12, 0.42, p);
        const story = smooth(0.34, 0.72, p);
        const finale = smooth(0.78, 0.98, p);
        const dark = clamp(smooth(0.17, 0.32, p) - smooth(0.72, 0.84, p), 0, 1);
        const ambient = 0.26 + split * 0.66;
        stage.style.setProperty('--hero-progress', String(p));
        stage.style.setProperty('--hero-dark', dark.toFixed(3));
        stage.style.setProperty('--hero-scrim', lerp(1, 0.24, dark).toFixed(3));
        stage.style.setProperty('--hero-mood-shift', lerp(-52, -28, dark).toFixed(2) + '%');
        stage.style.setProperty('--hero-mood-sweep', lerp(0, 0.72, dark).toFixed(3));
        stage.classList.toggle('is-dark', dark > 0.18);
        mount.style.opacity = String(lerp(1, 0.62, smooth(0.30, 0.78, p)));
        for (let i = 0; i < letters.length; i++) {
            const l = letters[i], u = l.userData, g = u.ex;
            const isAnchor = i === 0 || i === 4;
            if (isAnchor && u.nw) {
                let px = lerp(u.bx, u.nw.x, split);
                let py = lerp(u.by, u.nw.y, split);
                let pz = lerp(-0.55, u.nw.z, split);
                px += Math.sin(t * u.s1 + u.phase) * ambient * 0.28;
                py += Math.cos(t * u.s2 + u.phase * 1.3) * ambient * 0.2;
                l.position.set(px, py, pz);
                l.rotation.x = Math.sin(t * 0.34 + i) * lerp(0.06, 0.11, split);
                l.rotation.y = Math.sin(t * 0.46 + i * 0.6) * lerp(0.14, 0.24, split) + mx * 0.18 * (1 - finale);
                l.rotation.z = Math.sin(t * 0.28 + i * 0.4) * 0.045;
                l.scale.setScalar(lerp(1, u.nw.scale, split) * lerp(1, 0.92, finale));
                if (u.mat) u.mat.opacity = lerp(0.96, 0.76, split) * lerp(1, 0.84, finale);
            } else {
                const bg = u.bg || g;
                let px = lerp(u.bx, bg.x, split);
                let py = lerp(u.by, bg.y, split);
                let pz = lerp(-0.55, bg.z, split);
                px += Math.sin(t * u.s1 + u.phase) * ambient * lerp(0.2, 1.1, split);
                py += Math.cos(t * u.s2 + u.phase * 1.3) * ambient * lerp(0.16, 0.9, split);
                l.position.set(px, py, pz);
                l.rotation.x = (1 - split) * Math.sin(t * 0.35 + i) * 0.08 + split * (t * u.s1 + g.rx);
                l.rotation.y = (1 - split) * Math.sin(t * 0.5 + i * 0.6) * 0.16 + split * (t * u.s2 + g.ry);
                l.rotation.z = (1 - split) * Math.sin(t * 0.28 + i * 0.4) * 0.05 + split * (g.rz + t * u.s3 * 0.5);
                l.scale.setScalar(lerp(1, bg.scale || 0.45, split));
                if (u.mat) u.mat.opacity = lerp(0.92, 0.13, split) * lerp(1, 0.62, story);
            }
        }
        for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i], u = s.userData;
            const a = t * u.speed + u.phase + p * Math.PI * 1.6;
            s.position.set(Math.cos(a) * u.radius, u.y + Math.sin(a * 1.7) * 1.6, u.z + Math.sin(a) * 1.2);
            s.rotation.x = t * u.speed * 2;
            s.rotation.y = t * u.speed * 1.4;
            if (u.mat) u.mat.opacity = 0.04 + split * 0.22 + Math.sin(a) * 0.035;
        }
        camera.position.z = baseZ + 0.55 + split * 2.3 + story * 1.25;
        group.position.y = lerp(0.08, -0.72, story) + Math.sin(t * 0.34) * 0.08;
        group.rotation.y = mx * 0.16 * (1 - split * 0.35) + Math.sin(t * 0.18) * 0.06;
        group.rotation.x = my * 0.08 * (1 - split * 0.3);
        updateCaptions(p);
    }

    let running = false;
    const clock = new THREE.Clock();
    function loop() {
        if (!running) return;
        requestAnimationFrame(loop);
        applyFrame(progress(), clock.getElapsedTime());
        renderer.render(scene, camera);
    }
    function start() {
        if (reduce) { applyFrame(0, 0); updateCaptions(0); renderer.render(scene, camera); return; }
        const io = new IntersectionObserver(function (entries) {
            const vis = entries[0].isIntersecting;
            if (vis && !running) { running = true; loop(); }
            else if (!vis) { running = false; }
        }, { threshold: 0.01 });
        io.observe(stage);
    }

    let rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
}
