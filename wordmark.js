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
        let opened = reduce.matches || document.hidden ? 1 : 0, pointer = null, pull = 0, lastRows = null;
        const aim = { x: 0, y: 0 };

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
            // The pointer is placed on each line by the line's own box, not by the letters' boxes. The widths are then
            // balanced so every line keeps its total width: the line never grows or shifts, so the letter under the
            // pointer stays under it and nothing shakes.
            const rows = pointer ? lines.map(line => line[0].parentElement.getBoundingClientRect()) : null;
            opened = Math.min(1, opened + elapsed / 1.1);
            // Rise quickly toward the pointer, settle back slowly when it leaves.
            pull += ((pointer ? 1 : 0) - pull) * (1 - Math.exp(-delta * (pointer ? 7 : 1.6)));
            if (pointer) { aim.x += (pointer.x - aim.x) * (1 - Math.exp(-delta * 14)); aim.y = pointer.y; }
            const unfold = 1 - (1 - opened) ** 3;
            lines.forEach((line, row) => {
                const count = line.length;
                let widths = line.map((letter, index) => waveWidth(time, index, count, row * TAU / 8));
                if (pull > 0.001 && (rows || lastRows)) {
                    const box = (rows || lastRows)[row];
                    const near = aim.y >= box.top - box.height * 0.8 && aim.y <= box.bottom + box.height * 0.8;
                    const at = (aim.x - box.left) / box.width * count - 0.5;
                    const strength = near ? pull : 0;
                    widths = widths.map((width, index) => width + (crestWidth(index - at) - width) * strength);
                    // Hold the line's total width: share the difference across the letters, inside the font's range.
                    for (let pass = 0; pass < 3; pass++) {
                        const shift = (REST * count - widths.reduce((sum, width) => sum + width, 0)) / count;
                        widths = widths.map(width => clamp(width + shift, MIN, MAX));
                    }
                }
                line.forEach((letter, index) => letter.style.setProperty('--w', clamp(MIN + (widths[index] - MIN) * unfold, MIN, MAX).toFixed(1)));
            });
            if (rows) lastRows = rows;
            request();
        }
        function setRunning(next) {
            running = next;
            if (!running) { stop(); opened = 1; rest(); }
            labels();
            request();
        }

        // The whole hero listens, so the crest starts as the pointer comes near the letters, not only on top of them.
        const zone = mark.closest('.hero') || mark;
        zone.addEventListener('pointermove', event => { if (!pointer) { aim.x = event.clientX; } pointer = { x: event.clientX, y: event.clientY }; request(); });
        zone.addEventListener('pointerdown', event => { aim.x = event.clientX; pointer = { x: event.clientX, y: event.clientY }; request(); });
        ['pointerleave', 'pointercancel'].forEach(name => zone.addEventListener(name, () => { pointer = null; }));
        zone.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') pointer = null; });
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
