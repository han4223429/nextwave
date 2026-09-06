// NextWave — Our next wave. Local interactions; member authentication lives in the portal.
window.NEXTWAVE_SITE = window.NEXTWAVE_SITE || { applyUrl: '', instagram: '', email: '', kakaoUrl: '' };
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const $ = id => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isEnglish = () => window.I18N && window.I18N.lang === 'en';
    const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
    const config = window.NEXTWAVE_SITE;
    function setupLinks() {
        const applyUrl = safeUrl(config.applyUrl);
        $('apply-link').hidden = !applyUrl;
        $('apply-status').hidden = !!applyUrl;
        if (applyUrl) $('apply-link').href = applyUrl;
        [['contact-instagram', config.instagram], ['contact-kakao', config.kakaoUrl]].forEach(([id, url]) => {
            const href = safeUrl(url); if (!href) return;
            $(id).href = href; $(id).target = '_blank'; $(id).rel = 'noopener noreferrer'; $(id).hidden = false;
        });
        if (/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(config.email || '')) {
            $('contact-email').href = 'mailto:' + encodeURIComponent(config.email); $('contact-email').hidden = false;
        }
    }
    setupLinks();

    const menu = $('mobile-menu');
    const menuButton = $('mobile-menu-toggle');
    function closeMenu(restoreFocus = false) { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', isEnglish() ? 'Open menu' : '메뉴 열기'); if (restoreFocus) menuButton.focus(); }
    menuButton.addEventListener('click', () => {
        const open = menu.hidden; menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? (isEnglish() ? 'Close menu' : '메뉴 닫기') : (isEnglish() ? 'Open menu' : '메뉴 열기'));
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));
    document.addEventListener('click', event => { if (!menu.hidden && !event.target.closest('#site-header')) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) closeMenu(true); });
    window.matchMedia('(min-width: 981px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

    const ideas = {
        dev: { ko: [['캠퍼스의 불편함을', '하나의', '서비스로.'], ['작은 아이디어를', '사람들이 쓰는', '앱으로.'], ['매번 하던 반복을', '한 번의', '클릭으로.']], en: [['A campus problem.', 'One useful', 'product.'], ['A small idea.', 'An app people', 'use.'], ['A daily routine.', 'Just one', 'click.']] },
        game: { ko: [['상상 속 세계를', '직접 플레이하는', '게임으로.'], ['심심했던 시간을', '잊지 못할', '한 판으로.'], ['우리만의 이야기를', '누군가의', '모험으로.']], en: [['An imagined world.', 'A game you can', 'play.'], ['An ordinary moment.', 'One memorable', 'round.'], ['A story of our own.', 'Someone’s next', 'adventure.']] },
        hack: { ko: [['지나쳤던 문제를', '밤새 만든', '해결책으로.'], ['서로 다른 전공을', '하나의', '팀으로.'], ['어제의 물음표를', '내일의', '프로토타입으로.']], en: [['An overlooked problem.', 'An overnight', 'solution.'], ['Different majors.', 'One curious', 'team.'], ['Yesterday’s question.', 'Tomorrow’s', 'prototype.']] },
        mkt: { ko: [['아무도 몰랐던 것을', '모두가 궁금한', '브랜드로.'], ['우리가 만든 결과를', '사람들에게 닿는', '이야기로.'], ['작은 반응 하나를', '다음 실험의', '단서로.']], en: [['An unknown idea.', 'A brand worth', 'knowing.'], ['Something we built.', 'A story worth', 'sharing.'], ['One small response.', 'Our next', 'experiment.']] }
    };
    let track = 'dev', variation = 0, attempts = 1;
    function renderIdea(animate = false) {
        const text = ideas[track][isEnglish() ? 'en' : 'ko'][variation];
        $('idea-first').textContent = text[0];
        $('idea-second').replaceChildren(document.createTextNode(text[1] + ' '));
        const em = document.createElement('em'); em.textContent = text[2]; $('idea-second').append(em);
        $('experiment-number').textContent = 'TRY / ' + String(attempts).padStart(3, '0');
        const categories = { dev: 'dev', game: 'gamedev', hack: 'hackathon', mkt: 'marketing' };
        $('track-opportunities').href = 'portal.html?category=' + categories[track];
        const descriptionKey = { dev: 'act.dev.d', game: 'act.game.d', hack: 'act.hack.d', mkt: 'act.mkt.d' }[track];
        $('track-description').textContent = window.I18N ? window.I18N.t(descriptionKey) : '';
        document.querySelector('.track-lab').dataset.track = track;
        document.querySelectorAll('[data-track]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.track === track)));
        if (animate && !reducedMotion.matches && document.documentElement.dataset.motion !== 'paused') { const output = $('idea-output'); output.classList.remove('remixing'); void output.offsetWidth; output.classList.add('remixing'); }
    }
    document.querySelectorAll('[data-track]').forEach(button => button.addEventListener('click', () => { track = button.dataset.track; variation = 0; attempts++; renderIdea(true); }));
    $('idea-remix').addEventListener('click', () => { variation = (variation + 1) % ideas[track].ko.length; attempts++; renderIdea(true); });
    renderIdea();

    const projectTabs = [...document.querySelectorAll('[data-project-tab]')];
    function selectProject(button, moveFocus = false) {
        const selected = button.dataset.projectTab;
        projectTabs.forEach(tab => {
            const active = tab === button;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll('[data-project-panel]').forEach(panel => { panel.hidden = panel.dataset.projectPanel !== selected; });
        if (moveFocus) button.focus({ preventScroll: true });
    }
    projectTabs.forEach((button, index) => {
        button.addEventListener('click', () => selectProject(button));
        button.addEventListener('keydown', event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % projectTabs.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + projectTabs.length) % projectTabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = projectTabs.length - 1;
            else return;
            event.preventDefault(); selectProject(projectTabs[next], true);
        });
    });

    const modal = $('member-modal'); let activeCard;
    function fillProfile(card) {
        $('mm-name').textContent = card.dataset.name || '';
        $('mm-role').textContent = (isEnglish() && card.dataset.roleEn) || card.dataset.role || '';
        $('mm-img').src = card.dataset.img; $('mm-img').alt = card.dataset.name;
        const bio = (isEnglish() && card.dataset.bioEn) || card.dataset.bio || '';
        $('mm-bio').textContent = bio.replace(/<br\s*\/?\s*>/gi, '\n').replace(/^>\s*/gm, '');
        const url = safeUrl(card.dataset.portfolio); $('mm-link').hidden = !url; if (url) $('mm-link').href = url;
    }
    document.querySelectorAll('.member-card').forEach(card => {
        const open = () => { activeCard = card; fillProfile(card); modal.showModal(); document.body.style.overflow = 'hidden'; $('mm-close').focus(); };
        card.addEventListener('click', open); card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
    $('mm-close').addEventListener('click', () => modal.close());
    modal.addEventListener('click', event => { if (event.target === modal) { const box = modal.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close(); } });
    modal.addEventListener('close', () => { document.body.style.overflow = ''; if (activeCard) activeCard.focus(); });
    document.addEventListener('nw:langchange', () => { renderIdea(); setupLinks(); if (modal.open && activeCard) fillProfile(activeCard); });

    let queued = false;
    function updateScroll() {
        queued = false; const distance = document.documentElement.scrollHeight - window.innerHeight;
        $('reading-progress').style.width = (distance > 0 ? Math.min(100, window.scrollY / distance * 100) : 0) + '%';
        if (!reducedMotion.matches && document.documentElement.dataset.motion !== 'paused') {
            const culture = document.querySelector('.culture-words');
            const box = culture.getBoundingClientRect();
            if (box.bottom > 0 && box.top < window.innerHeight) {
                const shift = Math.max(-12, Math.min(12, (box.top / window.innerHeight - .5) * 35));
                culture.style.setProperty('--culture-shift', shift + 'px');
            }
        }
    }
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(updateScroll); } }, { passive: true });
    updateScroll();
    if ('IntersectionObserver' in window) {
        const links = document.querySelectorAll('.desktop-nav .nav-link');
        const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (!entry.isIntersecting) return; links.forEach(link => { if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); }); }, { rootMargin: '-10% 0px -65% 0px' });
        document.querySelectorAll('main section[id]').forEach(section => observer.observe(section));
        const entrance = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('in-view'); entrance.unobserve(entry.target); }
        }), { threshold: .12 });
        document.querySelectorAll('main section:not(#home)').forEach(section => entrance.observe(section));
    }
    $('year').textContent = new Date().getFullYear();
});
