/* NextWave: the second-generation boarding pass. Everything happens in this browser; nothing is sent anywhere.
   The card tilts toward the pointer, and the same design is painted onto a canvas for saving or sharing. */
(function (root) {
    'use strict';
    const MAX_NAME = 16;
    // Control characters, zero-width and bidirectional marks: they hide text or flip its direction.
    const INVISIBLE = /[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

    function sanitizeName(value) {
        if (value === null || value === undefined) return '';
        const clean = String(value).replace(/\s+/g, ' ').replace(INVISIBLE, '').trim();
        return Array.from(clean).slice(0, MAX_NAME).join('');
    }
    // FNV-1a over the cleaned name and the field, folded to four digits.
    function ticketNumber(name, field) {
        const clean = sanitizeName(name);
        if (!clean) return 'NW-02-0000';
        let hash = 0x811c9dc5;
        for (const char of clean + '|' + String(field || '')) {
            hash ^= char.codePointAt(0);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return 'NW-02-' + String(hash % 10000).padStart(4, '0');
    }

    if (typeof module === 'object' && module.exports) { module.exports = { sanitizeName, ticketNumber, MAX_NAME }; return; }
    const document = root.document;
    if (!document) return;

    function init() {
        const form = document.getElementById('ticket-form');
        if (!form || form.dataset.ready === 'true') return;
        form.dataset.ready = 'true';
        const $ = id => document.getElementById(id);
        const input = $('ticket-name'), select = $('ticket-field'), card = $('ticket-card'), status = $('ticket-status');
        const outName = $('ticket-out-name'), outField = $('ticket-out-field'), outNo = $('ticket-out-no');
        const t = key => (root.I18N ? root.I18N.t(key) : key);
        const reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
        const motionOff = () => reduce.matches || document.documentElement.dataset.motion === 'paused';

        function fieldLabel() { return select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent.trim() : ''; }
        function say(message, isError) { status.textContent = message; status.classList.toggle('is-error', !!isError); }
        function render() {
            const name = sanitizeName(input.value);
            outName.textContent = name || t('w1.ticket.empty');
            outName.dataset.empty = String(!name);
            outField.textContent = fieldLabel();
            outNo.textContent = ticketNumber(name, select.value);
            input.removeAttribute('aria-invalid');
            card.setAttribute('aria-label', t('w1.ticket.preview') + (name ? ': ' + name + ', ' + fieldLabel() + ', ' + outNo.textContent : ''));
        }
        function requireName() {
            const name = sanitizeName(input.value);
            if (name) return name;
            input.setAttribute('aria-invalid', 'true');
            say(t('w1.ticket.needName'), true);
            input.focus();
            return '';
        }

        // Paint the pass at 2x so it stays sharp on phones and in stories.
        function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
        function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
        function fit(ctx, text, max, size, weight, family) {
            let px = size;
            do { ctx.font = weight + ' ' + px + 'px ' + family; px -= 2; } while (ctx.measureText(text).width > max && px > 18);
        }
        function paint() {
            const W = 1200, H = 630, S = 2, stub = 250;
            const canvas = document.createElement('canvas');
            canvas.width = W * S; canvas.height = H * S;
            const ctx = canvas.getContext('2d');
            ctx.scale(S, S);
            const sans = css('--font'), display = css('--display');
            ctx.fillStyle = css('--abyss'); ctx.fillRect(0, 0, W, H);
            roundRect(ctx, 40, 40, W - 80, H - 80, 36); ctx.fillStyle = css('--deep'); ctx.fill();
            ctx.save(); roundRect(ctx, 40, 40, W - 80, H - 80, 36); ctx.clip();
            ctx.fillStyle = css('--sky'); ctx.fillRect(W - 40 - stub, 40, stub, H - 80);
            ctx.restore();
            ctx.fillStyle = css('--abyss');
            [[W - 40 - stub, 40], [W - 40 - stub, H - 40]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill(); });
            ctx.setLineDash([10, 10]); ctx.lineWidth = 3; ctx.strokeStyle = css('--tide');
            ctx.beginPath(); ctx.moveTo(W - 40 - stub, 70); ctx.lineTo(W - 40 - stub, H - 70); ctx.stroke(); ctx.setLineDash([]);
            if ('fontStretch' in ctx) ctx.fontStretch = 'ultra-expanded';
            ctx.textBaseline = 'alphabetic';
            ctx.font = '800 34px ' + display; ctx.fillStyle = css('--on-night'); ctx.fillText('NEXT', 96, 128);
            const next = ctx.measureText('NEXT').width; ctx.fillStyle = css('--sky'); ctx.fillText('WAVE', 96 + next, 128);
            ctx.font = '700 20px ' + display; ctx.fillStyle = css('--on-night-3'); ctx.fillText('WAVE 02', 96, 164);
            if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
            const name = sanitizeName(input.value);
            fit(ctx, name, W - 80 - stub - 120, 96, 800, sans); ctx.fillStyle = css('--on-night'); ctx.fillText(name, 96, 360);
            ctx.font = '600 22px ' + sans; ctx.fillStyle = css('--on-night-3');
            ctx.fillText(t('w1.ticket.field'), 96, 470); ctx.fillText(t('w1.ticket.from'), 380, 470);
            ctx.font = '700 30px ' + sans; ctx.fillStyle = css('--on-night');
            ctx.fillText(fieldLabel(), 96, 512); ctx.fillText(t('w1.ticket.campus'), 380, 512);
            ctx.save(); ctx.translate(W - 40 - stub / 2, H / 2); ctx.rotate(Math.PI / 2);
            if ('fontStretch' in ctx) ctx.fontStretch = 'expanded';
            ctx.font = '800 34px ' + display; ctx.fillStyle = css('--abyss'); ctx.textAlign = 'center'; ctx.fillText(outNo.textContent, 0, 12);
            ctx.restore();
            ctx.strokeStyle = css('--abyss'); ctx.lineWidth = 8; ctx.lineCap = 'round';
            ctx.save(); ctx.translate(W - 40 - stub + 65, H - 160); ctx.scale(1, 1);
            ctx.beginPath(); ctx.moveTo(4, 50); ctx.bezierCurveTo(30, 48, 44, 20, 72, 12); ctx.bezierCurveTo(92, 6, 112, 14, 116, 26); ctx.bezierCurveTo(104, 18, 86, 20, 80, 34); ctx.bezierCurveTo(76, 44, 88, 50, 104, 46); ctx.stroke();
            ctx.restore();
            return canvas;
        }
        function toBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('empty canvas')), 'image/png')); }
        function fileName() { return 'nextwave-' + outNo.textContent.toLowerCase() + '.png'; }
        function stamp() { if (motionOff()) return; card.classList.remove('is-stamped'); void card.offsetWidth; card.classList.add('is-stamped'); }
        function download(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = fileName();
            document.body.append(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        }

        async function save(event) {
            event.preventDefault();
            if (!requireName()) return;
            try {
                await (document.fonts ? document.fonts.ready : Promise.resolve());
                download(await toBlob(paint()));
                stamp(); say(t('w1.ticket.saved'));
            } catch (error) { say(t('w1.ticket.failed'), true); }
        }
        async function share() {
            if (!requireName()) return;
            try {
                await (document.fonts ? document.fonts.ready : Promise.resolve());
                const blob = await toBlob(paint());
                const file = typeof File === 'function' ? new File([blob], fileName(), { type: 'image/png' }) : null;
                if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'NextWave 2기', text: t('w1.ticket.shareText') });
                    say(t('w1.ticket.shared'));
                } else {
                    download(blob); say(t('w1.ticket.saved'));
                }
                stamp();
            } catch (error) {
                // Closing the share sheet is not a failure.
                if (error && error.name === 'AbortError') { say(''); return; }
                say(t('w1.ticket.failed'), true);
            }
        }

        // Tilt toward the pointer; let go and it settles back.
        const stage = card.parentElement;
        stage.addEventListener('pointermove', event => {
            if (motionOff() || event.pointerType === 'touch') return;
            const box = card.getBoundingClientRect();
            const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
            card.classList.add('is-tilting');
            card.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg');
            card.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg');
        });
        stage.addEventListener('pointerleave', () => { card.classList.remove('is-tilting'); card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });

        input.addEventListener('input', () => { render(); if (status.classList.contains('is-error')) say(''); });
        select.addEventListener('change', render);
        form.addEventListener('submit', save);
        $('ticket-share').addEventListener('click', share);
        document.addEventListener('nw:langchange', render);
        render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof window === 'undefined' ? globalThis : window);
