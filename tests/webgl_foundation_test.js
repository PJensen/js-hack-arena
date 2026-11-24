import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { multiply, perspective } from '../public/src/display/webgl/math.js';
import { ParticleFX, ParticlePool } from '../public/src/display/webgl/particles.js';
import { MAX_DYNAMIC_LIGHTS } from '../public/src/display/webgl/arenaRenderer.js';
import { createMeleeImpact } from '../public/src/display/passes/meleeImpact.js';
import { createFloatTextPass } from '../public/src/display/passes/floatText.js';
import { buildTerrainMesh } from '../public/src/display/webgl/terrainMesh.js';
import { createDungeonDecorations } from '../public/src/display/worldDecorations.js';
import { biolum, emberLight, torchLight } from '../public/src/display/lightPatterns.js';
import { generateArenaCave, generateCave } from '../public/src/rules/geometry/caveGen.js';

Deno.test('combat numbers: batch close hits by target and render distinct healing and periodic damage', () => {
  const pass = createFloatTextPass();
  const labels = [];
  const ctx = {
    save() {},
    restore() {},
    strokeText() {},
    fillText(text, x, y) { labels.push([text, this.fillStyle, x, y]); },
  };
  const bounds = { view: [0, 0, 100, 100], width: 100, height: 100, ratio: 1 };
  const target = { target: 1, x: 0, y: 0 };
  pass.add({ ...target, amount: 7 });
  pass.add({ ...target, amount: 5 });
  pass.add({ ...target, amount: -3 });
  pass.add({ ...target, amount: 2, periodic: true, incoming: true });
  pass.add({ ...target, target: 2, amount: 4 });
  pass.render(ctx, bounds);
  assertEquals(labels.map(([text, color]) => [text, color]), [
    ['−12', '#ffe594'], ['+3', '#9affae'], ['−2', '#ff8f96'], ['−4', '#ffe594'],
  ]);
  assert(labels[0][2] !== labels[1][2]);

  labels.length = 0;
  pass.step(0.5);
  pass.render(ctx, { ...bounds, reducedMotion: true });
  assert(labels.every(([, , , y]) => y === 50));
  pass.step(0.6);
  labels.length = 0;
  pass.render(ctx, bounds);
  assertEquals(labels, []);
});

Deno.test('melee presentation: a confirmed local hit holds the swing once and punches the camera', () => {
  const contacts = [];
  const arc = { range: 72, halfAngle: 1.1, hits: [{ target: 2, x: 40, y: 0 }] };
  const cast = { playerId: 1, spellId: 'cleave', x: 0, y: 0, angle: 0, meleeArc: arc };
  const effect = createMeleeImpact({ playerId: 1, onContact: (swing) => contacts.push(swing) });
  effect.add(cast);
  assertEquals(effect.advance(0.04), 0.04);
  assertEquals(effect.cameraResponse().zoom, 1);
  assertEquals(contacts.length, 0);
  assert(effect.advance(0.05) < 0.01);
  assertEquals(contacts.length, 1);
  assertEquals(contacts[0].halfAngle, arc.halfAngle);
  assert(effect.cameraResponse().zoom > 1);
  assert(effect.advance(0.02) < 0.01);
  assert(effect.actorPosition(2, { x: 40, y: 0 }).x > 40);
  for (let i = 0; i < 30; i++) effect.advance(0.02);
  assertEquals(effect.cameraResponse().zoom, 1);
  assertEquals(effect.swings, []);
  assertEquals(contacts.length, 1);

  for (const [event, reducedMotion, expectedContacts] of [
    [{ ...cast, meleeArc: { ...arc, hits: [] } }, false, 0],
    [{ ...cast, playerId: 7 }, false, 1],
    [cast, true, 1],
  ]) {
    contacts.length = 0;
    const effect = createMeleeImpact({ playerId: 1, reducedMotion: () => reducedMotion, onContact: () => contacts.push(1) });
    effect.add(event);
    assertEquals(effect.advance(0.09), 0.09);
    assertEquals(effect.cameraResponse().zoom, 1);
    assertEquals(contacts.length, expectedContacts);
  }
});

Deno.test('arena cave expands the playable network without growing the field texture', () => {
  const cave = generateArenaCave(42);
  assertEquals(cave.bounds, { w: 8000, h: 8000 });
  assertEquals([cave.grid.cols, cave.grid.rows], [1001, 1001]);
  assert(cave.routes.length >= 30);
  for (const route of cave.routes) {
    assert(route.points.every(point => cave.grid.distanceMove(point.x, point.y) >= 20));
  }
});

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

Deno.test('webgl foundation: starting campfire is clear of the player and nearby torches', () => {
  const spawns = [{ x: 200, y: 200 }, { x: 600, y: 250 }];
  const routes = [{ points: [{ x: 200, y: 100 }, { x: 950, y: 250 }] }];
  const { campfire, torches, mushroom, ghostPipe } = createDungeonDecorations({
    grid: { distanceMove: () => 100 }, spawns, routes,
  });
  assert(Math.hypot(campfire.x - spawns[0].x, campfire.y - spawns[0].y) >= 52);
  assertEquals(torches.map(torch => torch.x), [600, 950]);
  assert(Math.hypot(mushroom.x - campfire.x, mushroom.y - campfire.y) > 130);
  assert(Math.hypot(ghostPipe.x - mushroom.x, ghostPipe.y - mushroom.y) >= 120);
  assert(Math.hypot(ghostPipe.x - campfire.x, ghostPipe.y - campfire.y) >= 108);
});

Deno.test('webgl foundation: fire and bioluminescence have distinct, repeatable rhythms', () => {
  assert(torchLight(1, 0) !== torchLight(1, Math.PI));
  const flare = 0.76 / 0.23;
  assert(emberLight(flare, 0) > emberLight(flare - 0.7, 0) + 0.15);
  assert(emberLight(flare, 0) > emberLight(flare + 0.7, 0) + 0.15);
  const bright = biolum(1.8, 0);
  const dim = biolum(5.5, 0);
  assert(bright.intensity > dim.intensity + 0.3);
  assert(dim.intensity > 0.45);
  assert(Math.abs(bright.b - dim.b) > 0.08);
  assertEquals(biolum(1.8, 0), bright);
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
