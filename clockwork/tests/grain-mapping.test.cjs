const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = readFileSync(path.join(root, 'index.html'), 'utf8');
let THREE, drumMesh, createGearMesh;

function between(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `Missing page source section: ${start}`);
    return source.slice(a, b);
}

before(async () => {
    // Load the bundled ESM without dependencies or a package.json change.
    const vendor = readFileSync(path.join(root, 'vendor/three.module.js'));
    THREE = await import(`data:text/javascript;base64,${vendor.toString('base64')}`);
    // Execute the page's real geometry/material code. Canvas pixels and WebGL
    // are not needed for geometry UVs or Three.js's texture transform.
    const build = new Function('THREE', 'grainCanvas', [
        between('const COLORS =', '// 金属质感'),
        between('function grainFor(', '/**\n * 创建顶部尖齿'),
        'const shaftGreat = new THREE.Group();',
        between('const drumGeo =', '// 96齿浅绿主齿轮'),
        'return { drumMesh, createGearMesh };'
    ].join('\n'));
    ({ drumMesh, createGearMesh } = build(THREE, { width: 512, height: 512 }));
});

function vertices(geometry, group) {
    const indices = geometry.index;
    return [...new Set(Array.from({ length: group.count }, (_, i) =>
        indices ? indices.getX(group.start + i) : group.start + i))];
}

function mappedUV(mesh, vertex, mapName) {
    const texture = mesh.material[mapName];
    texture.updateMatrix();
    return texture.transformUv(new THREE.Vector2().fromBufferAttribute(mesh.geometry.attributes.uv, vertex));
}

test('both drum cap axes map to the grain centre in roughness and bump maps', () => {
    const caps = drumMesh.geometry.groups.filter(group => group.materialIndex !== 0);
    assert.equal(caps.length, 2, 'Check both cylinder end caps');
    const positions = drumMesh.geometry.attributes.position;
    for (const cap of caps) {
        const centres = vertices(drumMesh.geometry, cap).filter(i =>
            Math.hypot(positions.getX(i), positions.getY(i)) < 1e-7);
        assert.ok(centres.length > 0, 'Must sample actual cap axis vertices');
        for (const mapName of ['roughnessMap', 'bumpMap']) for (const i of centres) {
            const uv = mappedUV(drumMesh, i, mapName);
            assert.ok(Math.hypot(uv.x - 0.5, uv.y - 0.5) < 1e-7,
                `Cap ${cap.materialIndex} ${mapName}: axis maps to (${uv.x.toFixed(6)}, ${uv.y.toFixed(6)}), expected (0.5, 0.5)`);
        }
    }
});

test('equal radii on both drum caps stay equidistant from the grain centre', () => {
    const positions = drumMesh.geometry.attributes.position;
    for (const cap of drumMesh.geometry.groups.filter(group => group.materialIndex !== 0)) {
        const rim = vertices(drumMesh.geometry, cap).filter(i =>
            Math.hypot(positions.getX(i), positions.getY(i)) > 1e-7);
        assert.ok(rim.length >= 3, 'Must sample a full cap rim');
        for (const mapName of ['roughnessMap', 'bumpMap']) {
            const radii = rim.map(i => {
                const uv = mappedUV(drumMesh, i, mapName);
                return Math.hypot(uv.x - 0.5, uv.y - 0.5);
            });
            const spread = Math.max(...radii) - Math.min(...radii);
            assert.ok(spread < 1e-7, `Cap ${cap.materialIndex} ${mapName}: texture radius spread ${spread} exceeds 1e-7`);
        }
    }
});

test('extruded gear faces retain their previous coordinate-based grain mapping', () => {
    for (const teeth of [8, 10, 30, 32, 60, 64, 96]) {
        const mesh = createGearMesh({ teeth, spokes: teeth <= 10 ? 0 : 5 });
        const positions = mesh.geometry.attributes.position;
        const faces = mesh.geometry.groups.filter(group => group.materialIndex === 0);
        assert.ok(faces.length > 0, 'Must sample extruded gear faces');
        for (const face of faces) for (const i of vertices(mesh.geometry, face)) {
            // Frozen pre-fix mapping, evaluated at actual generated face vertices.
            const diameter = 2.3 * (teeth * 0.16 / 2 + 0.4);
            const x = 0.5 + positions.getX(i) / diameter;
            const y = 0.5 - positions.getY(i) / diameter; // CanvasTexture.flipY
            for (const mapName of ['roughnessMap', 'bumpMap']) {
                const uv = mappedUV(mesh, i, mapName);
                assert.ok(Math.hypot(uv.x - x, uv.y - y) < 1e-7,
                    `${teeth}-tooth ${mapName}: face mapping changed at vertex ${i}`);
            }
        }
    }
});
