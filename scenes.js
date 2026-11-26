/* NextWave: scroll scenes.
   - [data-scene]: a tall block whose inner part stays pinned while you scroll through it. Progress 0..1 goes to --p.
     The hero zooms into the name and the wave; the "1기" block grows its 1 until it fills the screen.
   - [data-zoom]: grows into place as it comes up the screen (--z 0..1).
   - Reveals: headings slide up out of a mask, groups rise one after another as they come into view.
   With reduced motion or the pause switch, html gets .scenes-off: blocks shrink to normal height and everything shows. */
(function (root) {
    'use strict';
    const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
    // Progress through a pinned block: 0 when its top meets the header, 1 when its bottom meets the screen's bottom.
    function sceneProgress(top, height, viewport, offset = 0) {
        const travel = height - (viewport - offset);
        return travel > 0 ? clamp((offset - top) / travel) : 0;
    }
    // Growth of a zoom block: 0 while below the screen, 1 once its top reaches a quarter of the way down.
    function zoomProgress(top, viewport) { return clamp((viewport - top) / (viewport * 0.75)); }
    if (typeof module === 'object' && module.exports) { module.exports = { sceneProgress, zoomProgress }; return; }
    const document = root.document;
    if (!document) return;

    const html = document.documentElement;
    const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
    const off = () => reduce.matches || html.dataset.motion === 'paused';
    const MASK = '.section-head h2, .ticket-copy h2, .founders-copy h2, .hero-title';
    const RISE = ['.section-head p', '.about-grid > p', '.intro-side', '.field-panels', '.founders-facts > div', '.founder-list > li', '.founders-note',
        '.project-tabs', '.record-track', '.track-lab', '.ticket-form', '.ticket-stage', '.join-facts > div', '.join-steps li', '.join-apply', '.faq-item'];

    function init() {
        const scenes = [...document.querySelectorAll('[data-scene]')];
        const zooms = [...document.querySelectorAll('[data-zoom]')];
        let queued = false;

        // Tag what reveals, with a small stagger among siblings.
        document.querySelectorAll(MASK).forEach(element => { element.dataset.reveal = 'mask'; });
        RISE.forEach(selector => document.querySelectorAll(selector).forEach(element => {
            if (element.dataset.reveal) return;
            element.dataset.reveal = 'rise';
            const index = [...element.parentElement.children].filter(sibling => sibling.matches(selector)).indexOf(element);
            element.style.setProperty('--d', Math.min(0.48, Math.max(0, index) * 0.08).toFixed(2) + 's');
        }));
        const revealed = [...document.querySelectorAll('[data-reveal]')];
        function showAll() { revealed.forEach(element => element.classList.add('is-in')); }
        if ('IntersectionObserver' in root) {
            // A masked heading is clipped to nothing, and a clipped element never counts as visible.
            // So headings are watched through their parent, which is not clipped.
            const watched = new Map();
            revealed.forEach(element => {
                const anchor = element.dataset.reveal === 'mask' ? element.parentElement : element;
                if (!watched.has(anchor)) watched.set(anchor, []);
                watched.get(anchor).push(element);
            });
            const observer = new IntersectionObserver(entries => entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                watched.get(entry.target).forEach(element => element.classList.add('is-in'));
                observer.unobserve(entry.target);
            }), { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
            watched.forEach((elements, anchor) => observer.observe(anchor));
        } else showAll();

        function update() {
            queued = false;
            if (off()) return;
            const viewport = root.innerHeight;
            const header = parseFloat(getComputedStyle(html).getPropertyValue('--header-h')) || 64;
            scenes.forEach(scene => {
                const box = scene.getBoundingClientRect();
                if (box.bottom < -viewport || box.top > viewport * 2) return;
                scene.style.setProperty('--p', sceneProgress(box.top, box.height, viewport, header).toFixed(4));
            });
            zooms.forEach(zoom => { const box = zoom.getBoundingClientRect(); zoom.style.setProperty('--z', zoomProgress(box.top, viewport).toFixed(4)); });
        }
        function schedule() { if (!queued) { queued = true; root.requestAnimationFrame(update); } }
        function mode() {
            const wasOff = html.classList.contains('scenes-off');
            html.classList.toggle('scenes-off', off());
            if (off()) { showAll(); scenes.concat(zooms).forEach(element => { element.style.removeProperty('--p'); element.style.removeProperty('--z'); }); }
            else update();
            if (wasOff !== off()) root.dispatchEvent(new Event('resize'));
        }
        root.addEventListener('scroll', schedule, { passive: true });
        root.addEventListener('resize', schedule);
        reduce.addEventListener('change', mode);
        new MutationObserver(mode).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
        mode();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
