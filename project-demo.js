/* MAYHEM style-score web experiment, not the original game or a Unity port.
 * Published rule: https://hakjulee.com/ — kills + sum((multikills - 1) * style).
 * Movement, controls, timings, targets and visuals below are original demo design.
 */
(function (root) {
    'use strict';
    const WIDTH = 960;
    const HEIGHT = 540;
    const ROUND_SECONDS = 30;
    const SHOT_COOLDOWN = 0.35;
    const DASH_COOLDOWN = 1.4;
    const DASH_STYLE_SECONDS = 0.7;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function multikillScore(count, style) {
        if (!Number.isInteger(count) || count < 0 || !Number.isFinite(style) || style < 1) {
            throw new RangeError('Invalid elimination count or style');
        }
        return count === 0 ? 0 : count + Math.max(0, count - 1) * style;
    }

    class Arena {
        constructor(seed) {
            this.initialSeed = (seed || 74261) >>> 0;
            this.reset();
        }
        random() {
            this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
            return this.seed / 4294967296;
        }
        reset() {
            this.seed = this.initialSeed;
            this.state = 'idle';
            this.remaining = ROUND_SECONDS;
            this.score = 0;
            this.kills = 0;
            this.combo = 0;
            this.bestCombo = 0;
            this.shotCooldown = 0;
            this.dashCooldown = 0;
            this.styleRemaining = 0;
            this.effects = [];
            this.lastShot = null;
            this.player = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, dx: 1, dy: 0 };
            this.targets = [];
            const centers = [[230, 150], [695, 150], [710, 395], [235, 400]];
            centers.forEach((center, group) => {
                for (let n = 0; n < 3; n += 1) {
                    const angle = n * Math.PI * 2 / 3;
                    this.targets.push({ id: group * 3 + n, x: center[0] + Math.cos(angle) * 24,
                        y: center[1] + Math.sin(angle) * 24, alive: true, respawn: 0, phase: this.random() * 6 });
                }
            });
        }
        start() {
            if (this.state === 'ended') this.reset();
            this.state = 'running';
        }
        pause() {
            if (this.state === 'running') this.state = 'paused';
            this.player.vx = 0;
            this.player.vy = 0;
        }
        dash(direction) {
            if (this.state !== 'running' || this.dashCooldown > 0) return false;
            let dx = direction && direction.x || this.player.dx;
            let dy = direction && direction.y || this.player.dy;
            if (direction && (direction.x || direction.y)) { dx = direction.x; dy = direction.y; }
            const length = Math.hypot(dx, dy) || 1;
            this.player.dx = dx / length;
            this.player.dy = dy / length;
            this.player.vx = this.player.dx * 790;
            this.player.vy = this.player.dy * 790;
            this.styleRemaining = DASH_STYLE_SECONDS;
            this.dashCooldown = DASH_COOLDOWN;
            return true;
        }
        nearestTarget() {
            return this.targets.filter(target => target.alive).reduce((nearest, target) => {
                const distance = Math.hypot(target.x - this.player.x, target.y - this.player.y);
                return !nearest || distance < nearest.distance ? { x: target.x, y: target.y, distance } : nearest;
            }, null);
        }
        fire(x, y) {
            if (this.state !== 'running' || this.shotCooldown > 0 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
            this.shotCooldown = SHOT_COOLDOWN;
            let dx = x - this.player.x;
            let dy = y - this.player.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 350) { dx *= 350 / distance; dy *= 350 / distance; }
            const aim = { x: clamp(this.player.x + dx, 18, WIDTH - 18), y: clamp(this.player.y + dy, 18, HEIGHT - 18) };
            if (distance > 0) { this.player.dx = (x - this.player.x) / distance; this.player.dy = (y - this.player.y) / distance; }
            const style = this.styleRemaining > 0 ? 3 : 1;
            const radius = style === 3 ? 82 : 58;
            let count = 0;
            this.targets.forEach(target => {
                if (target.alive && Math.hypot(target.x - aim.x, target.y - aim.y) <= radius) {
                    target.alive = false;
                    target.respawn = 0.9;
                    count += 1;
                }
            });
            const earned = multikillScore(count, style);
            this.score += earned;
            this.kills += count;
            this.combo = count;
            this.bestCombo = Math.max(this.bestCombo, count);
            this.lastShot = { count, style, earned };
            this.effects.push({ x: aim.x, y: aim.y, fromX: this.player.x, fromY: this.player.y, radius, life: 0.38, count, style, earned });
            return this.lastShot;
        }
        step(seconds, input) {
            if (this.state !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
            const elapsed = Math.min(seconds, this.remaining);
            this.remaining = Math.max(0, this.remaining - elapsed);
            const dt = Math.min(elapsed, 0.05); // Physics remains bounded after a slow frame.
            this.shotCooldown = Math.max(0, this.shotCooldown - elapsed);
            this.dashCooldown = Math.max(0, this.dashCooldown - elapsed);
            this.styleRemaining = Math.max(0, this.styleRemaining - elapsed);
            const move = input || { x: 0, y: 0 };
            const magnitude = Math.hypot(move.x, move.y);
            const mx = magnitude ? move.x / magnitude : 0;
            const my = magnitude ? move.y / magnitude : 0;
            if (magnitude) { this.player.dx = mx; this.player.dy = my; }
            const drag = Math.exp(-6 * dt);
            this.player.vx = (this.player.vx + mx * 1600 * dt) * drag;
            this.player.vy = (this.player.vy + my * 1600 * dt) * drag;
            this.player.x = clamp(this.player.x + this.player.vx * dt, 18, WIDTH - 18);
            this.player.y = clamp(this.player.y + this.player.vy * dt, 18, HEIGHT - 18);
            this.effects.forEach(effect => { effect.life -= elapsed; });
            this.effects = this.effects.filter(effect => effect.life > 0);
            this.targets.forEach(target => {
                if (target.alive) return;
                target.respawn -= elapsed;
                if (target.respawn <= 0) {
                    target.alive = true;
                    target.x = 80 + this.random() * (WIDTH - 160);
                    target.y = 65 + this.random() * (HEIGHT - 130);
                }
            });
            if (this.remaining === 0) {
                this.state = 'ended';
                this.player.vx = 0;
                this.player.vy = 0;
            }
        }
    }

    const exported = { Arena, multikillScore, WIDTH, HEIGHT, ROUND_SECONDS, SHOT_COOLDOWN, DASH_STYLE_SECONDS };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (!root || !root.document) return;

    function mount() {
        const document = root.document;
        const canvas = document.getElementById('mayhem-canvas');
        const stage = document.getElementById('mayhem-stage');
        if (!canvas || !stage || canvas.dataset.demoMounted) return;
        canvas.dataset.demoMounted = 'true';
        const start = document.getElementById('mayhem-start');
        const reset = document.getElementById('mayhem-reset');
        const score = document.getElementById('mayhem-score');
        const kills = document.getElementById('mayhem-kills');
        const combo = document.getElementById('mayhem-combo');
        const status = document.getElementById('mayhem-status');
        const timer = document.getElementById('mayhem-time');
        const context = canvas.getContext('2d');
        if (!start || !reset || !score || !kills || !combo || !status || !context) {
            if (status) status.textContent = '이 브라우저에서는 캔버스 체험을 열 수 없습니다. 원작 시연 영상을 확인해 주세요.';
            if (start) start.disabled = true;
            return;
        }
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.tabIndex = 0;
        canvas.style.touchAction = 'manipulation';
        const model = new Arena();
        const held = new Set();
        const controls = Array.from(document.querySelectorAll('[data-mayhem-action]'));
        let frame = 0;
        let previousTime = 0;
        let decorativeTime = 0;
        let visible = true;
        let lastAnnouncement = -Infinity;
        let announcementKind = 'idle';
        let announcementDetail = null;
        const english = () => document.documentElement.lang === 'en';
        const text = (ko, en) => english() ? en : ko;
        const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
        const decorativeMotion = () => !reducedMotion.matches && document.documentElement.dataset.motion !== 'paused';
        const direction = () => ({ x: Number(held.has('right')) - Number(held.has('left')), y: Number(held.has('down')) - Number(held.has('up')) });
        const keyAction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

        function announcement() {
            const detail = announcementDetail;
            const messages = {
                idle: text('30초 동안 표적을 맞혀 보세요. 한 발로 여러 표적을 맞히면 멀티킬 보너스가 붙습니다.', 'Hit targets in a 30-second round. One shot hitting multiple targets earns a multikill bonus.'),
                started: text('시작! 방향키로 이동, 스페이스로 대시, 엔터로 가까운 표적을 쏘세요. 클릭이나 탭으로 직접 조준할 수 있습니다.', 'Go! Arrow keys move, Space dashes, Enter fires at the nearest target. Click or tap to aim directly.'),
                paused: text('일시정지했습니다. 이어하기를 누르면 남은 시간부터 시작합니다.', 'Paused. Resume to continue with the remaining time.'),
                hidden: text('체험이 화면 밖으로 나가 일시정지했습니다. 이어하기를 눌러 계속하세요.', 'Paused while the experiment is out of view. Select Resume to continue.'),
                dash: text('대시! 0.7초 동안 스타일 3. 지금 여러 표적을 함께 맞혀 보세요.', 'Dash! Style 3 for 0.7 seconds. Hit several targets with one shot now.'),
                miss: text('표적을 놓쳤어요. 사거리 원 안의 표적을 조준하거나 가까이 이동해 보세요.', 'Missed. Aim within the range circle or move closer.'),
                ended: text('라운드 끝! ' + model.score + '점, 표적 ' + model.kills + '개, 최고 멀티킬 ' + model.bestCombo + '개입니다. 다시 도전할 수 있습니다.', 'Round complete! ' + model.score + ' points, ' + model.kills + ' targets, best multikill ' + model.bestCombo + '. Play again anytime.'),
            };
            if (announcementKind === 'hit' && detail) {
                status.textContent = text(detail.count + '개 적중 · 스타일 ' + detail.style + ' · +' + detail.earned + '점', detail.count + ' hits · style ' + detail.style + ' · +' + detail.earned + ' points');
            } else status.textContent = messages[announcementKind] || messages.idle;
        }
        function announce(kind, detail, immediate) {
            const now = root.performance.now();
            if (!immediate && now - lastAnnouncement < 950) return;
            lastAnnouncement = now;
            announcementKind = kind;
            announcementDetail = detail || null;
            announcement();
        }
        function labels() {
            score.textContent = String(model.score);
            kills.textContent = String(model.kills);
            combo.textContent = String(model.combo);
            if (timer) timer.textContent = String(Math.ceil(model.remaining)).padStart(2, '0');
            const label = model.state === 'running' ? text('일시정지', 'Pause') : model.state === 'paused' ? text('이어하기', 'Resume') : model.state === 'ended' ? text('다시 도전', 'Play again') : text('30초 시작', 'Start 30 seconds');
            if (start.textContent !== label) start.textContent = label;
            start.setAttribute('aria-pressed', String(model.state === 'running'));
            canvas.setAttribute('aria-label', text('MAYHEM 스타일 스코어 웹 실험. 방향키 또는 WASD 이동, 스페이스 대시, 엔터 가까운 표적 발사. 클릭 또는 탭 직접 조준.', 'MAYHEM style-score web experiment. Arrows or WASD move, Space dashes, Enter fires at the nearest target. Click or tap to aim.'));
            stage.dataset.state = model.state;
            reset.setAttribute('aria-label', text('체험 초기화', 'Reset experiment'));
            const controlLabels = {
                up: text('위로 이동', 'Move up'), down: text('아래로 이동', 'Move down'),
                left: text('왼쪽 이동', 'Move left'), right: text('오른쪽 이동', 'Move right'),
                dash: text('대시 — 잠시 스타일 3', 'Dash — briefly activate style 3'),
                fire: text('가까운 표적 발사', 'Fire at the nearest target'),
            };
            controls.forEach(button => {
                button.disabled = model.state !== 'running';
                if (controlLabels[button.dataset.mayhemAction]) button.setAttribute('aria-label', controlLabels[button.dataset.mayhemAction]);
            });
        }
        function draw() {
            const ctx = context;
            const animateDetails = decorativeMotion();
            ctx.clearRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#073a50'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.strokeStyle = '#2b2c30'; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= WIDTH; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); }
            for (let y = 0; y <= HEIGHT; y += 60) { ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); }
            ctx.stroke();
            const player = model.player;
            ctx.save(); ctx.strokeStyle = '#45464d'; ctx.setLineDash([5, 9]);
            ctx.beginPath(); ctx.arc(player.x, player.y, 350, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            model.targets.forEach(target => {
                if (!target.alive) return;
                ctx.save(); ctx.translate(target.x, target.y);
                ctx.rotate(target.phase + decorativeTime * 0.3);
                ctx.fillStyle = '#43d8df'; ctx.fillRect(-11, -11, 22, 22);
                ctx.strokeStyle = '#f0fbff'; ctx.strokeRect(-15, -15, 30, 30);
                ctx.restore();
            });
            model.effects.forEach(effect => {
                ctx.save(); ctx.globalAlpha = animateDetails ? clamp(effect.life / 0.38, 0, 1) : 1;
                ctx.strokeStyle = effect.style === 3 ? '#a0f3df' : '#f0fbff';
                ctx.lineWidth = effect.style === 3 ? 3 : 2;
                if (animateDetails) {
                    ctx.beginPath(); ctx.moveTo(effect.fromX, effect.fromY); ctx.lineTo(effect.x, effect.y); ctx.stroke();
                }
                ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (animateDetails ? (1.2 - effect.life) : 1), 0, Math.PI * 2); ctx.stroke();
                if (effect.count) {
                    ctx.fillStyle = '#f0fbff'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
                    ctx.fillText('+' + effect.earned, effect.x, effect.y - 28);
                }
                ctx.restore();
            });
            if (model.styleRemaining > 0) {
                ctx.strokeStyle = '#a0f3df'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(player.x, player.y, 27, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = '#a0f3df'; ctx.beginPath(); ctx.arc(player.x, player.y, 13, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#073a50'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + player.dx * 18, player.y + player.dy * 18); ctx.stroke();
            ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#f0fbff';
            ctx.fillText('STYLE ' + (model.styleRemaining > 0 ? '3' : '1'), 24, 31);
            ctx.fillText(model.dashCooldown > 0 ? 'DASH ' + model.dashCooldown.toFixed(1) + 's' : 'DASH READY', 24, 54);
            ctx.textAlign = 'right'; ctx.fillText(Math.ceil(model.remaining).toString().padStart(2, '0') + ' / 30 SEC', WIDTH - 24, 31);
            if (model.state !== 'running') {
                ctx.fillStyle = 'rgba(4,39,59,.78)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
                ctx.textAlign = 'center'; ctx.fillStyle = '#a0f3df'; ctx.font = 'bold 44px monospace';
                ctx.fillText(model.state === 'ended' ? model.score + ' POINTS' : model.state === 'paused' ? 'PAUSED' : 'STYLE / SCORE', WIDTH / 2, HEIGHT / 2 - 9);
                ctx.fillStyle = '#f0fbff'; ctx.font = '17px sans-serif';
                ctx.fillText(text(model.state === 'paused' ? '이어하기를 눌러 계속하세요' : model.state === 'ended' ? '같은 표적 수, 다른 스타일. 다시 도전해 보세요.' : '이동하고, 대시하고, 여러 표적을 한 번에.', model.state === 'paused' ? 'Select Resume to continue' : model.state === 'ended' ? 'Same targets, different style. Try another round.' : 'Move, dash, hit several targets with one shot.'), WIDTH / 2, HEIGHT / 2 + 30);
            }
        }
        function stopFrame() { if (frame) root.cancelAnimationFrame(frame); frame = 0; previousTime = 0; }
        function tick(time) {
            frame = 0;
            if (model.state !== 'running') return;
            const elapsed = previousTime ? (time - previousTime) / 1000 : 0;
            if (decorativeMotion()) decorativeTime += Math.min(elapsed, 0.05);
            model.step(elapsed, direction());
            previousTime = time;
            labels(); draw();
            if (model.state === 'ended') { held.clear(); announce('ended', null, true); stopFrame(); }
            else frame = root.requestAnimationFrame(tick);
        }
        function pause(hidden) {
            if (model.state !== 'running') return;
            model.pause(); held.clear(); stopFrame(); labels(); draw(); announce(hidden ? 'hidden' : 'paused', null, true);
        }
        function toggle() {
            if (model.state === 'running') { pause(false); return; }
            if (document.hidden || !visible) return;
            model.start(); held.clear(); labels(); draw(); announce('started', null, true);
            canvas.focus({ preventScroll: true });
            previousTime = 0;
            if (!frame) frame = root.requestAnimationFrame(tick);
        }
        function shoot(x, y) {
            const result = model.fire(x, y);
            if (!result) return;
            labels(); draw(); announce(result.count ? 'hit' : 'miss', result, false);
            document.dispatchEvent(new CustomEvent('nw:feedback', { detail: { kind: result.count ? 'hit' : 'fire', style: result.style } }));
        }
        function perform(action) {
            if (model.state !== 'running') return;
            if (action === 'dash') {
                if (model.dash(direction())) { draw(); announce('dash', null, false); document.dispatchEvent(new CustomEvent('nw:feedback', { detail: { kind: 'dash' } })); }
            } else if (action === 'fire') {
                const target = model.nearestTarget(); if (target) shoot(target.x, target.y);
            }
        }
        start.addEventListener('click', toggle);
        reset.addEventListener('click', () => { held.clear(); stopFrame(); model.reset(); decorativeTime = 0; labels(); draw(); announce('idle', null, true); });
        canvas.addEventListener('click', event => {
            if (model.state !== 'running') return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            canvas.focus({ preventScroll: true });
            shoot((event.clientX - rect.left) * WIDTH / rect.width, (event.clientY - rect.top) * HEIGHT / rect.height);
        });
        canvas.addEventListener('keydown', event => {
            if (model.state !== 'running') return;
            const action = keyAction[event.key];
            if (action) { event.preventDefault(); held.add(action); }
            else if (event.code === 'Space' || event.key === 'Enter') {
                event.preventDefault(); if (!event.repeat) perform(event.code === 'Space' ? 'dash' : 'fire');
            } else if (event.key === 'Escape') { event.preventDefault(); pause(false); start.focus({ preventScroll: true }); }
        });
        root.addEventListener('keyup', event => { const action = keyAction[event.key]; if (action) held.delete(action); });
        canvas.addEventListener('blur', () => { held.clear(); });
        controls.forEach(button => {
            const action = button.dataset.mayhemAction;
            if (['up', 'down', 'left', 'right'].includes(action)) {
                button.style.touchAction = 'none';
                button.addEventListener('pointerdown', event => { if (model.state !== 'running') return; event.preventDefault(); held.add(action); button.setPointerCapture(event.pointerId); });
                ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(name => button.addEventListener(name, () => held.delete(action)));
                button.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.code === 'Space') && model.state === 'running') { event.preventDefault(); held.add(action); } });
                button.addEventListener('keyup', event => { if (event.key === 'Enter' || event.code === 'Space') { event.preventDefault(); held.delete(action); } });
            } else button.addEventListener('click', () => perform(action));
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
        root.addEventListener('blur', () => pause(true));
        root.addEventListener('pagehide', () => pause(true));
        if ('IntersectionObserver' in root) {
            const observer = new root.IntersectionObserver(entries => {
                visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1);
                if (!visible) pause(true);
            }, { threshold: [0, 0.1] });
            observer.observe(canvas);
        }
        new root.MutationObserver(records => {
            if (records.some(record => record.attributeName === 'lang')) { labels(); announcement(); }
            draw();
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-motion'] });
        if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', draw);
        labels(); draw(); announcement();
    }
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})(typeof window === 'undefined' ? null : window);
