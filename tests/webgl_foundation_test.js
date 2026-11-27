import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { multiply, perspective } from '../public/src/display/webgl/math.js';
import { ParticleFX, ParticlePool } from '../public/src/display/webgl/particles.js';
import { createLavaLightPixels } from '../public/src/display/webgl/lavaLight.js';
import { MAX_DYNAMIC_LIGHTS } from '../public/src/display/webgl/arenaRenderer.js';
import { itemTooltipIconId, weaponTooltipName } from '../public/src/display/ui/itemTooltip.js';
import { icons } from '../public/assets/icons/manifest.js';
import { createMeleeImpact } from '../public/src/display/passes/meleeImpact.js';
import { createDungeonMemory } from '../public/src/display/dungeonMemory.js';
import { createPlayerSight } from '../public/src/display/playerSight.js';
import { createFloatTextPass } from '../public/src/display/passes/floatText.js';
import { createGorePass, GORE_LIMITS } from '../public/src/display/passes/gore.js';
import { writeSpiderPose } from '../public/src/display/webgl/spiderMesh.js';
import { buildTerrainMesh } from '../public/src/display/webgl/terrainMesh.js';
import { createDungeonDecorations } from '../public/src/display/worldDecorations.js';
import { biolum, emberLight, fireFlicker, torchLight } from '../public/src/display/lightPatterns.js';
import { generateArenaCave, generateCave } from '../public/src/rules/geometry/caveGen.js';
import { FOV } from '../public/src/rules/components/FOV.js';
import { sweepMaxFree } from '../public/src/rules/geometry/sweep.js';

Deno.test('player sight turns in place, limits rear awareness, and stops at walls', () => {
  let wall = true;
  const sight = createPlayerSight({
    cellSize: 8,
    distanceMove: (x) => wall && x >= 80 && x <= 96 ? 0 : 20,
  });
  const origin = { x: 0, y: 0 };
  const fov = FOV.defaults;
  assert(sight.update(origin, 0, fov));
  assert(sight.contains(65, 0));
  assert(sight.contains(72, -86)); // 50° off center.
  assert(sight.contains(0, -100)); // The tangent widens near-side awareness.
  assert(sight.contains(0, 100));
  assert(!sight.contains(30, -250)); // Far outside the tangent sides.
  assert(!sight.contains(-70, -40)); // Behind the rounded shoulder.
  assert(!sight.contains(300, 0));
  assert(sight.contains(-40, 0));
  assert(!sight.contains(-100, 0));
  assert(!sight.contains(104, 84)); // The widened side still stops at a wall.
  assert(!sight.update(origin, Math.PI, fov));
  assert(sight.contains(-100, 0));
  assert(!sight.contains(65, 0));
  assert(!sight.contains(-370, 0));

  wall = false;
  sight.invalidate();
  assert(sight.update(origin, 0, fov));
  assert(sight.contains(320, 0));
  assert(sight.update({ x: 16, y: 0 }, 0, fov));
  assert(sight.contains(336, 0));
});

Deno.test('dungeon memory retains observed terrain and refreshes only in sight', () => {
  const bounds = { w: 640, h: 480 };
  const player = { x: 260, y: 244 };
  const fov = FOV.defaults;
  let floorClearance = 20;
  const grid = {
    cellSize: 8,
    distanceMove: (x, y) => x >= 360 && x <= 384 && y > 180 ? 0 : x < 260 ? 32 : floorClearance,
  };
  const sight = createPlayerSight(grid);
  const memory = createDungeonMemory(bounds, grid);
  const read = (x, y) => {
    const index = (Math.floor(y / 8) * memory.cols + Math.floor(x / 8)) * 2;
    return memory.cells.slice(index, index + 2);
  };
  const update = (facing) => memory.observe(sight, fov, sight.update(player, facing, fov));

  const dirty = update(0);
  assert(dirty.x <= 40 && dirty.x + dirty.width > 40);
  assertEquals(read(324, 244), new Uint8Array([255, 80]));
  assertEquals(read(500, 60), new Uint8Array([255, 80]));
  assertEquals(read(420, 244), new Uint8Array([0, 0]));
  assertEquals(read(156, 244), new Uint8Array([0, 0]));
  assertEquals(update(0), null);

  assert(update(Math.PI));
  assertEquals(read(156, 244), new Uint8Array([255, 128]));
  assert(!sight.contains(324, 244));
  assertEquals(read(324, 244), new Uint8Array([255, 80]));
  assertEquals(read(500, 60), new Uint8Array([255, 80]));
  floorClearance = 44;
  sight.invalidate();
  update(Math.PI);
  assertEquals(read(324, 244), new Uint8Array([255, 80]));
  assert(update(0));
  assertEquals(read(324, 244), new Uint8Array([255, 176]));
  assertEquals(read(420, 244), new Uint8Array([0, 0]));
  assertEquals(createDungeonMemory(bounds, grid).cells.some(Boolean), false);
});

Deno.test('lava light extends onto dry tiles and fades away from the pool', () => {
  const cols = 24, rows = 24, cellSize = 8;
  const lavaGrid = new Uint8Array(cols * rows);
  lavaGrid[12 * cols + 12] = 255;
  lavaGrid[12 * cols + 11] = 127;
  const pixels = createLavaLightPixels({ lavaGrid, cols, rows, cellSize });
  const offset = (x, y) => (y * cols + x) * 2;
  const spill = (x, y) => pixels[offset(x, y) + 1];
  assertEquals(pixels[offset(12, 12)], 255);
  assertEquals(pixels[offset(11, 12)], 127);
  assertEquals(pixels[offset(13, 12)], 0);
  assertEquals(spill(12, 12), 255);
  assertEquals(spill(11, 12), spill(13, 12));
  assert(spill(15, 12) > spill(17, 12));
  assert(spill(17, 12) > 0);
  assertEquals(spill(20, 12), 0);
  assertEquals(spill(15, 15), spill(9, 9));
});

Deno.test('weapon tooltip: authored names take precedence over weapon type fallbacks', () => {
  assertEquals(weaponTooltipName({ name: 'Shadow Longbow', slot: 'ranged' }), 'Shadow Longbow');
  assertEquals(weaponTooltipName({ name: ' Item ', slot: 'melee' }), 'Sword');
  assertEquals(weaponTooltipName({ slot: 'ranged' }), 'Bow');
});

Deno.test('item tooltips resolve atlas icons for rings and weapon rarities', () => {
  const cases = [
    ['ring', 'epic', 'ring'],
    ['melee', 'common', 'sword_tier_0'],
    ['melee', 'uncommon', 'sword_tier_1'],
    ['melee', 'rare', 'sword_tier_2'],
    ['melee', 'epic', 'epic_sword'],
    ['melee', 'legendary', 'legendary_sword'],
    ['ranged', 'common', 'bow'],
    ['ranged', 'epic', 'epic_bow'],
    ['ranged', 'legendary', 'legendary_bow'],
  ];
  for (const [slot, rarity, expectedIconId] of cases) {
    const iconId = itemTooltipIconId({ slot, rarity });
    assertEquals(iconId, expectedIconId);
    assert(Object.hasOwn(icons, iconId));
  }
});

Deno.test('spider mesh: four legs lift at a time and the standing pose holds still', () => {
  const first = new Float32Array(34 * 16);
  const second = new Float32Array(first.length);
  const stanceCount = writeSpiderPose(first, 0, 0);
  assertEquals(stanceCount, 33);
  writeSpiderPose(second, Math.PI * 1.5, 0);
  assertEquals(first, second);

  const legCenters = [5, 8, 11, 14, 20, 23, 26, 29].map((part) => part * 16 + 1);
  writeSpiderPose(first, Math.PI / 2, 1);
  writeSpiderPose(second, Math.PI * 1.5, 1);
  assertEquals(legCenters.filter((center) => first[center] > second[center]).length, 4);
  assertEquals(legCenters.filter((center) => first[center] < second[center]).length, 4);
  assert(first.every(Number.isFinite) && second.every(Number.isFinite));
});

Deno.test('gore: directional spray dries on the floor and 3D debris settles without expiring', () => {
  const grid = { distanceMove: (x) => x < 50 ? 14 : 0 };
  const gore = createGorePass({ grid, seed: 11 });
  gore.add({ x: 25, y: 0, amount: 18, impactAngle: 0, spellId: 'rend', targetTheme: 'fire' });
  assert(gore.drops.filter((drop) => drop.vx > 0).length > gore.drops.length / 2);
  assertEquals(gore.fragments.length, 0);
  gore.add({ x: 25, y: 0, amount: 12, impactAngle: 0, killed: true, targetTheme: 'frost' });
  assert(gore.fragments.length > 0 && gore.fragments.every(({ material }) => material.gel));
  gore.step(0.15);
  assert(gore.fragments.every(({ height }) => height > 0));
  for (let i = 0; i < 120; i++) gore.step(0.025);
  assertEquals(gore.drops.length, 0);
  assert(gore.fragments.every((chunk) => chunk.settled && chunk.x < 50));
  assert(gore.stains.every((stain) => stain.x < 50));
  const stains = gore.stains.length;
  const fragments = gore.fragments.length;
  gore.step(1800);
  assertEquals(gore.stains.length, stains);
  assertEquals(gore.fragments.length, fragments);
});

Deno.test('gore: wraiths dissolve and retained dungeon marks stay within budget', () => {
  const grid = { distanceMove: () => 60 };
  const wraith = createGorePass({ grid, seed: 7 });
  wraith.add({ x: 0, y: 0, amount: 8, killed: true, targetTheme: 'shadow' });
  assert(wraith.drops.length > 0);
  wraith.step(1);
  assertEquals([wraith.drops.length, wraith.stains.length, wraith.fragments.length], [0, 0, 0]);

  const gore = createGorePass({ grid, seed: 7, reducedMotion: () => true });
  for (let i = 0; i < 300; i++) gore.add({ x: 0, y: 0, amount: 12, killed: true, targetTheme: 'fire' });
  assertEquals(gore.drops.length, 0);
  assertEquals(gore.stains.length, GORE_LIMITS.stains);
  assertEquals(gore.fragments.length, GORE_LIMITS.fragments);
  assert(gore.fragments.every(({ settled }) => settled));
});

Deno.test('gore: bleed drips settle into floor stains, including in reduced motion', () => {
  const grid = { distanceMove: () => 60 };
  const gore = createGorePass({ grid, seed: 11 });
  gore.drip(25, 0, 14);
  assertEquals([gore.drops.length, gore.stains.length], [1, 0]);
  const startHeight = gore.drops[0].height;
  gore.step(0.1);
  assert(gore.drops[0].height < startHeight);
  for (let i = 0; i < 20; i++) gore.step(0.025);
  assertEquals([gore.drops.length, gore.stains.length, gore.fragments.length], [0, 1, 0]);
  assert(gore.stains[0].y > 0);

  const still = createGorePass({ grid, seed: 11, reducedMotion: () => true });
  still.drip(25, 0, 14);
  assertEquals([still.drops.length, still.stains.length], [0, 1]);
});

Deno.test('gore: bleeding uses the same materials as hits', () => {
  const grid = { distanceMove: () => 60 };
  const themes = ['fire', 'spider', 'floating_eye', 'frost', 'gas_spore', 'flaming_bat', 'shadow'];
  for (const targetTheme of themes) {
    const hit = createGorePass({ grid, seed: 11 });
    hit.add({ x: 0, y: 0, amount: 8, targetTheme });
    const bleed = createGorePass({ grid, seed: 11 });
    bleed.drip(0, 0, 14, targetTheme);
    const material = bleed.drops[0].material;
    assertEquals(material, hit.drops[0].material);

    if (targetTheme === 'shadow') {
      const startHeight = bleed.drops[0].height;
      bleed.step(0.1);
      assert(bleed.drops[0].height > startHeight);
    }
    for (let i = 0; i < 40; i++) bleed.step(0.025);
    assertEquals(bleed.drops.length, 0);
    assertEquals(bleed.stains.map(({ color }) => color), material.stain ? [material.stain] : []);

    const still = createGorePass({ grid, seed: 11, reducedMotion: () => true });
    still.drip(0, 0, 14, targetTheme);
    assertEquals(still.drops.length, 0);
    assertEquals(still.stains.map(({ color }) => color), bleed.stains.map(({ color }) => color));
  }
});

Deno.test('gore: a dead Floating Eye sprays violet ichor and leaves gelatinous fragments', () => {
  const gore = createGorePass({ grid: { distanceMove: () => 60 }, seed: 11 });
  gore.add({ x: 25, y: 0, amount: 12, killed: true, targetTheme: 'floating_eye' });
  assert(gore.drops.length > 0);
  assert(gore.fragments.length > 0);
  assert(gore.fragments.every(({ material, color }) => material.gel && color[2] > color[0] && color[0] > color[1]));
  for (let i = 0; i < 60; i++) gore.step(0.025);
  assertEquals(gore.drops.length, 0);
  assert(gore.fragments.every(({ settled }) => settled));
  assert(gore.stains.length > 1 && gore.stains.every(({ color }) => color[2] > color[0] && color[0] > color[1]));
});

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
  pass.add({ ...target, amount: 14, critical: true });
  pass.render(ctx, bounds);
  assertEquals(labels.map(([text, color]) => [text, color]), [
    ['−12', '#ffe594'], ['+3', '#9affae'], ['−2', '#ff8f96'], ['−4', '#ffe594'], ['−14!', '#ffb252'],
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

  const tap = createMeleeImpact({ playerId: 1, onContact: () => {} });
  const charged = createMeleeImpact({ playerId: 1, onContact: () => {} });
  tap.add({ ...cast, charge: 0 });
  charged.add({ ...cast, charge: 1 });
  tap.advance(0.09);
  charged.advance(0.09);
  assert(charged.advance(0.09) < tap.advance(0.09));

  for (const [event, reducedMotion, expectedContacts] of [
    [{ ...cast, charge: 1, meleeArc: { ...arc, hits: [] } }, false, 0],
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
  assertEquals(cave.campfires.length, 1);
  const [campfire] = cave.campfires;
  assert(cave.grid.distanceMove(campfire.x, campfire.y) >= 38);
});

Deno.test('arena cave rolls one reachable chest in a dead-end chamber beyond the entrance', () => {
  const { grid, routes, spawns: [entrance], chestSites } = generateArenaCave(42);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const endpoints = routes.flatMap(({ from, to }) => [from, to]);
  const leaves = endpoints.filter((room) => endpoints.filter((end) => distance(room, end) === 0).length === 1);
  assert(leaves.some((leaf) => distance(leaf, entrance) === 0));
  assertEquals(chestSites.length, 1);
  const [site] = chestSites;
  const leaf = leaves.find((room) => distance(room, site) <= 48.001);
  assert(leaf && distance(leaf, entrance) > 0);
  assert(grid.distanceMove(site.x, site.y) >= 20);
  assertEquals(sweepMaxFree(grid, leaf.x, leaf.y, site.x, site.y, 20), 1);
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

Deno.test('webgl foundation: torches stay clear of each authored campfire', () => {
  const spawns = [{ x: 200, y: 200 }, { x: 600, y: 250 }];
  const routes = [{ points: [{ x: 200, y: 100 }, { x: 950, y: 250 }] }];
  const campfire = { x: 200, y: 124 };
  const { torches, mushroom, ghostPipe } = createDungeonDecorations({
    grid: { distanceMove: () => 100 }, spawns, routes, campfires: [campfire, { x: 600, y: 210 }],
  });
  assert(Math.hypot(campfire.x - spawns[0].x, campfire.y - spawns[0].y) >= 52);
  assertEquals(torches.map(torch => torch.x), [950]);
  assert(Math.hypot(mushroom.x - campfire.x, mushroom.y - campfire.y) > 130);
  assert(Math.hypot(ghostPipe.x - mushroom.x, ghostPipe.y - mushroom.y) >= 120);
  assert(Math.hypot(ghostPipe.x - campfire.x, ghostPipe.y - campfire.y) >= 108);
});

Deno.test('webgl foundation: fire and bioluminescence have distinct, repeatable rhythms', () => {
  assert(torchLight(1, 0) !== torchLight(1, Math.PI));
  const flare = 0.76 / 0.23;
  const coalGlow = (time) => emberLight(time, 0) / fireFlicker(time, 0);
  assert(coalGlow(flare) > coalGlow(flare - 0.7) + 0.15);
  assert(coalGlow(flare) > coalGlow(flare + 0.7) + 0.15);
  const bright = biolum(1.8, 0);
  const dim = biolum(5.5, 0);
  assert(bright.intensity > dim.intensity + 0.3);
  assert(dim.intensity > 0.45);
  assert(Math.abs(bright.b - dim.b) > 0.08);
  assertEquals(biolum(1.8, 0), bright);
});

Deno.test('webgl foundation: fire flicker varies smoothly by source and respects reduced motion', () => {
  const samples = Array.from({ length: 61 }, (_, frame) => fireFlicker(frame / 60, 0));
  assert(samples.every((value) => value >= 0.75 && value <= 1.25));
  assert(Math.max(...samples) - Math.min(...samples) > 0.15);
  assert(samples.slice(1).every((value, index) => Math.abs(value - samples[index]) < 0.1));
  assertEquals(samples[30], fireFlicker(0.5, 0));
  assert(samples[30] !== fireFlicker(0.5, 1));
  assertEquals(torchLight(0, 1, true), torchLight(1, 2, true));
  assertEquals(emberLight(0, 1, true), emberLight(1, 2, true));
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
