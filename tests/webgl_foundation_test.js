import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { multiply, perspective } from '../public/src/display/webgl/math.js';
import { ParticleFX, ParticlePool } from '../public/src/display/webgl/particles.js';
import { MAX_DYNAMIC_LIGHTS } from '../public/src/display/webgl/arenaRenderer.js';
import { buildTerrainMesh } from '../public/src/display/webgl/terrainMesh.js';
import { generateCave } from '../public/src/rules/geometry/caveGen.js';

Deno.test('webgl foundation: cave generation retains signed visual density', () => {
  const cave = generateCave({ seed: 42, width: 400, height: 400 });
  assertEquals(cave.grid.densityGrid.length, cave.grid.moveGrid.length);
  assert(cave.grid.densityGrid.some((value) => value > 0));
  assert(cave.grid.densityGrid.some((value) => value < 0));
});

Deno.test('webgl foundation: expanded cave routes remain open and navigable', () => {
  const cave = generateCave({ seed: 73, width: 1200, height: 1200, spawnCount: 4, spawnSpacing: 240 });
  assert(cave.routes.length > 0);
  for (const route of cave.routes) {
    for (const point of route.points) assert(cave.grid.distanceMove(point.x, point.y) >= 20);
  }
});

Deno.test('webgl foundation: terrain mesh retains open floor and raises solid density', () => {
  const grid = {
    cols: 3,
    rows: 3,
    cellSize: 4,
    moveGrid: new Float32Array([
      0, 0, 0,
      0, 40, 0,
      0, 0, 0,
    ]),
    densityGrid: new Float32Array([
      -0.4, -0.2, -0.4,
      -0.2, 0.3, -0.2,
      -0.4, -0.2, -0.4,
    ]),
  };
  const mesh = buildTerrainMesh(grid, { stride: 1, wallHeight: 100 });
  assertEquals(mesh.vertices.length, 3 * 3 * 7);
  assertEquals(mesh.indices.length, 2 * 2 * 6);
  assertEquals(mesh.vertices[(1 * 3 + 1) * 7 + 1], 0);
  assert(mesh.vertices[1] > 0);
  assertEquals(mesh.vertices[(1 * 3 + 1) * 7 + 6], 0);
});

Deno.test('webgl foundation: perspective matrices compose without allocations or invalid values', () => {
  const projection = perspective(Math.PI / 3, 16 / 9, 1, 2000);
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const output = new Float32Array(16);
  assertEquals(multiply(projection, identity, output), output);
  assert(output.every(Number.isFinite));
  assertEquals([...output], [...projection]);
});

Deno.test('webgl foundation: particle pool is bounded and compacts live particles', () => {
  const pool = new ParticlePool(2);
  const particle = {
    x: 0, y: 0, vx: 2, vy: 0, ax: 0, ay: 0, life: 1,
    size0: 4, size1: 1, r: 1, g: 0.5, b: 0.25, a0: 1, a1: 0,
  };
  assertEquals(pool.spawn(particle), true);
  assertEquals(pool.spawn({ ...particle, life: 0.1 }), true);
  assertEquals(pool.spawn(particle), false);
  pool.step(0.2);
  assertEquals(pool.count, 1);
  assertAlmostEquals(pool.x[0], 0.4, 1e-6);
});

Deno.test('webgl foundation: keyed emitters produce deterministic presentation state', () => {
  const left = new ParticleFX({ capacity: 8, seedBase: 42 });
  const right = new ParticleFX({ capacity: 8, seedBase: 42 });
  const preset = {
    continuous: false, burstCount: 3, angle: 0, spread: Math.PI,
    speed: 10, speedJitter: 0.5, life: 1, lifeJitter: 0.25,
    size: 4, sizeEnd: 0, color: '#8cd8ff', alpha0: 1, alpha1: 0,
  };
  for (const fx of [left, right]) {
    fx.ensureEmitter('impact:7', preset).step(fx.pool, 0, 10, 20);
  }
  assertEquals(left.pool.count, 3);
  assertEquals([...left.pool.vx.slice(0, 3)], [...right.pool.vx.slice(0, 3)]);
  assertEquals([...left.pool.vy.slice(0, 3)], [...right.pool.vy.slice(0, 3)]);
});

Deno.test('webgl foundation: lighting remains a multi-source storytelling layer', () => {
  assert(MAX_DYNAMIC_LIGHTS >= 16);
});
