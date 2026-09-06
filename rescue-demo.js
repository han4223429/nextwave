/* Adapted from https://han4223429.github.io/portfolio/rescue-viewer.js.
 * Live source and adjacent owner checkout matched on 2026-09-06.
 * Model, camera, materials, lighting, propulsion and exploded-view behavior are preserved.
 * Integration changes: NextWave tab, bilingual labels and global manual motion pause.
 * Presentation reconstruction from the original image, not a CAD/engineering model.
 */
(function () {
    'use strict';
    function initializeRescue() {
/* On-demand web visualization. This is not a dimensional or engineering model. */
const figure = document.getElementById('rescueFigure');
if (figure) {
    const root = document.documentElement;
    const work = document.getElementById('rescue-project-panel');
    const main = document.querySelector('main');
    const poster = document.getElementById('rescuePoster');
    const live = document.getElementById('rescueLive');
    const stage = document.getElementById('rescueStage');
    const launch = document.getElementById('rescueLaunch');
    const launchLabel = document.getElementById('rescueLaunchLabel');
    const loadStatus = document.getElementById('rescueLoadStatus');
    const announcement = document.getElementById('rescueAnnouncement');
    const photo = document.getElementById('rescuePhoto');
    const driveButton = document.getElementById('rescueDrive');
    const explodeButton = document.getElementById('rescueExplode');
    const zoomOut = document.getElementById('rescueZoomOut');
    const zoomIn = document.getElementById('rescueZoomIn');
    const reset = document.getElementById('rescueReset');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const motionPaused = () => motion.matches || root.dataset.motion === 'paused';
    let engine = null;
    let loading = false;
    let active = false;
    let driving = false;
    let exploded = false;
    let failure = false;
    const text = (ko, en) => root.lang === 'en' ? en : ko;
    const announce = (ko, en) => { announcement.textContent = text(ko, en); };

    function labels() {
        work.querySelectorAll('[data-ko][data-en]').forEach(node => { node.textContent = text(node.dataset.ko, node.dataset.en); });
        work.querySelectorAll('[data-alt-ko][data-alt-en]').forEach(node => { node.alt = text(node.dataset.altKo, node.dataset.altEn); });
        work.querySelectorAll('[data-aria-ko][data-aria-en]').forEach(node => { node.setAttribute('aria-label', text(node.dataset.ariaKo, node.dataset.ariaEn)); });
        launchLabel.textContent = loading ? text('3D 불러오는 중…', 'Loading 3D…')
            : failure ? text('3D 다시 불러오기', 'Retry 3D') : text('3D로 살펴보기', 'Explore in 3D');
        driveButton.querySelector('span').textContent = driving ? text('추진 멈추기', 'Stop demo') : text('추진 데모', 'Propulsion demo');
        explodeButton.querySelector('span').textContent = exploded ? text('다시 조립', 'Assemble') : text('분해 보기', 'Exploded view');
        driveButton.setAttribute('aria-pressed', String(driving));
        explodeButton.setAttribute('aria-pressed', String(exploded));
        const canvas = stage.querySelector('canvas');
        if (canvas) canvas.setAttribute('aria-label', text(
            'RESCUE JET 3D 모델. 방향키로 회전, 더하기와 빼기로 확대·축소, R로 초기화.',
            'RESCUE JET 3D model. Arrow keys rotate, plus and minus zoom, R resets.'));
        if (failure) loadStatus.textContent = text(
            '3D를 열지 못했어요. 원본 이미지를 표시합니다. 브라우저의 그래픽 가속을 확인하거나 다시 시도해 주세요.',
            '3D could not open. The original image is available. Check browser graphics acceleration or try again.');
    }

    function showPhoto({ error = false, focus = false } = {}) {
        active = false;
        driving = false;
        failure = error;
        engine?.setDriving(false);
        engine?.pause();
        live.hidden = true;
        poster.hidden = false;
        figure.classList.remove('is-active');
        launch.setAttribute('aria-expanded', 'false');
        loadStatus.hidden = !error;
        labels();
        if (focus && !main.hasAttribute('inert') && !work.hidden) launch.focus({ preventScroll: true });
    }

    function fail() {
        const hadFocus = live.contains(document.activeElement);
        engine?.dispose();
        engine = null;
        exploded = false;
        zoomOut.disabled = false;
        zoomIn.disabled = false;
        stage.replaceChildren();
        showPhoto({ error: true, focus: hadFocus });
    }

    async function open() {
        if (loading) return;
        loading = true;
        launch.disabled = true;
        launch.setAttribute('aria-busy', 'true');
        failure = false;
        loadStatus.hidden = true;
        labels();
        try {
            if (!engine) {
                const [THREE, model] = await Promise.all([
                    import('./assets/vendor/three/three.module.min.js'),
                    import('./assets/rescue/rescue-model.js')
                ]);
                // A lens/menu change while loading must not open a hidden experience.
                if (work.hidden || main.hasAttribute('inert')) return;
                live.hidden = false;
                figure.classList.add('is-active');
                engine = createEngine(THREE, model.createRescueModel);
            }
            live.hidden = false;
            figure.classList.add('is-active');
            active = true;
            engine.resize();
            engine.renderNow();
            poster.hidden = true;
            launch.setAttribute('aria-expanded', 'true');
            labels();
            engine.canvas.focus({ preventScroll: true });
            announce('3D 모델을 열었어요. 드래그하거나 방향키로 돌려보세요.', '3D model opened. Drag or use arrow keys to rotate.');
        } catch (_) {
            fail();
        } finally {
            loading = false;
            launch.disabled = false;
            launch.removeAttribute('aria-busy');
            labels();
        }
    }

    function toggleDriving() {
        if (!active || !engine) return;
        driving = !driving;
        engine.setDriving(driving);
        labels();
        if (driving && motionPaused()) announce('정지된 추진 방향을 표시합니다.', 'Showing the static propulsion direction.');
        else announce(driving ? '추진 시각화가 시작됐어요.' : '추진 시각화를 멈췄어요.',
            driving ? 'Propulsion visualization started.' : 'Propulsion visualization stopped.');
    }
    function toggleExploded() {
        if (!active || !engine) return;
        exploded = !exploded;
        engine.setExploded(exploded);
        labels();
        announce(exploded ? '외형 부품을 분리해서 보여줍니다.' : '조립된 외형을 보여줍니다.',
            exploded ? 'Showing separated exterior components.' : 'Showing assembled exterior.');
    }
    function resetView() {
        driving = false;
        exploded = false;
        engine?.reset();
        labels();
        announce('처음 시점으로 돌아왔어요.', 'View reset.');
    }
    launch.addEventListener('click', open);
    photo.addEventListener('click', () => showPhoto({ focus: true }));
    driveButton.addEventListener('click', toggleDriving);
    explodeButton.addEventListener('click', toggleExploded);
    zoomOut.addEventListener('click', () => engine?.zoom(-0.12));
    zoomIn.addEventListener('click', () => engine?.zoom(0.12));
    reset.addEventListener('click', resetView);

    const stateObserver = new MutationObserver(records => {
        if (records.some(record => record.target === root)) {
            labels();
            engine?.theme();
            if (records.some(record => record.attributeName === 'data-motion')) engine?.motionChanged();
        }
        engine?.syncVisibility();
    });
    stateObserver.observe(root, { attributes: true, attributeFilter: ['lang', 'data-theme', 'data-motion'] });
    stateObserver.observe(work, { attributes: true, attributeFilter: ['hidden'] });
    stateObserver.observe(main, { attributes: true, attributeFilter: ['inert'] });
    document.addEventListener('visibilitychange', () => engine?.syncVisibility());
    motion.addEventListener('change', () => engine?.motionChanged());
    labels();

    function createEngine(THREE, makeModel) {
        const canvas = document.createElement('canvas');
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-describedby', 'rescueHint');
        stage.append(canvas);
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
        } catch (error) {
            canvas.remove();
            throw error;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.95;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-4, 4, 2.5, -2.5, 0.1, 60);
        camera.position.set(5.7, 7.3, 8.8);
        camera.lookAt(0, 0.15, 0);
        const ambient = new THREE.HemisphereLight(0xffffff, 0x777567, 1.9);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xfff4e5, 2.8);
        key.position.set(-3, 7, 5);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 25 });
        key.shadow.bias = -0.0008;
        key.shadow.normalBias = 0.035;
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xc9dcff, 1.0);
        fill.position.set(5, 3, -4);
        scene.add(fill);
        const assembly = makeModel(THREE);
        const turntable = new THREE.Group();
        turntable.add(assembly.group);
        scene.add(turntable);
        const floorGeometry = new THREE.PlaneGeometry(200, 200);
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e8df, roughness: 1 });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.67;
        floor.receiveShadow = true;
        scene.add(floor);

        // Bubbles illustrate direction only; no speed, thrust or fluid-physics claim.
        const bubbleGeometry = new THREE.SphereGeometry(0.035, 6, 4);
        const bubbleMaterial = new THREE.MeshBasicMaterial({ color: 0x56aebe, transparent: true, opacity: 0.55, depthWrite: false });
        const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, 48);
        bubbles.frustumCulled = false;
        bubbles.visible = false;
        scene.add(bubbles);
        const dummy = new THREE.Object3D();
        const jetWorld = new THREE.Vector3();
        const jetDirection = new THREE.Vector3();
        const jetQuaternion = new THREE.Quaternion();
        let renderedWidth = 0;
        let renderedHeight = 0;
        let frame = 0;
        let previous = 0;
        let elapsed = 0;
        let yaw = -0.15;
        let pitch = 0;
        let zoom = 1;
        let explodedValue = 0;
        let explodedTarget = 0;
        let run = false;
        let destroyed = false;
        let pointer = null;
        const disposers = [];

        function listen(target, event, handler, options) {
            target.addEventListener(event, handler, options);
            disposers.push(() => target.removeEventListener(event, handler, options));
        }
        function isVisible() {
            const bounds = stage.getBoundingClientRect();
            return active && !document.hidden && !work.hidden && !main.hasAttribute('inert')
                && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight;
        }
        function pose() {
            turntable.rotation.set(pitch, yaw, 0, 'YXZ');
            assembly.setExploded(explodedValue);
            turntable.updateMatrixWorld(true);
            bubbles.visible = run;
            if (run && assembly.jets.length) {
                for (let i = 0; i < 48; i++) {
                    const jet = assembly.jets[i % assembly.jets.length];
                    jet.getWorldPosition(jetWorld);
                    jet.getWorldQuaternion(jetQuaternion);
                    jetDirection.set(0, 0, 1).applyQuaternion(jetQuaternion);
                    const phase = ((i / 48) + elapsed * 0.65) % 1;
                    dummy.position.copy(jetWorld).addScaledVector(jetDirection, 0.08 + phase * 1.6);
                    dummy.position.x += Math.sin(i * 2.4) * phase * 0.17;
                    dummy.position.y += Math.cos(i * 1.8) * phase * 0.08;
                    dummy.scale.setScalar((1 - phase) * 0.9 + 0.25);
                    dummy.updateMatrix();
                    bubbles.setMatrixAt(i, dummy.matrix);
                }
                bubbles.instanceMatrix.needsUpdate = true;
            }
        }
        function draw() {
            if (destroyed) return;
            pose();
            renderer.render(scene, camera);

        }
        function loop(time) {
            frame = 0;
            if (!isVisible() || destroyed) { previous = 0; return; }
            const delta = Math.min(0.04, previous ? (time - previous) / 1000 : 1 / 60);
            previous = time;
            if (!motionPaused()) {
                elapsed += delta;
                if (run) assembly.rotors.forEach(rotor => { rotor.rotation.z += delta * 19; });
                explodedValue += (explodedTarget - explodedValue) * Math.min(1, delta * 9);
                if (Math.abs(explodedTarget - explodedValue) < 0.002) explodedValue = explodedTarget;
            } else explodedValue = explodedTarget;
            draw();
            if (!motionPaused() && (run || explodedValue !== explodedTarget)) request();
            else previous = 0;
        }
        function request() {
            if (!frame && isVisible() && !destroyed) frame = requestAnimationFrame(loop);
        }
        function pause() {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            previous = 0;
            if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
            pointer = null;
        }
        function resize() {
            const bounds = stage.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            const aspect = bounds.width / bounds.height;
            const halfHeight = Math.max(2.15, 3.5 / aspect) / zoom;
            camera.left = -halfHeight * aspect;
            camera.right = halfHeight * aspect;
            camera.top = halfHeight;
            camera.bottom = -halfHeight;
            camera.updateProjectionMatrix();
            const width = Math.round(bounds.width);
            const height = Math.round(bounds.height);
            if (width !== renderedWidth || height !== renderedHeight) {
                renderer.setSize(width, height, false);
                renderedWidth = width;
                renderedHeight = height;
            }
            if (active) draw();
            request();
        }
        function changeZoom(delta) {
            zoom = Math.max(0.72, Math.min(1.6, zoom + delta));
            zoomOut.disabled = zoom <= 0.72;
            zoomIn.disabled = zoom >= 1.6;
            resize();
        }
        function theme() {
            const dark = root.dataset.theme === 'dark';
            scene.background = new THREE.Color(dark ? 0x272a23 : 0xe9e9e1);
            floorMaterial.color.set(dark ? 0x272a23 : 0xe9e9e1);
            bubbleMaterial.color.set(dark ? 0x8bd6db : 0x26798c);
            request();
        }
        function syncVisibility() {
            if (!isVisible()) pause();
            else { resize(); request(); }
        }
        listen(canvas, 'pointerdown', event => {
            if (!isVisible() || event.button !== 0 || !event.isPrimary) return;
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType };
            canvas.setPointerCapture(event.pointerId);
            canvas.focus({ preventScroll: true });
        });
        listen(canvas, 'pointermove', event => {
            if (!pointer || pointer.id !== event.pointerId || !isVisible()) return;
            yaw += (event.clientX - pointer.x) * 0.009;
            // Touch can keep scrolling vertically; horizontal swipes turn the model.
            if (pointer.type !== 'touch') pitch = Math.max(-0.28, Math.min(0.32, pitch + (event.clientY - pointer.y) * 0.004));
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            request();
        });
        const release = () => {
            if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
            pointer = null;
        };
        listen(canvas, 'pointerup', release);
        listen(canvas, 'pointercancel', release);
        listen(canvas, 'lostpointercapture', () => { pointer = null; });
        listen(canvas, 'keydown', event => {
            if (!isVisible()) return;
            const actions = {
                ArrowLeft: () => { yaw -= 0.18; },
                ArrowRight: () => { yaw += 0.18; },
                ArrowUp: () => { pitch = Math.max(-0.28, pitch - 0.08); },
                ArrowDown: () => { pitch = Math.min(0.32, pitch + 0.08); },
                '+': () => changeZoom(0.12), '=': () => changeZoom(0.12),
                '-': () => changeZoom(-0.12), r: resetView, R: resetView
            };
            if (!actions[event.key]) return;
            event.preventDefault();
            actions[event.key]();
            request();
        });
        listen(canvas, 'webglcontextlost', event => {
            event.preventDefault();
            fail();
        });
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
        const intersectionObserver = new IntersectionObserver(() => {
            syncVisibility();
        }, { threshold: 0 });
        intersectionObserver.observe(stage);
        theme();
        return {
            canvas, resize, theme, pause, syncVisibility, zoom: changeZoom,
            renderNow: draw,
            setDriving(value) { run = value; bubbles.visible = value; request(); },
            setExploded(value) {
                explodedTarget = value ? 1 : 0;
                if (motionPaused()) explodedValue = explodedTarget;
                request();
            },
            motionChanged() { pause(); if (motionPaused()) explodedValue = explodedTarget; request(); },
            reset() {
                run = false;
                yaw = -0.15;
                pitch = 0;
                zoom = 1;
                explodedTarget = 0;
                explodedValue = 0;
                assembly.rotors.forEach(rotor => { rotor.rotation.z = 0; });
                zoomOut.disabled = false;
                zoomIn.disabled = false;
                resize();
            },
            dispose() {
                destroyed = true;
                pause();
                resizeObserver.disconnect();
                intersectionObserver.disconnect();
                disposers.forEach(dispose => dispose());
                assembly.dispose();
                floorGeometry.dispose();
                floorMaterial.dispose();
                bubbleGeometry.dispose();
                bubbleMaterial.dispose();
                renderer.dispose();
                canvas.remove();
            }
        };
    }
}

    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeRescue, { once: true });
    else initializeRescue();
})();
