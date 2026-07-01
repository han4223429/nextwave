// =============================================================================
// NextWave IT Union — UI interactions (2026 bright redesign)
// =============================================================================

// -----------------------------------------------------------------------------
// 사이트 설정 — 여기 값만 채우면 버튼/링크가 자동 연결됩니다.
//   applyUrl  : 지원서 링크(구글폼·노션 등). 비워두면 '지원하기'가 모집 안내로 스크롤됩니다.
//   instagram : 인스타그램 프로필 URL (비우면 버튼 숨김)
//   email     : 문의 이메일 (비우면 버튼 숨김)
//   kakaoUrl  : 카카오 오픈채팅 링크 (비우면 버튼 숨김)
// -----------------------------------------------------------------------------
window.NEXTWAVE_SITE = window.NEXTWAVE_SITE || {
    applyUrl: '',
    instagram: '',
    email: '',
    kakaoUrl: ''
};

document.addEventListener('DOMContentLoaded', function () {
    const CFG = window.NEXTWAVE_SITE;

    function safeExternalUrl(url) {
        if (!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '';
        } catch (e) {
            return '';
        }
    }

    // --- 지원하기 버튼 연결 ---------------------------------------------------
    document.querySelectorAll('[data-apply]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            const applyUrl = safeExternalUrl(CFG.applyUrl);
            if (applyUrl) {
                window.open(applyUrl, '_blank', 'noopener,noreferrer');
            } else {
                e.preventDefault();
                const target = document.getElementById('recruitment');
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // --- 연락 채널 버튼 (있을 때만 표시) -------------------------------------
    function wireContact(id, url, isMail) {
        const el = document.getElementById(id);
        if (!el) return;
        if (url) {
            const safeUrl = isMail ? ('mailto:' + url) : safeExternalUrl(url);
            if (!safeUrl) {
                el.classList.add('hidden');
                return;
            }
            el.href = safeUrl;
            if (!isMail) {
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
            }
        } else {
            el.classList.add('hidden');
        }
    }
    wireContact('contact-instagram', CFG.instagram, false);
    wireContact('contact-email', CFG.email, true);
    wireContact('contact-kakao', CFG.kakaoUrl, false);

    // --- 모바일 메뉴 ---------------------------------------------------------
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuClose = document.getElementById('mobile-menu-close');

    function setMenu(open) {
        if (!mobileMenu) return;
        mobileMenu.classList.toggle('translate-x-full', !open);
        mobileMenu.classList.toggle('translate-x-0', open);
        mobileMenu.setAttribute('aria-hidden', String(!open));
        if (menuToggle) menuToggle.setAttribute('aria-expanded', String(open));
        document.body.style.overflow = open ? 'hidden' : '';
    }
    if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    if (menuToggle) menuToggle.addEventListener('click', () => setMenu(true));
    if (menuClose) menuClose.addEventListener('click', () => setMenu(false));
    document.querySelectorAll('.mobile-nav-link').forEach(function (link) {
        link.addEventListener('click', () => setMenu(false));
    });

    // --- 스크롤 시 헤더 그림자 -----------------------------------------------
    const header = document.getElementById('site-header');
    function onScrollHeader() {
        if (!header) return;
        header.classList.toggle('shadow-lg', window.scrollY > 16);
        header.classList.toggle('shadow-indigo-100', window.scrollY > 16);
    }
    onScrollHeader();
    window.addEventListener('scroll', onScrollHeader, { passive: true });

    // --- 액티브 내비게이션 하이라이트 ---------------------------------------
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    if (sections.length) {
        const navObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    navLinks.forEach(function (link) {
                        link.classList.toggle(
                            'nav-link-active',
                            link.getAttribute('href') === '#' + id
                        );
                    });
                }
            });
        }, { rootMargin: '-30% 0px -65% 0px', threshold: 0 });
        sections.forEach((s) => navObserver.observe(s));
    }

    // --- 스크롤 리빌 ---------------------------------------------------------
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length) {
        const revealObserver = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
        revealEls.forEach((el) => revealObserver.observe(el));
    }

    // --- 숫자 카운트업 -------------------------------------------------------
    const counters = document.querySelectorAll('[data-count]');
    if (counters.length) {
        const countObserver = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = parseFloat(el.getAttribute('data-count'));
                const suffix = el.getAttribute('data-suffix') || '';
                const decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
                const duration = 1400;
                const start = performance.now();
                function tick(now) {
                    const p = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - p, 3);
                    const val = target * eased;
                    el.textContent = val.toFixed(decimals) + suffix;
                    if (p < 1) requestAnimationFrame(tick);
                    else el.textContent = target.toFixed(decimals) + suffix;
                }
                requestAnimationFrame(tick);
                obs.unobserve(el);
            });
        }, { threshold: 0.5 });
        counters.forEach((c) => countObserver.observe(c));
    }

    // --- FAQ 아코디언 --------------------------------------------------------
    document.querySelectorAll('.faq-item').forEach(function (item, i) {
        const btn = item.querySelector('.faq-trigger');
        const ans = item.querySelector('.faq-answer');
        if (!btn) return;
        if (ans && !ans.id) ans.id = 'faq-answer-' + (i + 1);
        btn.setAttribute('aria-expanded', 'false');
        if (ans) btn.setAttribute('aria-controls', ans.id);
        btn.addEventListener('click', function () {
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item.open').forEach(function (o) {
                o.classList.remove('open');
                const t = o.querySelector('.faq-trigger');
                if (t) t.setAttribute('aria-expanded', 'false');
            });
            if (!isOpen) {
                item.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // --- 맨 위로 버튼 --------------------------------------------------------
    const toTop = document.getElementById('to-top');
    if (toTop) {
        function toTopThreshold() {
            const hero = document.getElementById('hero-stage');
            if (!hero) return 600;
            return Math.max(600, hero.offsetTop + hero.offsetHeight - window.innerHeight * 0.5);
        }
        window.addEventListener('scroll', function () {
            toTop.classList.toggle('show', window.scrollY > toTopThreshold());
        }, { passive: true });
        toTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- 운영진 프로필 모달 --------------------------------------------------
    const modal = document.getElementById('member-modal');
    const modalBackdrop = document.getElementById('member-modal-backdrop');
    const modalCard = document.getElementById('member-modal-card');
    const modalImg = document.getElementById('mm-img');
    const modalName = document.getElementById('mm-name');
    const modalRole = document.getElementById('mm-role');
    const modalBio = document.getElementById('mm-bio');
    const modalLink = document.getElementById('mm-link');
    const modalClose = document.getElementById('mm-close');

    function openModal(card) {
        if (!modal) return;
        const en = window.I18N && window.I18N.lang === 'en';
        const name = card.getAttribute('data-name') || '';
        const role = (en && card.getAttribute('data-role-en')) || card.getAttribute('data-role') || '';
        const img = card.getAttribute('data-img') || '';
        const bio = (en && card.getAttribute('data-bio-en')) || card.getAttribute('data-bio') || '';
        const portfolio = card.getAttribute('data-portfolio') || '';

        if (modalName) modalName.textContent = name;
        if (modalRole) modalRole.textContent = role;
        if (modalImg) { modalImg.src = img; modalImg.alt = name; }
        if (modalBio) modalBio.innerHTML = bio.split('<br>').map(function (line) {
            const div = document.createElement('div');
            div.textContent = line;
            return div.innerHTML;
        }).join('<br>');
        if (modalLink) {
            if (portfolio && portfolio !== '#') {
                modalLink.href = portfolio;
                modalLink.classList.remove('hidden');
            } else {
                modalLink.classList.add('hidden');
            }
        }
        modal.classList.remove('hidden');
        modal.offsetHeight; // reflow
        if (modalBackdrop) modalBackdrop.classList.add('opacity-100');
        if (modalCard) {
            modalCard.classList.remove('opacity-0', 'scale-95');
            modalCard.classList.add('opacity-100', 'scale-100');
        }
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modal) return;
        if (modalBackdrop) modalBackdrop.classList.remove('opacity-100');
        if (modalCard) {
            modalCard.classList.add('opacity-0', 'scale-95');
            modalCard.classList.remove('opacity-100', 'scale-100');
        }
        setTimeout(function () {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }, 250);
    }

    document.querySelectorAll('.member-card').forEach(function (card) {
        card.addEventListener('click', () => openModal(card));
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(card); }
        });
    });
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
    });

    // --- 현재 연도 푸터 ------------------------------------------------------
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});
