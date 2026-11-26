/* NextWave: quick move. ⌘K or Ctrl+K (or the header button) opens a list of places and switches.
   Type to filter, arrows to choose, Enter to go, Esc to close. Built on <dialog>, so focus stays inside while it is open. */
(function (root) {
    'use strict';
    const document = root.document;
    if (!document) return;

    function init() {
        if (document.getElementById('cmdk')) return;
        const t = key => (root.I18N ? root.I18N.t(key) : key);
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
        document.querySelectorAll('[data-cmdk-key]').forEach(key => { key.textContent = isMac ? '⌘K' : 'Ctrl K'; });
        const onHome = !!document.getElementById('home');
        const here = onHome ? '' : 'index.html';

        // Each command: group, i18n key for its name, a hint, and what it does.
        const commands = [
            { group: 'w1.cmdk.go', key: 'stitch.nav.about', hint: '#about', go: here + '#about' },
            { group: 'w1.cmdk.go', key: 'w1.founders.title', hint: '#team', go: here + '#team' },
            { group: 'w1.cmdk.go', key: 'motion.nav.projects', hint: '#projects', go: here + '#projects' },
            { group: 'w1.cmdk.go', key: 'w1.record.title', hint: '#awards', go: here + '#awards' },
            { group: 'w1.cmdk.go', key: 'nx.tracks.title', hint: '#activities', go: here + '#activities' },
            { group: 'w1.cmdk.go', key: 'w1.ticket.title', hint: '#ticket', go: here + '#ticket' },
            { group: 'w1.cmdk.go', key: 'stitch.nav.join', hint: '#recruitment', go: here + '#recruitment' },
            { group: 'w1.cmdk.go', key: 'faq.title', hint: '#faq', go: here + '#faq' },
            { group: 'w1.cmdk.go', key: 'stitch.nav.calls', hint: 'portal.html', go: 'portal.html' },
            { group: 'w1.cmdk.go', key: 'stitch.nav.member', hint: 'portal.html', go: 'portal.html#member-access' },
            { group: 'w1.cmdk.do', key: 'w1.cmdk.lang', hint: 'EN / 한국어', run: () => root.I18N && root.I18N.toggle(), when: () => !!document.querySelector('[data-lang-toggle]') },
            { group: 'w1.cmdk.do', key: 'w1.cmdk.sound', hint: 'SOUND', run: () => { const button = document.querySelector('[data-sound-toggle]'); if (button) button.click(); } },
            { group: 'w1.cmdk.do', key: 'w1.cmdk.motion', hint: 'MOTION', run: () => { const button = document.getElementById('motion-toggle'); if (button) button.click(); }, when: () => !!document.getElementById('motion-toggle') },
            { group: 'w1.cmdk.do', key: 'nx.footer.top', hint: 'Top', run: () => root.scrollTo({ top: 0, behavior: 'smooth' }) }
        ];

        const dialog = document.createElement('dialog');
        dialog.id = 'cmdk'; dialog.className = 'cmdk';
        dialog.setAttribute('aria-labelledby', 'cmdk-title');
        dialog.innerHTML = '<h2 id="cmdk-title" class="sr-only"></h2>' +
            '<div class="cmdk-field"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2"/></svg>' +
            '<input id="cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" /></div>' +
            '<div id="cmdk-list" class="cmdk-list" role="listbox"></div>' +
            '<p class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd></span><span><kbd>Enter</kbd></span><span><kbd>Esc</kbd></span></p>';
        document.body.append(dialog);
        const input = dialog.querySelector('#cmdk-input'), list = dialog.querySelector('#cmdk-list'), title = dialog.querySelector('#cmdk-title');
        let shown = [], active = 0, opener = null;

        const normalize = value => String(value).toLowerCase().replace(/\s+/g, '');
        function render() {
            const query = normalize(input.value);
            shown = commands.filter(command => (!command.when || command.when()) && (!query || normalize(t(command.key) + command.hint).includes(query)));
            active = Math.min(active, Math.max(0, shown.length - 1));
            list.replaceChildren();
            if (!shown.length) {
                const empty = document.createElement('p'); empty.className = 'cmdk-empty'; empty.textContent = t('w1.cmdk.empty');
                list.append(empty); input.removeAttribute('aria-activedescendant'); return;
            }
            let group = '';
            shown.forEach((command, index) => {
                if (command.group !== group) {
                    group = command.group;
                    const heading = document.createElement('p'); heading.className = 'cmdk-group'; heading.textContent = t(group); heading.setAttribute('aria-hidden', 'true');
                    list.append(heading);
                }
                const item = document.createElement('button');
                item.type = 'button'; item.className = 'cmdk-item'; item.id = 'cmdk-item-' + index; item.tabIndex = -1;
                item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === active));
                const name = document.createElement('span'); name.textContent = t(command.key).replace(/<[^>]+>/g, ' ');
                const hint = document.createElement('small'); hint.textContent = command.hint;
                item.append(name, hint);
                item.addEventListener('click', () => choose(index));
                item.addEventListener('pointermove', () => { if (active !== index) { active = index; mark(); } });
                list.append(item);
            });
            mark();
        }
        function mark() {
            list.querySelectorAll('.cmdk-item').forEach((item, index) => item.setAttribute('aria-selected', String(index === active)));
            const current = list.querySelector('#cmdk-item-' + active);
            if (current) { input.setAttribute('aria-activedescendant', current.id); current.scrollIntoView({ block: 'nearest' }); }
        }
        function choose(index) {
            const command = shown[index];
            if (!command) return;
            dialog.close();
            if (command.run) { command.run(); return; }
            const target = command.go;
            if (target.startsWith('#')) {
                const section = document.querySelector(target);
                if (section) { section.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', target); section.setAttribute('tabindex', '-1'); section.focus({ preventScroll: true }); }
            } else root.location.href = target;
        }
        function open() {
            if (dialog.open) return;
            opener = document.activeElement;
            title.textContent = t('w1.cmdk.button');
            input.placeholder = t('w1.cmdk.placeholder');
            input.setAttribute('aria-label', t('w1.cmdk.placeholder'));
            input.value = ''; active = 0; render();
            dialog.showModal(); input.focus();
        }

        input.addEventListener('input', () => { active = 0; render(); });
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); if (shown.length) { active = (active + 1) % shown.length; mark(); } }
            else if (event.key === 'ArrowUp') { event.preventDefault(); if (shown.length) { active = (active - 1 + shown.length) % shown.length; mark(); } }
            else if (event.key === 'Home') { event.preventDefault(); active = 0; mark(); }
            else if (event.key === 'End') { event.preventDefault(); active = Math.max(0, shown.length - 1); mark(); }
            else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
        });
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => { if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true }); });
        document.querySelectorAll('[data-cmdk-open]').forEach(button => button.addEventListener('click', open));
        document.addEventListener('keydown', event => {
            if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); if (dialog.open) dialog.close(); else open(); }
        });
        document.addEventListener('nw:langchange', () => { if (dialog.open) { input.placeholder = t('w1.cmdk.placeholder'); render(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(window);
