/* NextWave: the seven fields as panels. Point at one (or tap it, or scroll it to the middle of a phone screen)
   and it opens wide and plays a short loop drawn for that field. A real clip can replace any loop:
   set window.NEXTWAVE_SITE.fieldVideos = { dev: 'assets/fields/dev.mp4', ... }.
   Only the open panel animates. Reduced motion or the pause switch leaves each loop on one still frame. */
(function (root) {
    'use strict';
    const FIELDS = ['dev', 'game', 'hw', 'health', 'startup', 'mkt', 'design'];
    // Portal category for each field, where the portal has one.
    const PORTAL = { dev: 'dev', game: 'gamedev', health: 'health', startup: 'startup', mkt: 'marketing' };
    // Which panel is closest to the middle of the screen. rects: [{ top, bottom }], returns an index or -1.
    function nearestToCenter(rects, viewportHeight) {
        const middle = viewportHeight / 2;
        let best = -1, bestDistance = Infinity;
        rects.forEach((rect, index) => {
            if (rect.bottom < 0 || rect.top > viewportHeight) return;
            const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
            if (distance < bestDistance) { best = index; bestDistance = distance; }
        });
        return best;
    }
    if (typeof module === 'object' && module.exports) { module.exports = { FIELDS, PORTAL, nearestToCenter }; return; }
    const document = root.document;
    if (!document) return;

    const TAU = Math.PI * 2;
    const ease = x => 1 - Math.pow(1 - x, 3);
    // Each loop draws one frame at time t (seconds) on a canvas of size w x h. c holds the token colors.
    const LOOPS = {
        // Lines of code typed in, a cursor at the end, then the screen scrolls.
        dev(ctx, w, h, t, c) {
            const lines = [[0, .42, 'sky'], [1, .3, 'ink'], [1, .55, 'ink'], [2, .24, 'aqua'], [1, .38, 'ink'], [0, .12, 'sky'], [0, .5, 'ink'], [1, .33, 'aqua'], [1, .46, 'ink'], [0, .16, 'sky']];
            const lh = h / 11, unit = w * .06, cycle = 8;
            const typed = (t % cycle) / cycle * lines.length * 1.15;
            lines.forEach(([indent, len, tone], i) => {
                const progress = Math.max(0, Math.min(1, typed - i));
                if (!progress) return;
                const x = w * .1 + indent * unit, y = h * .14 + i * lh;
                ctx.fillStyle = tone === 'ink' ? c.dim : c[tone];
                ctx.fillRect(x, y, w * .7 * len * progress, lh * .38);
                if (progress < 1 || (i === Math.floor(typed) - 1 && Math.floor(t * 2) % 2)) { ctx.fillStyle = c.crest; ctx.fillRect(x + w * .7 * len * progress + 4, y - 2, 3, lh * .5); }
            });
        },
        // A runner jumps over blocks that slide in.
        game(ctx, w, h, t, c) {
            const ground = h * .72, size = h * .1, speed = w * .45;
            ctx.fillStyle = c.line; ctx.fillRect(0, ground, w, 2);
            for (let i = 0; i < 3; i++) {
                const x = w - ((t * speed + i * w * .45) % (w * 1.35));
                ctx.fillStyle = c.aqua; ctx.fillRect(x, ground - size * .8, size * .8, size * .8);
            }
            const phase = (t * speed / (w * .45)) % 1;
            const jump = phase > .55 && phase < .95 ? Math.sin((phase - .55) / .4 * Math.PI) : 0;
            ctx.fillStyle = c.sky; ctx.fillRect(w * .22, ground - size - jump * h * .3, size, size);
            ctx.fillStyle = c.abyss; ctx.fillRect(w * .22 + size * .6, ground - size * .75 - jump * h * .3, size * .18, size * .18);
            for (let i = 0; i < 12; i++) { ctx.fillStyle = c.line; ctx.fillRect((i * w / 11 - t * speed * .3) % w + (i * w / 11 - t * speed * .3 < 0 ? w : 0), ground + h * .08, w * .03, 2); }
        },
        // Signals travel along right-angled traces between chips.
        hw(ctx, w, h, t, c) {
            const paths = [[[.08, .3], [.4, .3], [.4, .62], [.92, .62]], [[.08, .7], [.28, .7], [.28, .46], [.62, .46], [.62, .2], [.92, .2]], [[.5, .9], [.5, .78], [.8, .78], [.8, .4], [.92, .4]]];
            ctx.lineWidth = 2; ctx.lineCap = 'square';
            paths.forEach((path, p) => {
                ctx.strokeStyle = c.line; ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)); ctx.stroke();
                const lengths = path.slice(1).map(([x, y], i) => Math.hypot((x - path[i][0]) * w, (y - path[i][1]) * h));
                const total = lengths.reduce((a, b) => a + b, 0);
                let at = ((t * .45 + p * .33) % 1) * total;
                for (let i = 0; i < lengths.length; i++) {
                    if (at > lengths[i]) { at -= lengths[i]; continue; }
                    const f = at / lengths[i], x = (path[i][0] + (path[i + 1][0] - path[i][0]) * f) * w, y = (path[i][1] + (path[i + 1][1] - path[i][1]) * f) * h;
                    ctx.fillStyle = c.aqua; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); break;
                }
                path.forEach(([x, y], i) => { if (i === 0 || i === path.length - 1) { ctx.fillStyle = c.sky; ctx.fillRect(x * w - 6, y * h - 6, 12, 12); } });
            });
            ctx.strokeStyle = c.sky; ctx.lineWidth = 2; ctx.strokeRect(w * .4, h * .36, w * .16, h * .2);
        },
        // A heartbeat trace sweeping left to right.
        health(ctx, w, h, t, c) {
            const mid = h * .55, sweep = (t * .32) % 1, beat = x => { const p = (x * 3.2) % 1; if (p < .38) return 0; if (p < .42) return -(p - .38) / .04 * .1; if (p < .46) return -.1 + (p - .42) / .04 * .55; if (p < .5) return .45 - (p - .46) / .04 * .7; if (p < .54) return -.25 + (p - .5) / .04 * .25; if (p > .66 && p < .76) return -Math.sin((p - .66) / .1 * Math.PI) * .12; return 0; };
            ctx.strokeStyle = c.line; ctx.lineWidth = 1;
            for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 6); ctx.lineTo(w, h * i / 6); ctx.stroke(); }
            ctx.strokeStyle = c.aqua; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
            const end = Math.floor(sweep * 240);
            for (let i = 0; i <= end; i++) { const x = i / 240; const y = mid - beat(x) * h; i ? ctx.lineTo(x * w, y) : ctx.moveTo(0, y); }
            ctx.stroke();
            ctx.fillStyle = c.crest; ctx.beginPath(); ctx.arc(sweep * w, mid - beat(sweep) * h, 5, 0, TAU); ctx.fill();
        },
        // Bars rise one by one and a line climbs over them.
        startup(ctx, w, h, t, c) {
            const values = [.12, .16, .14, .22, .3, .28, .42, .58, .8], n = values.length, cycle = 6, p = (t % cycle) / cycle;
            const bw = w * .7 / n, base = h * .85;
            ctx.fillStyle = c.line; ctx.fillRect(w * .12, base, w * .78, 2);
            const points = [];
            values.forEach((v, i) => {
                const grow = ease(Math.max(0, Math.min(1, p * n * 1.4 - i)));
                const x = w * .14 + i * bw, top = base - v * h * .7 * grow;
                ctx.fillStyle = i === n - 1 ? c.sky : c.dim; ctx.fillRect(x, top, bw * .62, base - top);
                if (grow > 0) points.push([x + bw * .31, top - 10]);
            });
            ctx.strokeStyle = c.aqua; ctx.lineWidth = 3; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        },
        // Rings spread from a point and small notices pop up around it.
        mkt(ctx, w, h, t, c) {
            const x = w * .3, y = h * .55;
            for (let i = 0; i < 4; i++) { const r = ((t * .5 + i / 4) % 1); ctx.strokeStyle = c.sky; ctx.globalAlpha = 1 - r; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * w * .5, 0, TAU); ctx.stroke(); }
            ctx.globalAlpha = 1; ctx.fillStyle = c.sky; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
            [[.62, .22, 0], [.7, .46, 1.1], [.58, .7, 2.2]].forEach(([nx, ny, delay]) => {
                const p = ((t - delay) % 3.3 + 3.3) % 3.3; const show = p < .3 ? ease(p / .3) : p < 2.6 ? 1 : Math.max(0, 1 - (p - 2.6) / .4);
                ctx.globalAlpha = show; ctx.fillStyle = c.deep2; const bw = w * .3, bh = h * .12, bx = nx * w, by = ny * h + (1 - show) * 12;
                ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = c.aqua; ctx.beginPath(); ctx.arc(bx + bh * .5, by + bh * .5, bh * .22, 0, TAU); ctx.fill();
                ctx.fillStyle = c.dim; ctx.fillRect(bx + bh, by + bh * .3, bw * .55, bh * .14); ctx.fillRect(bx + bh, by + bh * .58, bw * .35, bh * .12);
            });
            ctx.globalAlpha = 1;
        },
        // A pen-tool curve, its handles swinging, the curve redrawn to follow them.
        design(ctx, w, h, t, c) {
            const a = [w * .12, h * .72], d = [w * .88, h * .32];
            const b = [w * (.35 + .12 * Math.sin(t * .9)), h * (.12 + .1 * Math.cos(t * .7))], e = [w * (.62 + .1 * Math.cos(t * .8)), h * (.9 - .12 * Math.sin(t * 1.1))];
            ctx.strokeStyle = c.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.moveTo(...d); ctx.lineTo(...e); ctx.stroke();
            ctx.strokeStyle = c.sky; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...a); ctx.bezierCurveTo(...b, ...e, ...d); ctx.stroke();
            [a, d].forEach(([x, y]) => { ctx.fillStyle = c.crest; ctx.fillRect(x - 6, y - 6, 12, 12); });
            [b, e].forEach(([x, y]) => { ctx.fillStyle = c.aqua; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); });
        }
    };

    function init() {
        const list = document.getElementById('field-panels');
        if (!list || list.dataset.ready) return;
        list.dataset.ready = 'true';
        const html = document.documentElement;
        const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
        const coarse = root.matchMedia('(hover: none), (pointer: coarse)');
        const narrow = root.matchMedia('(max-width: 780px)');
        const still = () => reduce.matches || html.dataset.motion === 'paused';
        const videos = ((root.NEXTWAVE_SITE || {}).fieldVideos) || {};
        const css = name => getComputedStyle(html).getPropertyValue(name).trim();
        let colors = null;
        const palette = () => colors || (colors = { sky: css('--sky'), aqua: css('--aqua'), crest: css('--crest'), line: css('--tide'), dim: css('--on-night-3'), abyss: css('--abyss'), deep2: css('--tide') });
        const panels = [...list.querySelectorAll('.field-panel')];
        let open = 0, raf = 0, start = performance.now(), visible = false, changedAt = 0, lastPointer = null, dwell = 0;

        const views = panels.map(panel => {
            const key = panel.dataset.field;
            const screen = panel.querySelector('.field-screen');
            const src = typeof videos[key] === 'string' ? videos[key] : '';
            if (src) {
                const video = document.createElement('video');
                video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'none'; video.setAttribute('aria-hidden', 'true');
                video.src = src; screen.append(video);
                return { key, video };
            }
            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-hidden', 'true');
            screen.append(canvas);
            return { key, canvas, ctx: canvas.getContext('2d') };
        });

        function size(view) {
            if (!view.canvas) return;
            const box = view.canvas.getBoundingClientRect(), ratio = Math.min(root.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(box.width * ratio)), h = Math.max(1, Math.round(box.height * ratio));
            if (view.canvas.width !== w || view.canvas.height !== h) { view.canvas.width = w; view.canvas.height = h; }
        }
        function paint(view, t) {
            if (!view.ctx) return;
            size(view);
            const { width: w, height: h } = view.canvas;
            view.ctx.setTransform(1, 0, 0, 1, 0, 0);
            view.ctx.clearRect(0, 0, w, h);
            LOOPS[view.key](view.ctx, w, h, t, palette());
        }
        function frame(now) {
            raf = 0;
            if (!visible || document.hidden || still()) return;
            paint(views[open], (now - start) / 1000);
            raf = root.requestAnimationFrame(frame);
        }
        function run() {
            views.forEach((view, index) => {
                if (view.video) { if (index === open && visible && !still()) view.video.play().catch(() => {}); else view.video.pause(); }
            });
            if (still() || !visible) { if (raf) root.cancelAnimationFrame(raf); raf = 0; paint(views[open], 2.4); return; }
            if (!raf) raf = root.requestAnimationFrame(frame);
        }
        function select(index) {
            if (index < 0 || index === open) return;
            open = index; start = changedAt = performance.now();
            panels.forEach((panel, i) => { panel.classList.toggle('is-open', i === index); panel.querySelector('.field-toggle').setAttribute('aria-expanded', String(i === index)); });
            // Closed panels keep a still frame so the strip never looks empty.
            setTimeout(() => { views.forEach((view, i) => { if (i !== index) paint(view, 2.4); }); run(); }, 460);
            run();
        }

        panels.forEach((panel, index) => {
            const toggle = panel.querySelector('.field-toggle');
            // Only a real mouse movement opens a panel. Widening panels slide under a still pointer, and that must not count.
            // A panel opens only when the pointer rests on it for a moment, so sweeping across the strip
            // (or leaving it) does not flick panels open one after another.
            panel.addEventListener('pointermove', event => {
                if (event.pointerType !== 'mouse') return;
                const moved = !lastPointer || lastPointer.x !== event.clientX || lastPointer.y !== event.clientY;
                lastPointer = { x: event.clientX, y: event.clientY };
                if (!moved || index === open) { if (index === open) clearTimeout(dwell); return; }
                clearTimeout(dwell);
                dwell = setTimeout(() => { if (performance.now() - changedAt > 350) select(index); }, 160);
            });
            panel.addEventListener('pointerleave', () => clearTimeout(dwell));
            toggle.addEventListener('click', () => select(index));
            toggle.addEventListener('focus', () => select(index));
        });
        // On phones the panel nearest the middle of the screen opens as you scroll to it.
        let queued = false;
        root.addEventListener('scroll', () => {
            if (!(coarse.matches || narrow.matches) || !visible || queued) return;
            queued = true;
            root.requestAnimationFrame(() => { queued = false; select(nearestToCenter(panels.map(panel => panel.getBoundingClientRect()), root.innerHeight)); });
        }, { passive: true });
        if ('IntersectionObserver' in root) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; run(); }, { rootMargin: '100px 0px' }).observe(list);
        else { visible = true; }
        document.addEventListener('visibilitychange', run);
        reduce.addEventListener('change', run);
        new MutationObserver(run).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
        root.addEventListener('resize', () => views.forEach(view => paint(view, 2.4)));
        // First paint once layout and fonts settle.
        root.requestAnimationFrame(() => { views.forEach(view => paint(view, 2.4)); run(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
