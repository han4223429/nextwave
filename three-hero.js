// =============================================================================
// NextWave — Scroll-driven cinematic 3D hero (Three.js)
//   Apple/Samsung 제품 페이지처럼, 스크롤 진행도(p: 0→1)에 따라
//   "NEXTWAVE" 글자들이  완성 → 폭발/방황 → 재조립 으로 변합니다.
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
                opacity: 0.46
            });
            const pivot = new THREE.Group();
            pivot.add(new THREE.Mesh(geo, mat));
            pivot.userData = {
                w, mat,
                ex: { x: (rnd(i * 3 + 1) - 0.5) * 42, y: (rnd(i * 3 + 2) - 0.5) * 24, z: rnd(i * 3 + 3) * 18 - 5,
                      rx: (rnd(i + 10) - 0.5) * 14, ry: (rnd(i + 20) - 0.5) * 14, rz: (rnd(i + 30) - 0.5) * 14 },
                s1: 0.5 + rnd(i + 4) * 1.4, s2: 0.5 + rnd(i + 5) * 1.4, s3: 0.5 + rnd(i + 6) * 1.4,
                phase: i * 0.7, bx: 0, by: 0
            };
            group.add(pivot);
            letters.push(pivot);
        }

        const sparkGeo = new THREE.IcosahedronGeometry(0.08, 0);
        for (let i = 0; i < 48; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: palette[i % palette.length],
                transparent: true,
                opacity: 0.32
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
        if (reduce) { applyFrame(0, 0); renderer.render(scene, camera); }
    }

    // 캡션 페이드 (DOM)
    const caps = Array.prototype.slice.call(document.querySelectorAll('.hero-cap'));
    const scrollHint = document.getElementById('hero-scrollhint');
    const eyebrow = document.getElementById('hero-eyebrow');
    function updateCaptions(p) {
        const fade = 0.06;
        caps.forEach((c) => {
            const from = parseFloat(c.dataset.from), to = parseFloat(c.dataset.to);
            let o = 0;
            if (p >= from - fade && p <= to + fade) {
                const fadeIn = from <= 0 ? 1 : smooth(from - fade, from + fade, p);
                o = Math.min(fadeIn, 1 - smooth(to - fade, to + fade, p));
            }
            c.style.opacity = o;
            c.style.transform = 'translateY(' + ((1 - o) * 18) + 'px)';
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
        // explode bump: 0 (formed) → 1 (scattered) → 0 (reformed)
        const e = clamp(smooth(0.36, 0.60, p) - smooth(0.72, 0.94, p), 0, 1);
        const ambient = 0.35 + e * 0.85;
        for (let i = 0; i < letters.length; i++) {
            const l = letters[i], u = l.userData, g = u.ex;
            let px = lerp(u.bx, g.x, e);
            let py = lerp(u.by, g.y, e);
            let pz = lerp(-1.8, g.z, e);
            // 완성 상태에서도 배경처럼 천천히 떠 있고, 흩어진 동안 더 크게 움직임
            px += Math.sin(t * u.s1 + u.phase) * ambient * 0.82;
            py += Math.cos(t * u.s2 + u.phase * 1.3) * ambient * 0.72;
            l.position.set(px, py, pz);
            // 회전: 완성 상태엔 은은한 웨이브, 흩어지면 텀블링
            l.rotation.x = (1 - e) * Math.sin(t * 0.35 + i) * 0.08 + e * (t * u.s1 + g.rx);
            l.rotation.y = (1 - e) * Math.sin(t * 0.5 + i * 0.6) * 0.18 + e * (t * u.s2 + g.ry);
            l.rotation.z = (1 - e) * Math.sin(t * 0.28 + i * 0.4) * 0.05 + e * (g.rz + t * u.s3 * 0.5);
            if (u.mat) u.mat.opacity = lerp(0.34, 0.5, e);
        }
        for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i], u = s.userData;
            const a = t * u.speed + u.phase + p * Math.PI * 1.4;
            s.position.set(Math.cos(a) * u.radius, u.y + Math.sin(a * 1.7) * 1.6, u.z + Math.sin(a) * 1.2);
            s.rotation.x = t * u.speed * 2;
            s.rotation.y = t * u.speed * 1.4;
            if (u.mat) u.mat.opacity = 0.18 + e * 0.18 + Math.sin(a) * 0.04;
        }
        camera.position.z = baseZ + e * 5.5 + 1.8 - smooth(0.0, 0.36, p) * 0.4;
        group.position.y = -0.35 + Math.sin(t * 0.34) * 0.12;
        group.rotation.y = mx * 0.12 * (1 - e) + Math.sin(t * 0.18) * 0.08;
        group.rotation.x = my * 0.08 * (1 - e);
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
