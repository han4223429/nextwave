/* Shared, gesture-started water feedback for the club site and member portal. */
(function () {
    'use strict';
    function init() {
        const audio = window.NextWaveAudio;
        if (!audio) return;
        const buttons = [...document.querySelectorAll('[data-sound-toggle], #sound-toggle')];
        const english = () => document.documentElement.lang === 'en';
        const toggleSelector = '[data-sound-toggle], #sound-toggle';
        let toastTimer, pendingCue = null, toggleEpoch = 0;
        let sectionTimer, lastSection = '', lastSectionSound = 0, scrollIntentUntil = 0;
        const toast = document.getElementById('sound-toast') || document.getElementById('interaction-toast');

        function update(state = audio.getState()) {
            document.documentElement.dataset.sound = !state.available ? 'unavailable' : state.enabled ? 'on' : 'off';
            buttons.forEach(button => {
                button.disabled = !state.available;
                button.setAttribute('aria-pressed', String(state.available && state.enabled));
                button.setAttribute('aria-label', !state.available ? (english() ? 'Water sounds unavailable in this browser' : '이 브라우저에서는 물결 효과음을 재생할 수 없어요') : english() ? (state.enabled ? 'Mute water sounds' : 'Enable water sounds') : (state.enabled ? '물결 효과음 끄기' : '물결 효과음 켜기'));
                button.title = !state.available ? button.getAttribute('aria-label') : english() ? 'Water sounds · sound begins with your interaction' : '물결 효과음 · 화면을 조작할 때 짧게 들려요';
                const label = button.querySelector('[data-sound-label], #sound-label');
                if (label) label.textContent = !state.available ? 'SOUND —' : state.enabled ? 'SOUND ON' : 'SOUND OFF';
                button.dataset.audioState = state.contextState || 'idle';
                button.dataset.audioMasterGain = String(state.masterGain ?? 0);
                button.dataset.audioCueCount = String(state.cueCount ?? 0);
                button.dataset.audioActiveVoices = String(state.activeVoices ?? 0);
                button.dataset.audioLastCue = state.lastCue || '';
            });
        }
        function announce(ko, en) {
            if (!toast) return;
            clearTimeout(toastTimer); toast.textContent = english() ? en : ko;
            toast.classList.add('show'); toastTimer = setTimeout(() => toast.classList.remove('show'), 2100);
        }
        function unlock() {
            if (!audio.enabled || document.hidden) return Promise.resolve(false);
            return audio.unlock().catch(() => false).finally(() => update());
        }
        function cue(kind) {
            if (!audio.enabled || document.hidden) return;
            const state = audio.getState();
            // A newly resumed context can be running before unlock has opened its output gate.
            if (state.contextState === 'running' && state.masterGain > 0) { audio.play(kind); return; }
            // Keep one current cue while the first gesture resumes audio; never replay a queue.
            const request = { kind };
            pendingCue = request;
            unlock().then(ready => {
                // Late callbacks from a muted/hidden session must not consume a newer cue.
                if (pendingCue !== request) return;
                pendingCue = null;
                if (ready && audio.enabled && !document.hidden) audio.play(request.kind);
            });
        }
        window.NextWaveFeedback = cue;
        audio.subscribe(update);
        update();
        document.addEventListener('nw:langchange', () => update());

        buttons.forEach(button => button.addEventListener('click', async () => {
            const requestEpoch = ++toggleEpoch;
            pendingCue = null;
            audio.setEnabled(!audio.enabled);
            update();
            if (!audio.enabled) { announce('물결 효과음을 껐어요.', 'Water sounds off.'); return; }
            const ready = await unlock();
            if (requestEpoch !== toggleEpoch || document.hidden) return;
            if (ready && audio.enabled) { audio.play('chime'); announce('물방울과 잔잔한 물소리를 켰어요.', 'Water drops and soft wave sounds on.'); }
            else if (audio.enabled) announce('소리를 시작하지 못했어요. 화면을 다시 조작해 주세요.', 'Sound could not start. Interact with the page to try again.');
        }));
        document.addEventListener('pointerdown', event => {
            if (event.isTrusted && !event.target.closest(toggleSelector)) unlock();
        }, { capture: true, passive: true });
        document.addEventListener('keydown', event => {
            if (!event.isTrusted || event.target.closest('input, textarea, [contenteditable=true]')) return;
            if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) unlock();
            if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) scrollIntentUntil = performance.now() + 1300;
        }, { capture: true });
        document.addEventListener('click', event => {
            const target = event.target.closest('button, a, summary, .member-card');
            if (!target || target.closest(toggleSelector) || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
            if (target.matches('[data-lab-mode], #lab-shuffle, [data-mayhem-action]')) return;
            if (target.matches('#rescueDrive')) cue(target.getAttribute('aria-pressed') === 'true' ? 'wave' : 'tap');
            else if (target.matches('[data-project-tab], [data-track], #idea-remix, #rescueExplode, #rescueLaunch, .member-card')) cue('chime');
            else if (target.matches('#opp-refresh, #rescueReset, #mayhem-reset')) cue('ripple');
            else cue('tap');
        });
        document.addEventListener('nw:labchange', event => cue(event.detail?.action === 'ripple' ? 'ripple' : 'wave'));
        document.addEventListener('nw:feedback', event => cue(['fire', 'hit', 'dash'].includes(event.detail?.kind) ? event.detail.kind : 'tap'));

        // One quiet wash at a section boundary during deliberate scrolling, never per tick.
        const sections = [...document.querySelectorAll('main > section[id], #opportunity-board')];
        function currentSection() {
            const marker = window.innerHeight * 0.43;
            return sections.find(section => { const box = section.getBoundingClientRect(); return box.top <= marker && box.bottom > marker; })?.id || '';
        }
        lastSection = currentSection();
        window.addEventListener('wheel', () => { scrollIntentUntil = performance.now() + 1000; }, { passive: true });
        window.addEventListener('touchmove', () => { scrollIntentUntil = performance.now() + 1000; }, { passive: true });
        window.addEventListener('scroll', () => {
            clearTimeout(sectionTimer);
            sectionTimer = setTimeout(() => {
                const next = currentSection(), now = performance.now();
                if (next && next !== lastSection && now < scrollIntentUntil && now - lastSectionSound > 1400 && audio.getState().contextState === 'running') {
                    cue('wave'); lastSectionSound = now;
                }
                if (next) lastSection = next;
            }, 110);
        }, { passive: true });
        function clearPending() { pendingCue = null; toggleEpoch++; clearTimeout(sectionTimer); }
        document.addEventListener('visibilitychange', () => { if (document.hidden) clearPending(); });
        window.addEventListener('pagehide', clearPending);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
