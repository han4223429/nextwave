/* Shared public shell behavior for the club home and opportunity portal. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.nw-site-header');
    const menu = header?.querySelector('#mobile-menu');
    const toggle = header?.querySelector('#mobile-menu-toggle');
    if (!header || !menu || !toggle) return;
    const english = () => document.documentElement.lang === 'en';
    const updateLabel = () => toggle.setAttribute('aria-label', menu.hidden
      ? (english() ? 'Open menu' : '메뉴 열기')
      : (english() ? 'Close menu' : '메뉴 닫기'));
    const close = (focus = false) => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      updateLabel();
      if (focus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
      updateLabel();
    });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
    document.addEventListener('click', event => {
      if (!menu.hidden && !header.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) close(true);
    });
    document.addEventListener('nw:langchange', updateLabel);
    window.matchMedia('(min-width: 781px)').addEventListener('change', event => {
      if (event.matches) close();
    });
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
    updateLabel();
  });
})();
