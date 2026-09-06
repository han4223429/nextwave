/**
 * A presentation reconstruction of images/rescue-jet.jpg, not a CAD model.
 * The reference supplies the orange arch, sidebars, reflective strips, arrow
 * and two cylindrical pods. Propellers and guards are simplified visual cues;
 * their dimensions, mounting and operation are not engineering specifications.
 *
 * Coordinates: +Y up, bow toward -Z, open stern and pod outlets toward +Z.
 * THREE is supplied by the renderer so this module has no imports or globals.
 */
export function createRescueModel(THREE) {
    const group = new THREE.Group();
    group.name = 'RESCUE JET · presentation model';

    const geometries = new Set();
    const materials = new Set();
    const rotors = [];
    const jets = [];
    const pods = [];
    let disposed = false;

    function material(options) {
        const result = new THREE.MeshStandardMaterial(options);
        materials.add(result);
        return result;
    }
    function geometry(result) {
        geometries.add(result);
        return result;
    }
    function mesh(shape, finish, parent = group, name = '') {
        const result = new THREE.Mesh(shape, finish);
        result.name = name;
        result.castShadow = true;
        result.receiveShadow = true;
        parent.add(result);
        return result;
    }

    const orange = material({ color: 0xff701b, roughness: 0.34, metalness: 0.035 });
    const lowerOrange = material({ color: 0xec5710, roughness: 0.4, metalness: 0.025 });
    const seamOrange = material({ color: 0xb93609, roughness: 0.55, metalness: 0 });
    const reflectiveRed = material({ color: 0xf00930, roughness: 0.23, metalness: 0.12 });
    const markerWhite = material({ color: 0xf5f4e9, roughness: 0.42, metalness: 0.015 });
    const rimWhite = material({ color: 0xcfd3cd, roughness: 0.32, metalness: 0.32 });
    const recessBlack = material({ color: 0x101816, roughness: 0.64, metalness: 0.08 });
    const rotorGraphite = material({ color: 0x46504b, roughness: 0.3, metalness: 0.46 });
    const guardGraphite = material({ color: 0x202925, roughness: 0.36, metalness: 0.4 });

    // One continuous open contour: a broad rounded arch and two integral arms.
    // Shape coordinates are (X, -Z); extrusion becomes vertical after rotation.
    const outline = new THREE.Shape();
    outline.moveTo(-2.33, -0.39);
    outline.quadraticCurveTo(-2.44, -0.39, -2.44, -0.28);
    outline.lineTo(-2.44, 0.09);
    outline.quadraticCurveTo(-2.44, 0.19, -2.34, 0.19);
    outline.lineTo(-1.52, 0.19);
    outline.bezierCurveTo(-1.23, 1.1, -0.74, 1.65, 0, 1.7);
    outline.bezierCurveTo(0.74, 1.65, 1.23, 1.1, 1.52, 0.19);
    outline.lineTo(2.34, 0.19);
    outline.quadraticCurveTo(2.44, 0.19, 2.44, 0.09);
    outline.lineTo(2.44, -0.28);
    outline.quadraticCurveTo(2.44, -0.39, 2.33, -0.39);
    outline.lineTo(0.89, -0.39);
    outline.bezierCurveTo(0.68, 0.3, 0.34, 0.85, 0, 0.92);
    outline.bezierCurveTo(-0.34, 0.85, -0.68, 0.3, -0.89, -0.39);
    outline.closePath();

    function shellGeometry(depth, bevelSize, bevelThickness) {
        const result = new THREE.ExtrudeGeometry(outline, {
            depth,
            bevelEnabled: true,
            bevelSegments: 4,
            bevelSize,
            bevelThickness,
            curveSegments: 32,
            steps: 1,
        });
        result.rotateX(-Math.PI / 2);
        return geometry(result);
    }

    const lowerShell = mesh(shellGeometry(0.165, 0.045, 0.045), lowerOrange, group, 'Lower buoy surface');
    lowerShell.position.y = 0.235;
    const seam = mesh(shellGeometry(0.015, 0.049, 0.005), seamOrange, group, 'Fine exterior seam');
    seam.position.y = 0.42;

    // Only this exterior cap moves upward in the conceptual exploded view.
    const upperShell = new THREE.Group();
    upperShell.name = 'Upper buoy surface · conceptual separation';
    group.add(upperShell);
    const top = mesh(shellGeometry(0.2, 0.045, 0.045), orange, upperShell, 'Rounded orange buoy cap');
    top.position.y = 0.44;

    const arrow = new THREE.Shape();
    arrow.moveTo(-0.055, 0.2);
    arrow.lineTo(0.055, 0.2);
    arrow.lineTo(0.055, -0.035);
    arrow.lineTo(0.145, -0.035);
    arrow.lineTo(0, -0.2);
    arrow.lineTo(-0.145, -0.035);
    arrow.lineTo(-0.055, -0.035);
    arrow.closePath();
    const arrowGeometry = geometry(new THREE.ShapeGeometry(arrow, 8));
    arrowGeometry.rotateX(-Math.PI / 2);
    const bowArrow = mesh(arrowGeometry, markerWhite, upperShell, 'White arrow from the reference');
    bowArrow.position.set(0, 0.686, -1.31);
    bowArrow.castShadow = false;

    function roundedRectangle(width, height, radius) {
        const shape = new THREE.Shape();
        const x = -width / 2, y = -height / 2;
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
        return shape;
    }
    const stripGeometry = geometry(new THREE.ExtrudeGeometry(roundedRectangle(1.04, 0.055, 0.012), {
        depth: 0.006, bevelEnabled: false, curveSegments: 4, steps: 1,
    }));
    [-1, 1].forEach(side => {
        const strip = mesh(stripGeometry, reflectiveRed, upperShell, 'Red reflective sidebar strip');
        strip.position.set(side * 1.85, 0.53, 0.437);
        strip.castShadow = false;
    });

    // Cylinders use local Z as their longitudinal axis. The aft recess, rotor
    // and guard are shallow surfaces so the model does not imply real internals.
    const podGeometry = geometry(new THREE.CylinderGeometry(0.325, 0.325, 1.56, 48, 1));
    podGeometry.rotateX(Math.PI / 2);
    const noseGeometry = geometry(new THREE.SphereGeometry(0.325, 40, 20));
    const podShoulderGeometry = geometry(new THREE.TorusGeometry(0.304, 0.03, 12, 48));
    const outletLipGeometry = geometry(new THREE.TorusGeometry(0.297, 0.03, 12, 48));
    const recessGeometry = geometry(new THREE.CircleGeometry(0.278, 48));
    const guardRingGeometry = geometry(new THREE.TorusGeometry(0.264, 0.013, 8, 48));
    const guardSpokeGeometry = geometry(new THREE.CylinderGeometry(0.008, 0.008, 0.222, 8, 1));
    const hubGeometry = geometry(new THREE.CylinderGeometry(0.045, 0.055, 0.043, 24, 1));
    hubGeometry.rotateX(Math.PI / 2);

    const blade = new THREE.Shape();
    blade.moveTo(0.024, 0.023);
    blade.bezierCurveTo(0.1, 0.065, 0.205, 0.045, 0.234, 0.103);
    blade.bezierCurveTo(0.235, 0.135, 0.211, 0.181, 0.168, 0.184);
    blade.bezierCurveTo(0.117, 0.159, 0.078, 0.079, 0.022, 0.061);
    blade.closePath();
    const bladeGeometry = geometry(new THREE.ExtrudeGeometry(blade, {
        depth: 0.012,
        bevelEnabled: true,
        bevelSize: 0.004,
        bevelThickness: 0.003,
        bevelSegments: 2,
        curveSegments: 10,
        steps: 1,
    }));

    [-1, 1].forEach(side => {
        const pod = new THREE.Group();
        pod.name = side < 0 ? 'Port thruster pod' : 'Starboard thruster pod';
        pod.position.set(side * 2.12, 0.345, 0.43);
        group.add(pod);
        pods.push({ object: pod, side });

        mesh(podGeometry, orange, pod, 'Orange cylindrical pod');
        const nose = mesh(noseGeometry, orange, pod, 'Rounded forward end');
        nose.scale.z = 0.2;
        nose.position.z = -0.775;
        const frontShoulder = mesh(podShoulderGeometry, lowerOrange, pod, 'Forward exterior lip');
        frontShoulder.position.z = -0.73;
        const rearShoulder = mesh(podShoulderGeometry, lowerOrange, pod, 'Aft exterior lip');
        rearShoulder.position.z = 0.75;
        const recess = mesh(recessGeometry, recessBlack, pod, 'Shallow dark outlet');
        recess.position.z = 0.787;
        recess.castShadow = false;
        const outletLip = mesh(outletLipGeometry, rimWhite, pod, 'Light outlet rim from the reference');
        outletLip.position.z = 0.82;

        const rotor = new THREE.Group();
        rotor.name = 'Propeller · local Z spin axis';
        rotor.position.z = 0.807;
        pod.add(rotor);
        rotors.push(rotor);
        for (let index = 0; index < 3; index++) {
            const propellerBlade = mesh(bladeGeometry, rotorGraphite, rotor, 'Simplified propeller blade');
            propellerBlade.rotation.z = index * Math.PI * 2 / 3;
        }
        const hub = mesh(hubGeometry, rotorGraphite, rotor, 'Propeller hub');
        hub.position.z = 0.019;

        const guard = mesh(guardRingGeometry, guardGraphite, pod, 'Outlet grille rim');
        guard.position.z = 0.868;
        for (let index = 0; index < 6; index++) {
            const angle = index * Math.PI / 3;
            const spoke = mesh(guardSpokeGeometry, guardGraphite, pod, 'Outlet grille spoke');
            spoke.position.set(Math.cos(angle) * 0.153, Math.sin(angle) * 0.153, 0.868);
            spoke.rotation.z = angle - Math.PI / 2;
        }

        // A renderer may attach a water trail here. Local +Z points aft/outward.
        const outlet = new THREE.Group();
        outlet.name = side < 0 ? 'Port water-trail origin' : 'Starboard water-trail origin';
        outlet.position.z = 0.91;
        pod.add(outlet);
        jets.push(outlet);
    });

    function setExploded(amount) {
        if (disposed) return;
        const value = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
        upperShell.position.y = value * 0.5;
        pods.forEach(({ object, side }) => { object.position.x = side * (2.12 + value * 0.52); });
    }
    function dispose() {
        if (disposed) return;
        disposed = true;
        geometries.forEach(item => item.dispose());
        materials.forEach(item => item.dispose());
        geometries.clear();
        materials.clear();
        group.removeFromParent();
    }

    return { group, rotors, jets, setExploded, dispose };
}
