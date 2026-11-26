/* NextWave: small things around the page. The recruitment clock, the reading line, the header edge,
   the record timeline, the founders' pen names, the pointer ring, a note for whoever opens the console,
   and one surge for the old cheat code. Each one stops when motion is paused or reduced. */
(function (root) {
    'use strict';
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

    function countdownParts(target, now) {
        const left = Math.ceil((target - now) / 1000);
        if (!Number.isFinite(left) || left <= 0) return { done: true, days: 0, hours: 0, mins: 0, secs: 0 };
        return { done: false, days: Math.floor(left / 86400), hours: Math.floor(left % 86400 / 3600), mins: Math.floor(left % 3600 / 60), secs: left % 60 };
    }
    // 'none' hides the clock: no start date, an unreadable date, or an end before the start.
    function recruitPhase(start, end, now) {
        const from = start ? Date.parse(start) : NaN;
        if (!Number.isFinite(from)) return { phase: 'none' };
        const to = end ? Date.parse(end) : NaN;
        if (end && (!Number.isFinite(to) || to <= from)) return { phase: 'none' };
        if (now < from) return { phase: 'before', target: from };
        if (!Number.isFinite(to)) return { phase: 'open', target: null };
        if (now < to) return { phase: 'open', target: to };
        return { phase: 'closed' };
    }
    // Keeps the last few keys and compares them with the sequence, so overlapping starts still match.
    function sequenceMatcher(sequence) {
        const want = sequence.map(key => key.toLowerCase());
        let recent = [];
        return function (key) {
            recent.push(String(key || '').toLowerCase());
            if (recent.length > want.length) recent.shift();
            if (recent.length === want.length && recent.every((got, index) => got === want[index])) { recent = []; return true; }
            return false;
        };
    }

    if (typeof module === 'object' && module.exports) { module.exports = { countdownParts, recruitPhase, sequenceMatcher, KONAMI }; return; }
    const document = root.document;
    if (!document) return;

    const html = document.documentElement;
    const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => reduce.matches || html.dataset.motion === 'paused';
    const t = key => (root.I18N ? root.I18N.t(key) : key);
    const $ = id => document.getElementById(id);

    function recruitment() {
        const box = $('recruit-countdown');
        if (!box) return;
        const config = root.NEXTWAVE_SITE || {};
        let timer = 0;
        const pad = value => String(value).padStart(2, '0');
        function tick() {
            const state = recruitPhase(config.recruitStart, config.recruitEnd, Date.now());
            box.hidden = state.phase === 'none' || state.phase === 'closed' || (state.phase === 'open' && !state.target);
            if (box.hidden) { clearInterval(timer); timer = 0; return; }
            $('countdown-label').textContent = t(state.phase === 'before' ? 'w1.cd.before' : 'w1.cd.open');
            const parts = countdownParts(state.target, Date.now());
            $('cd-days').textContent = parts.days; $('cd-hours').textContent = pad(parts.hours); $('cd-mins').textContent = pad(parts.mins); $('cd-secs').textContent = pad(parts.secs);
        }
        tick();
        if (!box.hidden) timer = setInterval(tick, 1000);
        document.addEventListener('nw:langchange', tick);
    }

    // The reading line under the header, and a hairline on the header once the page has moved.
    function progress() {
        const line = document.querySelector('.nw-progress');
        const header = $('site-header');
        let queued = false;
        function update() {
            queued = false;
            const max = html.scrollHeight - root.innerHeight;
            if (line) line.style.setProperty('--progress', max > 0 ? Math.min(1, root.scrollY / max).toFixed(4) : '0');
            if (header) header.classList.toggle('is-scrolled', root.scrollY > 8);
            drawRecord();
        }
        root.addEventListener('scroll', () => { if (!queued) { queued = true; root.requestAnimationFrame(update); } }, { passive: true });
        root.addEventListener('resize', update);
        update();
    }

    // Record timeline: the wave line spans the whole track and draws as you scroll through it.
    let drawRecord = () => {};
    function record() {
        const track = $('record-track');
        if (!track) return;
        const list = track.querySelector('.record-list');
        function size() { track.style.setProperty('--track-w', track.scrollWidth + 'px'); }
        drawRecord = () => {
            const max = track.scrollWidth - track.clientWidth;
            const across = max > 0 ? track.scrollLeft / max : 1;
            const box = track.getBoundingClientRect();
            const into = Math.min(1, Math.max(0, (root.innerHeight - box.top) / (root.innerHeight * 0.9)));
            track.style.setProperty('--drawn', Math.min(1, 0.12 + into * 0.28 + across * 0.6).toFixed(4));
        };
        track.addEventListener('scroll', () => root.requestAnimationFrame(drawRecord), { passive: true });
        document.querySelectorAll('[data-record-step]').forEach(button => button.addEventListener('click', () => {
            const item = list.firstElementChild;
            const step = item ? item.getBoundingClientRect().width + 24 : 300;
            track.scrollBy({ left: Number(button.dataset.recordStep) * step, behavior: still() ? 'auto' : 'smooth' });
        }));
        // Vertical wheel over the timeline moves it sideways until either end, then the page scrolls on.
        track.addEventListener('wheel', event => {
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
            const max = track.scrollWidth - track.clientWidth;
            const next = track.scrollLeft + event.deltaY;
            if ((event.deltaY < 0 && track.scrollLeft <= 0) || (event.deltaY > 0 && track.scrollLeft >= max - 1)) return;
            event.preventDefault();
            track.scrollLeft = Math.max(0, Math.min(max, next));
        }, { passive: false });
        size(); drawRecord();
        root.addEventListener('resize', size);
        document.addEventListener('nw:langchange', () => { size(); drawRecord(); });
    }

    // Founders: pen names are written once the row comes into view, and the cards lean toward the pointer.
    function founders() {
        const list = document.querySelector('.founder-list');
        if (!list) return;
        if (!('IntersectionObserver' in root) || still()) list.classList.add('is-written');
        else {
            const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { list.classList.add('is-written'); observer.disconnect(); } }, { threshold: 0.35 });
            observer.observe(list);
        }
        list.querySelectorAll('.member-card').forEach(card => {
            card.addEventListener('pointermove', event => {
                if (still() || event.pointerType === 'touch') return;
                const box = card.getBoundingClientRect();
                card.classList.add('is-tilting');
                card.style.setProperty('--ry', (((event.clientX - box.left) / box.width - 0.5) * 10).toFixed(2) + 'deg');
                card.style.setProperty('--rx', ((0.5 - (event.clientY - box.top) / box.height) * 8).toFixed(2) + 'deg');
            });
            card.addEventListener('pointerleave', () => { card.classList.remove('is-tilting'); card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
        });
    }

    function cursor() {
        if (!root.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const ring = document.createElement('div');
        ring.className = 'nw-cursor'; ring.setAttribute('aria-hidden', 'true');
        document.body.append(ring);
        let x = -100, y = -100, cx = -100, cy = -100, raf = 0;
        const hot = 'a, button, [role=button], [role=tab], summary, select, input, label, canvas';
        function frame() {
            raf = 0;
            cx += (x - cx) * 0.28; cy += (y - cy) * 0.28;
            ring.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
            if (Math.abs(x - cx) + Math.abs(y - cy) > 0.3) raf = root.requestAnimationFrame(frame);
        }
        document.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse' || still()) { ring.classList.remove('is-on'); return; }
            x = event.clientX; y = event.clientY;
            ring.classList.add('is-on');
            ring.classList.toggle('is-hot', !!(event.target.closest && event.target.closest(hot)));
            if (!raf) raf = root.requestAnimationFrame(frame);
        }, { passive: true });
        document.addEventListener('pointerleave', () => ring.classList.remove('is-on'));
        root.addEventListener('blur', () => ring.classList.remove('is-on'));
    }

    function surge() {
        const match = sequenceMatcher(KONAMI);
        let busy = false;
        document.addEventListener('keydown', event => {
            const field = event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable], canvas');
            if (field || !match(event.key) || busy) return;
            const toast = $('interaction-toast');
            if (still()) {
                if (toast) { toast.textContent = t('w1.surge'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); }
                return;
            }
            busy = true;
            const layer = document.createElement('div');
            layer.className = 'nw-surge'; layer.setAttribute('aria-hidden', 'true');
            layer.innerHTML = '<svg viewBox="0 0 1200 1200" preserveAspectRatio="none"><path d="M0 260 C 300 120 600 360 900 220 S 1200 200 1200 200 V1200 H0Z"/><path d="M0 340 C 280 220 620 440 920 300 S 1200 300 1200 300 V1200 H0Z"/><path d="M0 420 C 320 300 580 520 900 380 S 1200 390 1200 390 V1200 H0Z"/><path d="M0 500 C 300 400 600 600 920 460 S 1200 470 1200 470 V1200 H0Z"/></svg><p></p>';
            layer.querySelector('p').textContent = 'WAVE 02';
            document.body.append(layer);
            if (toast) { toast.textContent = t('w1.surge'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
            setTimeout(() => { layer.remove(); busy = false; }, 1900);
        });
    }

    function consoleNote() {
        const art = [
            '  _   _ _______  _______  __        ___ __     _______ ',
            ' | \\ | | ____\\ \\/ /_   _| \\ \\      / / \\\\ \\   / / ____|',
            ' |  \\| |  _|  \\  /  | |    \\ \\ /\\ / / _ \\\\ \\ / /|  _|  ',
            ' | |\\  | |___ /  \\  | |     \\ V  V / ___ \\\\ V / | |___ ',
            ' |_| \\_|_____/_/\\_\\ |_|      \\_/\\_/_/   \\_\\\\_/  |_____|'
        ].join('\n');
        try {
            root.console.log('%c' + art, 'color:' + getComputedStyle(html).getPropertyValue('--sky').trim() + ';font-family:monospace;font-weight:700');
            root.console.log('%c' + t('w1.console'), 'font-size:14px;font-weight:700');
        } catch (error) { /* Some embedded browsers have no console. */ }
    }

    // Club footage band. Shown only when a clip is configured. It loads when it comes near the screen,
    // plays muted only while visible, never plays with reduced motion, data saver or the pause switch,
    // and has its own pause button (anything that moves for more than five seconds needs one).
    function reel() {
        const band = $('reel'), video = $('reel-video'), toggle = $('reel-toggle');
        const clip = ((root.NEXTWAVE_SITE || {}).reel) || {};
        // An empty value must stay empty: new URL('', page) would quietly resolve to the page itself.
        const safe = value => { if (typeof value !== 'string' || !value.trim()) return ''; try { const url = new URL(value, root.location.href); return url.origin === root.location.origin || url.protocol === 'https:' ? url.href : ''; } catch (error) { return ''; } };
        const mp4 = safe(clip.mp4 || '');
        if (!band || !video || !mp4) return;
        const saveData = navigator.connection && navigator.connection.saveData;
        let userPaused = false, loaded = false, inView = false;
        band.hidden = false;
        if (clip.poster && safe(clip.poster)) video.poster = safe(clip.poster);
        $('reel-caption').textContent = clip.caption || '';
        function label() {
            const playing = !video.paused;
            toggle.setAttribute('aria-pressed', String(!playing));
            $('reel-toggle-label').textContent = t(playing ? 'w1.reel.pause' : 'w1.reel.play');
        }
        function load() {
            if (loaded) return;
            loaded = true;
            const webm = safe(clip.webm || '');
            if (webm) { const source = document.createElement('source'); source.src = webm; source.type = 'video/webm'; video.append(source); }
            const source = document.createElement('source'); source.src = mp4; source.type = 'video/mp4'; video.append(source);
            video.load();
        }
        function sync() {
            const allowed = inView && !userPaused && !still() && !saveData && !document.hidden;
            if (allowed) { load(); const attempt = video.play(); if (attempt && attempt.catch) attempt.catch(() => label()); }
            else if (!video.paused) video.pause();
            label();
        }
        video.addEventListener('play', label); video.addEventListener('pause', label);
        toggle.addEventListener('click', () => { userPaused = !video.paused; if (userPaused) video.pause(); else { load(); video.play().catch(() => {}); } label(); });
        if ('IntersectionObserver' in root) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; if (inView) load(); sync(); }, { rootMargin: '200px 0px' }).observe(band);
        else { inView = true; sync(); }
        document.addEventListener('visibilitychange', sync);
        reduce.addEventListener('change', sync);
        new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
        document.addEventListener('nw:langchange', label);
        label();
    }

    function init() {
        reel();
        recruitment();
        record();
        progress();
        founders();
        cursor();
        surge();
        consoleNote();
        const year = (root.NEXTWAVE_SITE || {}).foundedYear;
        const label = $('founded-year');
        if (label && /^\d{4}$/.test(String(year || ''))) label.textContent = String(year);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
