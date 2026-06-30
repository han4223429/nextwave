// =============================================================================
// NextWave — 3D wordmark hero (Three.js)
//   "NEXTWAVE"를 글자별 3D 메시로 만들고, 시간/스크롤/마우스에 따라
//   각 글자가 따로따로 회전합니다. WebGL 불가 시 그라데이션 텍스트로 폴백.
// =============================================================================
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const mount = document.getElementById('hero-3d');
if (mount) boot();

function boot() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const palette = [0x5b6cff, 0x8b5cf6, 0xff6b6b, 0x18c29c, 0xffb020, 0x5b6cff, 0x8b5cf6, 0xff6b6b];
    const WORD = 'NEXTWAVE';

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
        return; // WebGL 불가 → HTML 폴백 유지
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const cv = renderer.domElement;
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.display = 'block';
    cv.style.pointerEvents = 'none';
    mount.appendChild(cv);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0, 0, 16);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6); dir.position.set(3, 6, 8); scene.add(dir);
    const p1 = new THREE.PointLight(0x5b6cff, 120, 80); p1.position.set(-7, 4, 6); scene.add(p1);
    const p2 = new THREE.PointLight(0xff6b6b, 90, 80); p2.position.set(7, -4, 6); scene.add(p2);
    const p3 = new THREE.PointLight(0x18c29c, 70, 80); p3.position.set(0, 5, -5); scene.add(p3);

    const group = new THREE.Group();
    scene.add(group);
    const letters = [];

    const loader = new FontLoader();
    loader.load(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        function (font) {
            build(font);
            const fb = document.getElementById('hero-3d-fallback');
            if (fb) fb.style.display = 'none';
            layout();
            if (reduce) { renderer.render(scene, camera); }
            else { running = true; loop(); }
        },
        undefined,
        function () { /* 폰트 로드 실패 → 폴백 유지 */ }
    );

    function build(font) {
        for (let i = 0; i < WORD.length; i++) {
            const geo = new TextGeometry(WORD[i], {
                font, size: 2.4, height: 0.7, curveSegments: 8,
                bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 3
            });
            geo.computeBoundingBox();
            const bb = geo.boundingBox;
            const cx = (bb.max.x + bb.min.x) / 2;
            const cy = (bb.max.y + bb.min.y) / 2;
            geo.translate(-cx, -cy, 0);
            const w = bb.max.x - bb.min.x;
            const mat = new THREE.MeshStandardMaterial({
                color: palette[i % palette.length], metalness: 0.82, roughness: 0.18, envMapIntensity: 1.25
            });
            const mesh = new THREE.Mesh(geo, mat);
            const pivot = new THREE.Group();
            pivot.add(mesh);
            pivot.userData = { w, speed: 0.16 + (i % 4) * 0.05, dir: i % 2 ? 1 : -1, phase: i * 0.6, baseX: 0, baseY: 0 };
            group.add(pivot);
            letters.push(pivot);
        }
    }

    function fitCamera(worldW, worldH) {
        const fov = camera.fov * Math.PI / 180;
        const distH = (worldH / 2) / Math.tan(fov / 2);
        const fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
        const distW = (worldW / 2) / Math.tan(fovH / 2);
        camera.position.z = Math.max(distH, distW) * 1.12 + 1.5;
    }

    function layout() {
        const rect = mount.getBoundingClientRect();
        const w = Math.max(rect.width, 1), h = Math.max(rect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (!letters.length) return;

        const gap = 0.5;
        const twoLines = w < 640;
        if (!twoLines) {
            let total = letters.reduce((s, l) => s + l.userData.w, 0) + gap * (letters.length - 1);
            let x = -total / 2;
            letters.forEach((l) => { x += l.userData.w / 2; l.userData.baseX = x; l.userData.baseY = 0; x += l.userData.w / 2 + gap; });
            fitCamera(total, 3.2);
        } else {
            const rows = [letters.slice(0, 4), letters.slice(4)];
            let maxW = 0;
            rows.forEach((row, r) => {
                let total = row.reduce((s, l) => s + l.userData.w, 0) + gap * (row.length - 1);
                maxW = Math.max(maxW, total);
                let x = -total / 2;
                const y = r === 0 ? 1.7 : -1.7;
                row.forEach((l) => { x += l.userData.w / 2; l.userData.baseX = x; l.userData.baseY = y; x += l.userData.w / 2 + gap; });
            });
            fitCamera(maxW, 7.0);
        }
        letters.forEach((l) => { l.position.x = l.userData.baseX; l.position.y = l.userData.baseY; });
        if (reduce) renderer.render(scene, camera);
    }

    let mx = 0, my = 0;
    window.addEventListener('mousemove', function (e) {
        mx = (e.clientX / window.innerWidth - 0.5);
        my = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    let running = false;
    const io = new IntersectionObserver(function (entries) {
        const vis = entries[0].isIntersecting;
        if (vis && !running && !reduce && letters.length) { running = true; loop(); }
        else if (!vis) { running = false; }
    }, { threshold: 0.01 });
    io.observe(mount);

    const clock = new THREE.Clock();
    function loop() {
        if (!running) return;
        requestAnimationFrame(loop);
        const t = clock.getElapsedTime();
        const scroll = window.scrollY || 0;
        for (let i = 0; i < letters.length; i++) {
            const l = letters[i], u = l.userData;
            l.rotation.y = t * u.speed * u.dir + scroll * 0.0045 * u.dir;
            l.rotation.x = Math.sin(t * 0.6 + u.phase) * 0.12;
            l.position.y = u.baseY + Math.sin(t * 0.9 + u.phase) * 0.13;
        }
        group.rotation.y = mx * 0.28;
        group.rotation.x = my * 0.16;
        renderer.render(scene, camera);
    }

    let rt = null;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(layout, 120);
    });
}
