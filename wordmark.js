/* NextWave — kinetic wordmark. Each letter's width axis follows a travelling wave, and the pointer raises a crest.
   The letters are real text set in a variable font; nothing is drawn or fetched. */
(function (root) {
    'use strict';
    const TAU = Math.PI * 2;
    const MIN = 62, MAX = 125, REST = 94;   // Archivo's width axis range, and the width used when nothing moves
    const SWING = (MAX - REST) * 0.9;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    // One line of letters spans exactly one wavelength, so the line's total width holds steady while its letters trade width.
    function waveWidth(time, index, count, offset = 0) {
        return REST + SWING * Math.sin(time * 1.25 - index * TAU / count + offset);
    }
    // Width under the pointer: widest at the pointer, narrowest about two letters away. Distance is measured in letters.
    function crestWidth(distance) {
        return MIN + (MAX - MIN) * Math.exp(-(distance * distance) / 1.62);
    }

    if (typeof module === 'object' && module.exports) { module.exports = { waveWidth, crestWidth, MIN, MAX, REST }; return; }
    const document = root.document;
    if (!document) return;

    function init() {
        const mark = document.getElementById('wordmark');
        if (!mark || mark.dataset.ready === 'true') return;
        mark.dataset.ready = 'true';
        const html = document.documentElement;
        const lines = [...mark.querySelectorAll('span')].map(line => [...line.querySelectorAll('i')]);
        const letters = lines.flat();
        const toggle = document.getElementById('motion-toggle'), label = document.getElementById('motion-label');
        const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
        let running = !reduce.matches, visible = true, raf = 0, last = null, time = 0;
        // The opening unfold plays only when the page starts visible and moving.
        let opened = reduce.matches || document.hidden ? 1 : 0, pointer = null, pull = 0;

        function labels() {
            html.dataset.motion = running ? 'running' : 'paused';
            if (label && root.I18N) label.textContent = root.I18N.t(running ? 'nx.motion.pause' : 'nx.motion.play');
        }
        function rest() { letters.forEach(letter => letter.style.removeProperty('--w')); }
        function stop() { if (raf) root.cancelAnimationFrame(raf); raf = 0; last = null; }
        function request() { if (!raf && running && visible && !document.hidden) raf = root.requestAnimationFrame(frame); }
        function frame(now) {
            raf = 0;
            if (!running || !visible || document.hidden) { last = null; return; }
            const elapsed = last === null ? 0 : (now - last) / 1000;
            const delta = Math.min(0.05, elapsed);
            last = now; time += delta;
            // Read every letter's position before writing any width.
            const boxes = pointer ? letters.map(letter => letter.getBoundingClientRect()) : null;
            const pitch = boxes ? boxes.reduce((sum, box) => sum + box.width, 0) / boxes.length : 1;
            opened = Math.min(1, opened + elapsed / 1.1);
            pull += ((pointer ? 1 : 0) - pull) * (1 - Math.exp(-delta * 9));
            const unfold = 1 - (1 - opened) ** 3;
            let n = 0;
            lines.forEach((line, row) => line.forEach((letter, index) => {
                let width = waveWidth(time, index, line.length, row * TAU / 8);
                if (boxes && pull > 0.001) {
                    const box = boxes[n];
                    const near = pointer.y >= box.top - box.height && pointer.y <= box.bottom + box.height;
                    const distance = near ? ((box.left + box.right) / 2 - pointer.x) / pitch : 9;
                    width += (crestWidth(distance) - width) * pull;
                }
                letter.style.setProperty('--w', clamp(MIN + (width - MIN) * unfold, MIN, MAX).toFixed(1));
                n++;
            }));
            request();
        }
        function setRunning(next) {
            running = next;
            if (!running) { stop(); opened = 1; rest(); }
            labels();
            request();
        }

        // The letters no longer follow the pointer: widening the letter under the cursor moved the next letter under it,
        // which made the line shake, and letting go snapped every letter back at once. The 3D wave answers the pointer instead.
        toggle?.addEventListener('click', () => setRunning(!running));
        reduce.addEventListener('change', event => setRunning(!event.matches));
        document.addEventListener('nw:langchange', labels);
        document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else request(); });
        if ('IntersectionObserver' in root) new root.IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) request(); else stop(); }, { rootMargin: '40px' }).observe(mark);
        root.addEventListener('pageshow', request);

        labels();
        if (opened < 1) letters.forEach(letter => letter.style.setProperty('--w', String(MIN)));
        request();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
