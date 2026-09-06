// CPU geometry checks use the actual copied reference model and Three.js modules.
// They do not initialize WebGL or establish browser rendering results.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createRescueModel } from '../assets/rescue/rescue-model.js';

const bounds = model => {
    model.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group);
    return [...box.min.toArray(), ...box.max.toArray()];
};

test('reference presentation model builds finite geometry with a visible exterior', () => {
    const model = createRescueModel(THREE);
    let meshCount = 0;
    model.group.traverse(object => {
        if (!object.isMesh) return;
        meshCount++;
        const positions = object.geometry.getAttribute('position');
        assert.ok(positions && positions.count > 0);
        assert.ok([...positions.array].every(Number.isFinite));
    });
    const box = bounds(model);
    assert.ok(meshCount > 0);
    assert.ok(box.every(Number.isFinite));
    for (let axis = 0; axis < 3; axis++) assert.ok(box[axis + 3] > box[axis]);
    model.dispose();
});

test('both propulsion outlets remain attached to separate pods and point aft', () => {
    const model = createRescueModel(THREE);
    assert.equal(model.jets.length, 2);
    assert.equal(model.rotors.length, 2);
    for (const explosion of [0, 1]) {
        model.setExploded(explosion);
        model.group.updateMatrixWorld(true);
        const locations = model.jets.map(jet => {
            const position = jet.getWorldPosition(new THREE.Vector3());
            const direction = new THREE.Vector3(0, 0, 1).transformDirection(jet.matrixWorld);
            assert.ok(position.z > 0);
            assert.ok(direction.z > 0.99);
            return position;
        });
        assert.ok(locations[0].x * locations[1].x < 0);
        assert.ok(Math.abs(locations[0].x + locations[1].x) < 1e-8);
        assert.ok(Math.abs(locations[0].z - locations[1].z) < 1e-8);
    }
    model.dispose();
});

test('exploded view is reversible, bounded, and rejects non-finite input', () => {
    const model = createRescueModel(THREE);
    const assembled = bounds(model);
    model.setExploded(1);
    const exploded = bounds(model);
    assert.ok(exploded[3] > assembled[3]);
    assert.ok(exploded[4] > assembled[4]);
    for (const amount of [1, 99]) {
        model.setExploded(amount);
        assert.deepEqual(bounds(model), exploded);
    }
    for (const amount of [0, -5, NaN, Infinity]) {
        model.setExploded(amount);
        assert.deepEqual(bounds(model), assembled);
    }
    model.dispose();
});

test('model teardown releases shared resources once and detaches the assembly', () => {
    const model = createRescueModel(THREE);
    const parent = new THREE.Group();
    parent.add(model.group);
    const resources = new Set();
    model.group.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material) resources.add(material);
        }
    });
    const counts = new Map([...resources].map(resource => [resource, 0]));
    for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
    model.dispose();
    model.dispose();
    model.setExploded(1);
    assert.equal(model.group.parent, null);
    assert.ok(resources.size > 0);
    assert.ok([...counts.values()].every(count => count === 1));
});
