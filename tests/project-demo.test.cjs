'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Arena, multikillScore, ROUND_SECONDS, DASH_STYLE_SECONDS } = require('../project-demo.js');

test('published multikill rule rewards style only on kills beyond the first', () => {
    assert.equal(multikillScore(0, 3), 0);
    assert.equal(multikillScore(1, 3), 1);
    assert.equal(multikillScore(3, 1), 5);
    assert.equal(multikillScore(3, 3), 9);
    assert.throws(() => multikillScore(-1, 3), RangeError);
});

test('two independent multikill groups accumulate the published sum', () => {
    const arena = new Arena(1);
    arena.start();
    arena.player.x = 200; arena.player.y = 200;
    arena.targets = [0, 1, 2].map(id => ({ id, x: 260 + id * 5, y: 200, alive: true, respawn: 0 }));
    const first = arena.fire(265, 200);
    assert.deepEqual(first, { count: 3, style: 1, earned: 5 });
    arena.step(0.4);
    arena.targets = [0, 1].map(id => ({ id, x: 270 + id * 5, y: 200, alive: true, respawn: 0 }));
    assert.equal(arena.dash({ x: 1, y: 0 }), true);
    const second = arena.fire(270, 200);
    assert.deepEqual(second, { count: 2, style: 3, earned: 5 });
    assert.equal(arena.kills, 5);
    assert.equal(arena.score, 5 + (3 - 1) * 1 + (2 - 1) * 3);
});

test('paused and ended rounds cannot gain score or consume time', () => {
    const arena = new Arena();
    arena.start(); arena.step(5); arena.pause();
    const remaining = arena.remaining;
    arena.step(60); assert.equal(arena.remaining, remaining);
    assert.equal(arena.fire(230, 150), null);
    assert.equal(arena.dash(), false);
    arena.start(); arena.step(remaining);
    assert.equal(arena.state, 'ended');
    assert.equal(arena.remaining, 0);
    assert.equal(arena.fire(230, 150), null);
});

test('repeated firing cannot score the same target twice or bypass cooldown', () => {
    const arena = new Arena(); arena.start();
    const target = arena.nearestTarget();
    const hit = arena.fire(target.x, target.y);
    assert.ok(hit.count > 0);
    const score = arena.score;
    assert.equal(arena.fire(target.x, target.y), null);
    assert.equal(arena.score, score);
    arena.step(0.36);
    const miss = arena.fire(target.x, target.y);
    assert.equal(miss.count, 0);
    assert.equal(arena.score, score);
});

test('dash style window expires and cooldown prevents repeated boost', () => {
    const arena = new Arena(); arena.start();
    assert.equal(arena.dash({ x: 0, y: 1 }), true);
    assert.equal(arena.dash(), false);
    arena.step(DASH_STYLE_SECONDS + 0.01);
    assert.equal(arena.styleRemaining, 0);
    const target = arena.nearestTarget();
    assert.equal(arena.fire(target.x, target.y).style, 1);
});

test('inertial movement remains inside the arena and reset clears all round state', () => {
    const arena = new Arena(7); arena.start();
    for (let i = 0; i < 250; i += 1) arena.step(0.05, { x: -1, y: -1 });
    assert.ok(arena.player.x >= 18 && arena.player.y >= 18);
    assert.ok(arena.player.x < 480 && arena.player.y < 270);
    arena.reset();
    assert.equal(arena.state, 'idle');
    assert.equal(arena.remaining, ROUND_SECONDS);
    assert.equal(arena.score, 0);
    assert.equal(arena.player.x, 480);
    assert.equal(arena.targets.filter(target => target.alive).length, 12);
});

test('a slow frame uses elapsed time for the 30 second clock without an unbounded movement jump', () => {
    const arena = new Arena(); arena.start();
    arena.step(12, { x: 1, y: 0 });
    assert.equal(arena.remaining, 18);
    assert.ok(arena.player.x < 500);
});
