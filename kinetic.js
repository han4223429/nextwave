/* NextWave — a real-time, perspective 3D water mesh. No image textures or dependencies. */
(function (root) {
    'use strict';
    const MODES = Object.freeze({ wave: 0, orbit: 1, burst: 2 });
    const MAX_RIPPLES = 8, RIPPLE_LIFE = 5;
    const WATER_WIDTH = 8.4, WATER_DEPTH = 6.4;
    // Shared parameters generate the GPU waves and drive CPU surface picking.
    const WAVE_COMPONENTS = Object.freeze([
        [0.92, -0.39, 4.8, 0.22, 0.4],
        [0.78, -0.62, 2.6, 0.12, 1.8],
        [0.98, -0.19, 1.4, 0.060, 3.2],
        [0.85, -0.52, 0.72, 0.024, 0.8],
        [0.45, 0.89, 0.38, 0.010, 2.3],
    ].map(([x, z, wavelength, amplitude, phase]) => {
        const length = Math.hypot(x, z), k = Math.PI * 2 / wavelength;
        return Object.freeze({ x: x / length, z: z / length, k, omega: Math.sqrt(2.4 * k), amplitude, phase });
    }));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const hash = seed => { const value = Math.sin(seed * 127.1 + 12.8) * 43758.5453; return value - Math.floor(value); };

    function ringHeight(u, v, ripple, time) {
        const age = time - ripple.born;
        if (age < 0 || age >= RIPPLE_LIFE) return 0;
        const distance = Math.hypot((u - ripple.x) * WATER_WIDTH, (v - ripple.y) * WATER_DEPTH);
        const band = (distance - age * 0.94) / (0.34 + age * 0.08);
        return Math.sin(distance * 17.5 - age * 9.3) * Math.exp(-band * band) * (1 - age / 5) ** 2 * ripple.strength * 0.085;
    }
    // This CPU surface also ray-picks the same changing geometry used by the vertex shader.
    function surfacePoint(u, v, time = 0, mode = 0, ripples = []) {
        const swell = 1 - smooth(0, 0.9, Math.abs(mode - 1));
        const rain = smooth(1.1, 1.95, mode);
        const baseX = (u - 0.5) * WATER_WIDTH, baseZ = (0.5 - v) * WATER_DEPTH;
        let x = baseX, y = -0.18, z = baseZ;
        const energy = 1 + swell * 0.65 + rain * 0.08;
        WAVE_COMPONENTS.forEach(wave => {
            const phase = (baseX * wave.x + baseZ * wave.z) * wave.k - time * wave.omega + wave.phase;
            const amplitude = wave.amplitude * energy, horizontal = Math.cos(phase) * amplitude * 0.32;
            x += wave.x * horizontal; y += Math.sin(phase) * amplitude; z += wave.z * horizontal;
        });
        let ripple = 0;
        ripples.forEach(impact => { ripple += ringHeight(u, v, impact, time); });
        if (rain > 0.001) {
            for (let i = 0; i < 4; i++) {
                const cycle = time * 0.75 + i * 1.13, age = cycle % 4.4;
                ripple += ringHeight(u, v, { x: 0.24 + hash(i * 9.2 + Math.floor(cycle / 4.4) * 3.17) * 0.64, y: 0.06 + hash(i * 4.8 + 8.3) * 0.70, born: time - age, strength: rain * 0.8 }, time);
            }
        }
        y += ripple;
        return [x, y, z];
    }
    function rotate(point, yaw, pitch) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const x = point[0] * cy + point[2] * sy, z = -point[0] * sy + point[2] * cy;
        return [x, point[1] * cp - z * sp, point[1] * sp + z * cp];
    }
    function cameraFor(width, height, yaw = -0.22, pitch = 0.53) {
        const aspect = Math.max(1, width) / Math.max(1, height), compact = width < 700;
        return { aspect, yaw, pitch: pitch + (compact ? 0.22 : 0), distance: 9.2, focal: 2.16, scale: compact ? Math.min(1.20, aspect * 1.05) : clamp(aspect * 0.72, 0.52, 1.50), offset: compact ? [0.18, 0.05] : [0.44, -0.16] };
    }
    function projectPoint(point, camera) {
        const p = rotate(point, camera.yaw, camera.pitch), depth = camera.distance - p[2];
        return { x: (p[0] * camera.focal * camera.scale / camera.aspect / depth + camera.offset[0] + 1) / 2, y: (p[1] * camera.focal * camera.scale / depth + camera.offset[1] + 1) / 2, depth };
    }
    function makeWaterGrid(columns = 144, rows = 90) {
        if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2 || (columns + 1) * (rows + 1) > 65535) throw new RangeError('Water grid exceeds Uint16 mesh limits');
        const positions = new Float32Array((columns + 1) * (rows + 1) * 3), indices = new Uint16Array(columns * rows * 6);
        let cursor = 0;
        for (let v = 0; v <= rows; v++) for (let u = 0; u <= columns; u++) { positions[cursor++] = u / columns; positions[cursor++] = v / rows; positions[cursor++] = 0; }
        cursor = 0;
        for (let v = 0; v < rows; v++) for (let u = 0; u < columns; u++) {
            const a = v * (columns + 1) + u, b = a + 1, c = a + columns + 1, d = c + 1;
            indices.set([a, b, c, b, d, c], cursor); cursor += 6;
        }
        return { positions, indices };
    }
    function makeSphere(columns = 16, rows = 12) {
        const mesh = makeWaterGrid(columns, rows);
        for (let i = 0; i < mesh.positions.length; i += 3) {
            const longitude = mesh.positions[i] * Math.PI * 2, latitude = mesh.positions[i + 1] * Math.PI;
            mesh.positions[i] = Math.sin(latitude) * Math.cos(longitude);
            mesh.positions[i + 1] = Math.cos(latitude);
            mesh.positions[i + 2] = Math.sin(latitude) * Math.sin(longitude);
        }
        return mesh;
    }
    function packRipples(ripples, time) {
        const values = new Float32Array(MAX_RIPPLES * 4);
        for (let i = 0; i < MAX_RIPPLES; i++) values[i * 4 + 2] = -100;
        ripples.filter(ripple => time >= ripple.born && time - ripple.born < RIPPLE_LIFE).slice(-MAX_RIPPLES).forEach((ripple, i) => values.set([clamp(ripple.x, 0, 1), clamp(ripple.y, 0, 1), ripple.born, clamp(ripple.strength, 0, 1.5)], i * 4));
        return values;
    }
    function pointerPosition(clientX, clientY, box) { return [clamp((clientX - box.left) / Math.max(1, box.width), 0, 1), clamp(1 - (clientY - box.top) / Math.max(1, box.height), 0, 1)]; }
    function pickSurface(x, y, camera, time, mode, ripples = []) {
        const columns = 40, rows = 28, points = [];
        for (let v = 0; v <= rows; v++) for (let u = 0; u <= columns; u++) points.push({ ...projectPoint(surfacePoint(u / columns, v / rows, time, mode, ripples), camera), u: u / columns, v: v / rows });
        let best = null;
        function triangle(a, b, c) {
            const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
            if (Math.abs(denominator) < 1e-10) return;
            const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
            const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator, wc = 1 - wa - wb;
            if (Math.min(wa, wb, wc) < -0.00001) return;
            const inverse = wa / a.depth + wb / b.depth + wc / c.depth, depth = 1 / inverse;
            if (depth <= 0 || (best && depth >= best.depth)) return;
            best = { u: (wa * a.u / a.depth + wb * b.u / b.depth + wc * c.u / c.depth) / inverse, v: (wa * a.v / a.depth + wb * b.v / b.depth + wc * c.v / c.depth) / inverse, depth };
        }
        for (let v = 0; v < rows; v++) for (let u = 0; u < columns; u++) {
            const a = v * (columns + 1) + u, b = a + 1, c = a + columns + 1, d = c + 1;
            triangle(points[a], points[b], points[c]); triangle(points[b], points[d], points[c]);
        }
        return best;
    }
    function dropletPoint(index, time, mode) {
        // A drop falls just before the matching automatic ring begins its next cycle.
        const cycle = time * 0.75 + index * 1.13, age = cycle % 4.4;
        const impactCycle = Math.floor(cycle / 4.4) + 1;
        const u = 0.24 + hash(index * 9.2 + impactCycle * 3.17) * 0.64, v = 0.06 + hash(index * 4.8 + 8.3) * 0.70;
        const point = surfacePoint(u, v, time, mode), fall = clamp((age - 3.58) / 0.82, 0, 1);
        point[1] += (1 - fall * fall) * 1.65;
        return [...point, age < 3.58 ? 0 : 0.038 * smooth(0, 0.12, fall)];
    }

    const VERTEX = `
        precision highp float;
        attribute vec3 aPosition;
        uniform vec4 uCamera;
        uniform vec2 uRotation;
        uniform vec2 uOffset;
        uniform float uTime;
        uniform float uMode;
        uniform float uKind;
        uniform vec4 uDroplet;
        uniform vec4 uRipples[8];
        varying mediump vec3 vPosition;
        varying mediump vec3 vNormal;
        varying mediump vec2 vUv;
        varying mediump float vCompression;
        float hash(float seed) { return fract(sin(seed * 127.1 + 12.8) * 43758.5453); }
        float ring(vec2 uv, vec4 ripple) {
            float age = uTime - ripple.z;
            if (age < 0.0 || age >= 5.0) return 0.0;
            float distance = length((uv - ripple.xy) * vec2(8.4, 6.4));
            float band = (distance - age * 0.94) / (0.34 + age * 0.08);
            float fade = 1.0 - age / 5.0;
            return sin(distance * 17.5 - age * 9.3) * exp(-band * band) * fade * fade * ripple.w * 0.085;
        }
        vec3 gerstner(vec2 base, vec2 direction, float k, float omega, float amplitude, float offset) {
            float phase = dot(base, direction) * k - uTime * omega + offset;
            float horizontal = cos(phase) * amplitude * 0.32;
            return vec3(direction.x * horizontal, sin(phase) * amplitude, direction.y * horizontal);
        }
        vec3 surface(vec2 uv) {
            float swell = 1.0 - smoothstep(0.0, 0.9, abs(uMode - 1.0));
            float rain = smoothstep(1.1, 1.95, uMode);
            float energy = 1.0 + swell * 0.65 + rain * 0.08;
            vec2 base = vec2((uv.x - 0.5) * 8.4, (0.5 - uv.y) * 6.4);
            vec3 point = vec3(base.x, -0.18, base.y);
            ${WAVE_COMPONENTS.map(w => `point += gerstner(base, vec2(${w.x.toFixed(12)}, ${w.z.toFixed(12)}), ${w.k.toFixed(12)}, ${w.omega.toFixed(12)}, ${w.amplitude.toFixed(12)} * energy, ${w.phase.toFixed(12)});`).join('\n            ')}
            float ripple = 0.0;
            for (int i = 0; i < 8; i++) ripple += ring(uv, uRipples[i]);
            if (rain > 0.001) {
                for (int i = 0; i < 4; i++) {
                    float cycle = uTime * 0.75 + float(i) * 1.13;
                    float age = mod(cycle, 4.4);
                    ripple += ring(uv, vec4(0.24 + hash(float(i) * 9.2 + floor(cycle / 4.4) * 3.17) * 0.64, 0.06 + hash(float(i) * 4.8 + 8.3) * 0.70, uTime - age, rain * 0.8));
                }
            }
            point.y += ripple;
            return point;
        }
        vec3 rotate(vec3 p) {
            float cy = cos(uRotation.x), sy = sin(uRotation.x), cp = cos(uRotation.y), sp = sin(uRotation.y);
            vec3 q = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
            return vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
        }
        void main() {
            vec3 point, normal;
            vUv = aPosition.xy; vCompression = 0.0;
            if (uKind > 1.5) { point = aPosition; normal = vec3(0.0, 1.0, 0.0); }
            else if (uKind > 0.5) { point = aPosition * uDroplet.w + uDroplet.xyz; normal = aPosition; }
            else {
                point = surface(aPosition.xy);
                vec3 du = surface(aPosition.xy + vec2(0.001, 0.0)) - surface(aPosition.xy - vec2(0.001, 0.0));
                vec3 dv = surface(aPosition.xy + vec2(0.0, 0.001)) - surface(aPosition.xy - vec2(0.0, 0.001));
                vec3 area = cross(du, dv);
                normal = normalize(area);
                vCompression = 1.0 - max(area.y / 0.00021504, 0.0);
            }
            vec3 rotated = rotate(point);
            vPosition = rotated; vNormal = rotate(normal);
            float depth = uCamera.y - rotated.z;
            vec2 projected = vec2(rotated.x / uCamera.x, rotated.y) * uCamera.z * uCamera.w;
            gl_Position = vec4(projected + uOffset * depth, 1.006689 * depth - 0.200669, depth);
        }
    `;
    const FRAGMENT = `
        precision highp float;
        uniform vec4 uCamera;
        uniform float uTime;
        uniform float uKind;
        varying mediump vec3 vPosition;
        varying mediump vec3 vNormal;
        varying mediump vec2 vUv;
        varying mediump float vCompression;
        void main() {
            if (uKind > 1.5) {
                vec2 footprint = vec2(vPosition.x * 0.26, (vPosition.z - 0.7) * 0.37);
                float edge = exp(-dot(footprint, footprint));
                float caustic = pow(max(0.0, sin(vPosition.x * 10.0 + sin(vPosition.z * 8.0 + uTime * 0.4)) * sin(vPosition.z * 12.0 - uTime * 0.6 + cos(vPosition.x * 7.0))), 9.0);
                gl_FragColor = vec4(mix(vec3(0.25, 0.77, 0.82), vec3(0.7, 0.98, 1.0), caustic), edge * (0.065 + caustic * 0.075));
                return;
            }
            vec3 normal = normalize(vNormal);
            if (!gl_FrontFacing) normal = -normal;
            if (uKind < 0.5) normal = normalize(normal + vec3(sin(vUv.x * 137.0 - vUv.y * 63.0 - uTime * 2.1), cos(vUv.x * 93.0 - vUv.y * 41.0 - uTime * 1.5), sin(vUv.x * 159.0 - vUv.y * 81.0 - uTime * 2.5)) * 0.018);
            vec3 view = normalize(vec3(0.0, 0.0, uCamera.y) - vPosition);
            vec3 light = normalize(vec3(-0.48, 0.90, 0.66));
            vec3 reflected = reflect(-view, normal);
            float facing = clamp(dot(normal, view), 0.0, 1.0);
            // Air/water IOR (1.333) gives approximately 2% reflection straight on.
            float fresnel = 0.02037 + 0.97963 * pow(1.0 - facing, 5.0);
            float sky = smoothstep(-0.3, 0.65, reflected.y);
            vec3 environment = mix(vec3(0.06, 0.31, 0.51), vec3(0.83, 0.97, 1.0), sky);
            float sunAlignment = max(dot(reflected, light), 0.0);
            float sunGlint = pow(sunAlignment, 190.0);
            float sunHalo = pow(sunAlignment, 24.0);
            float diffuse = max(dot(normal, light), 0.0);
            // Optical depth follows the viewing angle; wave height is not terrain colour.
            float clarity = pow(facing, 0.58);
            vec3 transmission = mix(vec3(0.012, 0.29, 0.48), vec3(0.13, 0.74, 0.81), clarity) * (0.94 + diffuse * 0.06);
            vec2 refracted = vUv * vec2(8.4, 6.4) + normal.xz * 0.17;
            float lightA = sin(refracted.x * 10.2 + sin(refracted.y * 7.8 - uTime * 0.8) + uTime * 0.55);
            float lightB = sin(refracted.y * 9.6 + cos(refracted.x * 8.1 + uTime * 0.42) - uTime * 0.62);
            float caustic = pow(clamp(1.0 - abs(lightA + lightB), 0.0, 1.0), 12.0);
            transmission += vec3(0.20, 0.62, 0.70) * caustic * 0.085 * clarity;
            vec3 color = mix(transmission, environment, 0.20 + fresnel * 0.78);
            color += vec3(1.0, 0.99, 0.91) * (sunGlint * 1.45 + sunHalo * 0.09) * (0.18 + fresnel * 2.8);
            float edgeFade = 1.0;
            if (uKind < 0.5) {
                // An open wash may extend past the viewport; there is no puddle outline.
                edgeFade = smoothstep(0.0, 0.13, vUv.x) * smoothstep(0.0, 0.055, 1.0 - vUv.x) * smoothstep(0.0, 0.055, vUv.y) * smoothstep(0.0, 0.14, 1.0 - vUv.y);
                // Foam forms only at converging crests, never as a painted cut edge.
                float foam = smoothstep(0.42, 0.70, vCompression) * (0.50 + sin(vUv.x * 171.0 + vUv.y * 123.0) * 0.25) * 0.24;
                color = mix(color, vec3(0.85, 0.99, 1.0), foam);
            }
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), (0.86 + fresnel * 0.12) * edgeFade);
        }
    `;
    if (typeof module === 'object' && module.exports) { module.exports = { surfacePoint, ringHeight, WAVE_COMPONENTS, WATER_WIDTH, WATER_DEPTH, rotate, cameraFor, projectPoint, makeWaterGrid, makeSphere, pickSurface, dropletPoint, packRipples, pointerPosition, MAX_RIPPLES, RIPPLE_LIFE }; return; }
    const document = root.document;
    if (!document) return;
    function init() {
        const canvas = document.getElementById('kinetic-canvas'), stage = document.getElementById('kinetic-stage');
        if (!canvas || !stage || canvas.dataset.kineticReady === 'true') return;
        canvas.dataset.kineticReady = 'true';
        const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
        const buttons = [...document.querySelectorAll('[data-lab-mode]')], motionButton = document.getElementById('motion-toggle'), motionLabel = document.getElementById('motion-label'), shuffleButton = document.getElementById('lab-shuffle');
        const fallback = document.createElement('p'); fallback.className = 'kinetic-fallback'; fallback.hidden = true; stage.append(fallback);
        let mode = 'wave', modeValue = 0, enabled = !reduce.matches, visible = true, destroyed = false;
        let width = 1, height = 1, frame = 0, lastFrame = null, time = 0, yaw = -0.22, pitch = 0.53, spin = 0;
        let gl = null, program = null, uniforms = {}, available = false, meshes = [], positionLocation = 0;
        let pointer = null, ripples = [], camera = cameraFor(1, 1), intersection = null, resizeObserver = null;
        canvas.style.touchAction = 'pan-y'; canvas.style.width = '100%'; canvas.style.height = '100%';
        if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
        canvas.setAttribute('role', 'img');
        function updateControls() {
            const english = document.documentElement.lang === 'en';
            buttons.forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.labMode === mode)); button.disabled = !available; });
            if (shuffleButton) shuffleButton.disabled = !available;
            document.documentElement.dataset.motion = enabled ? 'running' : 'paused'; stage.dataset.motion = enabled ? 'running' : 'paused'; stage.dataset.labMode = mode;
            motionButton?.setAttribute('aria-pressed', String(enabled));
            motionButton?.setAttribute('aria-label', english ? (enabled ? 'Pause motion' : 'Enable motion') : (enabled ? '움직임 멈추기' : '움직임 켜기'));
            if (motionLabel) motionLabel.textContent = enabled ? 'MOTION ON' : 'MOTION OFF';
            canvas.setAttribute('aria-label', english ? 'Real-time 3D NextWave water. Drag horizontally or use the arrow keys to rotate the view. Click the water, or press Enter or Space, to make ripples. The buttons change the wave motion.' : '실시간 3D NextWave 물결. 좌우 드래그 또는 방향키로 시점을 회전하세요. 물결을 클릭하거나 Enter 또는 Space로 파문을 만들 수 있습니다. 아래 버튼으로 움직임을 바꿀 수 있습니다.');
            fallback.textContent = english ? 'NEXTWAVE · Small starts, shared currents. Interactive 3D is unavailable in this browser.' : 'NEXTWAVE · 작은 시작이, 다음 물결로. 이 브라우저에서는 실시간 3D를 표시할 수 없어요.';
        }
        function suspend() { if (frame) root.cancelAnimationFrame(frame); frame = 0; lastFrame = null; }
        function requestDraw() { if (!frame && available && !destroyed && visible && !document.hidden) frame = root.requestAnimationFrame(render); }
        function setMotion(next) { enabled = next; if (!enabled) { spin = 0; suspend(); } lastFrame = null; updateControls(); requestDraw(); }
        function emit(action) { document.dispatchEvent(new CustomEvent('nw:labchange', { detail: { mode, ...(action ? { action } : {}) } })); }
        function addRipple(u, v, strength = 1.3) {
            if (!available) return;
            ripples = ripples.filter(r => time - r.born < RIPPLE_LIFE).slice(-(MAX_RIPPLES - 1));
            ripples.push({ x: clamp(u, 0.02, 0.98), y: clamp(v, 0.01, 0.99), born: enabled ? time : time - 0.35, strength }); requestDraw();
        }
        function compile(type, source) {
            const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message || 'Water shader unavailable'); }
            return shader;
        }
        function uploadMesh(mesh) {
            const vertices = gl.createBuffer(), indices = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
            return { vertices, indices, count: mesh.indices.length };
        }
        function createRenderer() {
            try {
                gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' });
                if (!gl) throw new Error('WebGL unavailable');
                const fragmentSource = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? FRAGMENT : FRAGMENT.replace('precision highp float;', 'precision mediump float;');
                const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
                program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Water program unavailable');
                gl.useProgram(program); positionLocation = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(positionLocation);
                ['uCamera', 'uRotation', 'uOffset', 'uTime', 'uMode', 'uKind', 'uDroplet', 'uRipples[0]'].forEach(name => { uniforms[name] = gl.getUniformLocation(program, name); });
                meshes = [uploadMesh(makeWaterGrid()), uploadMesh(makeSphere()), uploadMesh({ positions: new Float32Array([-5.6, -1.18, -4.4, 5.6, -1.18, -4.4, -5.6, -1.18, 4.4, 5.6, -1.18, 4.4]), indices: new Uint16Array([0, 2, 1, 1, 2, 3]) })];
                gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
                available = true; canvas.hidden = false; fallback.hidden = true; stage.dataset.renderer = 'webgl-3d'; stage.dataset.geometry = 'triangle-mesh'; stage.dataset.surface = 'gerstner-ocean'; delete stage.dataset.rendererError;
            } catch (error) { available = false; canvas.hidden = true; fallback.hidden = false; stage.dataset.renderer = 'static'; stage.dataset.rendererError = String(error.message || 'WebGL unavailable').slice(0, 240); }
            updateControls(); resize();
        }
        function resize() {
            const box = stage.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
            const dpr = Math.min(2, root.devicePixelRatio || 1, Math.sqrt(2600000 / (width * height)));
            const nextWidth = Math.max(1, Math.round(width * dpr)), nextHeight = Math.max(1, Math.round(height * dpr));
            if (canvas.width !== nextWidth || canvas.height !== nextHeight) { canvas.width = nextWidth; canvas.height = nextHeight; }
            if (available) gl.viewport(0, 0, canvas.width, canvas.height); requestDraw();
        }
        function drawMesh(mesh, kind) {
            gl.uniform1f(uniforms.uKind, kind); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices); gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices); gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }
        function render(now) {
            frame = 0;
            if (!available || !visible || document.hidden || destroyed) { lastFrame = null; return; }
            const delta = lastFrame === null ? 0 : clamp((now - lastFrame) / 1000, 0, 1 / 30); lastFrame = now;
            if (enabled) { time += delta; modeValue += (MODES[mode] - modeValue) * (1 - Math.exp(-delta * 4)); if (!pointer?.dragging) { yaw = clamp(yaw + spin * delta, -1.05, 1.05); spin *= Math.exp(-delta * 4.4); } }
            else modeValue = MODES[mode];
            camera = cameraFor(width, height, yaw, pitch);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniform4f(uniforms.uCamera, camera.aspect, camera.distance, camera.focal, camera.scale); gl.uniform2f(uniforms.uRotation, camera.yaw, camera.pitch); gl.uniform2fv(uniforms.uOffset, camera.offset);
            gl.uniform1f(uniforms.uTime, time); gl.uniform1f(uniforms.uMode, modeValue); gl.uniform4fv(uniforms['uRipples[0]'], packRipples(ripples, time));
            gl.depthMask(false); drawMesh(meshes[2], 2); gl.depthMask(true); drawMesh(meshes[0], 0);
            const dropCount = modeValue > 1.6 ? 4 : 0;
            for (let i = 0; i < dropCount; i++) { const drop = dropletPoint(i, time, modeValue); if (drop[3] > 0.001) { gl.uniform4fv(uniforms.uDroplet, drop); drawMesh(meshes[1], 1); } }
            if (enabled) requestDraw();
        }
        canvas.addEventListener('pointerdown', event => {
            if (!available || !event.isPrimary || (event.pointerType !== 'touch' && event.button !== 0)) return;
            pointer = { id: event.pointerId, type: event.pointerType, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false, at: event.timeStamp };
            spin = 0;
            if (event.pointerType !== 'touch') canvas.setPointerCapture?.(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            if (!pointer || pointer.id !== event.pointerId) return;
            const dxFull = event.clientX - pointer.startX, dyFull = event.clientY - pointer.startY;
            if (!pointer.dragging) {
                if (Math.hypot(dxFull, dyFull) < 7) return;
                if (pointer.type === 'touch' && Math.abs(dxFull) < Math.abs(dyFull) * 1.2) return;
                pointer.dragging = true; canvas.setPointerCapture?.(event.pointerId); stage.dataset.dragging = 'true';
            }
            const dx = (event.clientX - pointer.x) / Math.max(300, width), dy = (event.clientY - pointer.y) / Math.max(300, height);
            yaw = clamp(yaw + dx * 3.8, -1.05, 1.05); pitch = clamp(pitch + dy * 2.0, 0.25, 0.92);
            spin = enabled ? clamp(dx * 3.8 / Math.max(0.012, (event.timeStamp - pointer.at) / 1000), -1.8, 1.8) : 0;
            pointer.x = event.clientX; pointer.y = event.clientY; pointer.at = event.timeStamp; requestDraw();
        });
        function pointerUp(event) {
            if (!pointer || pointer.id !== event.pointerId) return;
            const current = pointer; pointer = null; stage.dataset.dragging = 'false';
            if (event.type === 'pointerup' && !current.dragging && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 12) {
                const [x, y] = pointerPosition(event.clientX, event.clientY, canvas.getBoundingClientRect());
                const hit = pickSurface(x, y, camera, time, modeValue, ripples);
                if (hit) { addRipple(hit.u, hit.v); emit('ripple'); }
            }
            if (event.type === 'pointerup' && current.dragging) emit('flow');
            if (event.type === 'pointercancel') spin = 0;
            if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        }
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, pointerUp));
        canvas.addEventListener('keydown', event => {
            if (!available || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'ArrowLeft') yaw = clamp(yaw - 0.14, -1.05, 1.05);
            if (event.key === 'ArrowRight') yaw = clamp(yaw + 0.14, -1.05, 1.05);
            if (event.key === 'ArrowUp') pitch = clamp(pitch - 0.10, 0.25, 0.92);
            if (event.key === 'ArrowDown') pitch = clamp(pitch + 0.10, 0.25, 0.92);
            if (event.key === 'Enter' || event.key === ' ') { addRipple(0.65, 0.45, 1.5); emit('ripple'); }
            requestDraw();
        });
        buttons.forEach(button => button.addEventListener('click', () => { if (!available || !Object.hasOwn(MODES, button.dataset.labMode)) return; mode = button.dataset.labMode; updateControls(); requestDraw(); emit(); }));
        motionButton?.addEventListener('click', () => setMotion(!enabled));
        shuffleButton?.addEventListener('click', () => { addRipple(0.68, 0.45, 1.5); addRipple(0.42, 0.20, 1.0); addRipple(0.82, 0.65, 0.8); emit('ripple'); });
        reduce.addEventListener('change', event => setMotion(!event.matches)); document.addEventListener('nw:langchange', updateControls);
        document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else requestDraw(); });
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); available = false; suspend(); canvas.hidden = true; fallback.hidden = false; stage.dataset.renderer = 'static'; updateControls(); });
        canvas.addEventListener('webglcontextrestored', () => { if (!destroyed) createRenderer(); });
        if ('IntersectionObserver' in root) { intersection = new root.IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) requestDraw(); else suspend(); }, { rootMargin: '80px' }); intersection.observe(stage); }
        if ('ResizeObserver' in root) { resizeObserver = new root.ResizeObserver(resize); resizeObserver.observe(stage); }
        root.addEventListener('resize', resize, { passive: true });
        root.addEventListener('pagehide', event => { suspend(); if (!event.persisted) { destroyed = true; intersection?.disconnect(); resizeObserver?.disconnect(); if (gl && available) { meshes.forEach(mesh => { gl.deleteBuffer(mesh.vertices); gl.deleteBuffer(mesh.indices); }); gl.deleteProgram(program); } } });
        root.addEventListener('pageshow', () => { if (!destroyed) { resize(); requestDraw(); } });
        createRenderer();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
