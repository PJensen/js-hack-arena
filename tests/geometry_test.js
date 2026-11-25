// tests/geometry_test.js
// deno test --allow-read tests/geometry_test.js

import { assertEquals, assert, assertAlmostEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import * as SDF from '../public/src/rules/geometry/sdf.js';
import { createKernel } from '../public/src/rules/geometry/kernel.js';
import { sweepMaxFree, moveWithSlide } from '../public/src/rules/geometry/sweep.js';
import { generateArenaCave, generateCave, CaveProfile } from '../public/src/rules/geometry/caveGen.js';
import { createChamberField } from '../public/src/rules/geometry/chamberField.js';
import { createGridCarver } from '../public/src/rules/geometry/carve.js';
import { isOreExposed, placeArenaOre } from '../public/src/rules/geometry/oreSites.js';

// ── SDF primitives ─────────────────────────────────────────────

Deno.test("SDF.circle: centre is at full radius", () => {
  assertEquals(SDF.circle(100, 100, 100, 100, 30), 30);
});

Deno.test("SDF.circle: point on boundary is 0", () => {
  assertAlmostEquals(SDF.circle(130, 100, 100, 100, 30), 0, 1e-6);
});

Deno.test("SDF.circle: outside is negative", () => {
  assert(SDF.circle(200, 200, 100, 100, 30) < 0);
});

Deno.test("SDF.capsule: point on segment centre", () => {
  assertEquals(SDF.capsule(50, 50, 0, 50, 100, 50, 20), 20);
});

// ── Kernel ─────────────────────────────────────────────────────

Deno.test("kernel: distanceMove = 0 outside all carves", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: true });
  assertEquals(k.distanceMove(500, 500), 0);
});

Deno.test("kernel: distanceMove > 0 inside a carve", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: true });
  assert(k.distanceMove(100, 100) >= 30);
});

Deno.test("kernel: affectsMove=false ignored by distanceMove", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: false });
  assertEquals(k.distanceMove(100, 100), 0);
});

Deno.test("kernel: capsule carve works", () => {
  const k = createKernel();
  k.carveCapsule(0, 50, 200, 50, 25, { affectsMove: true });
  assert(k.distanceMove(100, 50) >= 25);
  assertEquals(k.distanceMove(100, 200), 0);
});

Deno.test("kernel: serialize / deserialize roundtrip", () => {
  const k = createKernel();
  k.carveCircle(10, 20, 5, { affectsMove: true });
  k.carveCapsule(0, 0, 100, 100, 10, { affectsMove: true });
  const json = k.serialize();
  const k2 = createKernel();
  k2.deserialize(json);
  assertEquals(k2.carves.length, 2);
  assertEquals(k2.carves[0].type, 'circle');
  assertEquals(k2.carves[1].type, 'capsule');
});

Deno.test("kernel: clear empties carves", () => {
  const k = createKernel();
  k.carveCircle(0, 0, 10, {});
  k.carveCircle(0, 0, 10, {});
  k.clear();
  assertEquals(k.carves.length, 0);
});

// ── Sweep ──────────────────────────────────────────────────────

Deno.test("sweep: free path returns 1", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 200, { affectsMove: true });
  assertEquals(sweepMaxFree(k, 100, 100, 110, 100, 5), 1);
});

Deno.test("sweep: zero-length path returns 1", () => {
  const k = createKernel();
  assertEquals(sweepMaxFree(k, 50, 50, 50, 50, 10), 1);
});

// ── Wall-slide ─────────────────────────────────────────────────

Deno.test("moveWithSlide: free space moves fully", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 200, { affectsMove: true });
  const { x, y } = moveWithSlide(k, 100, 100, 10, 0, 5);
  assertAlmostEquals(x, 110, 1);
  assertAlmostEquals(y, 100, 1);
});

Deno.test("moveWithSlide: zero delta stays put", () => {
  const k = createKernel();
  const { x, y } = moveWithSlide(k, 50, 50, 0, 0, 10);
  assertEquals(x, 50);
  assertEquals(y, 50);
});

// ── Cave generation ────────────────────────────────────────────

Deno.test("generateCave: deterministic with same seed", () => {
  const a = generateCave({ seed: 12345, width: 1000, height: 1000 });
  const b = generateCave({ seed: 12345, width: 1000, height: 1000 });
  assertEquals(a.spawns, b.spawns);
  assertEquals(a.routes, b.routes);
  assertEquals(a.grid.moveGrid, b.grid.moveGrid);
  assertEquals(a.grid.densityGrid, b.grid.densityGrid);
});

Deno.test("generateCave: different seeds differ", () => {
  const a = generateCave({ seed: 111, width: 1000, height: 1000 });
  const b = generateCave({ seed: 222, width: 1000, height: 1000 });
  assert(a.grid.moveGrid.some((clearance, i) => clearance !== b.grid.moveGrid[i]));
});

Deno.test("generateCave: at least one spawn", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  assert(cave.spawns.length >= 1);
});

Deno.test("generateCave: all profiles produce open floor and connecting routes", () => {
  for (const [name, profile] of Object.entries(CaveProfile)) {
    const cave = generateCave({ seed: 99, width: 1000, height: 1000, profile });
    assert(cave.grid.moveGrid.some((clearance) => clearance > 0), `${name} produced no open floor`);
    assert(cave.routes.length > 0, `${name} produced no routes`);
  }
});

Deno.test("generateCave: route samples follow open floor between their endpoints", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  for (const { from, to, points, radius } of cave.routes) {
    assertEquals(points[0], from);
    assertEquals(points.at(-1), to);
    assert(radius > 0);
    for (const { x, y } of points) {
      assert(cave.grid.distanceMove(x, y) > 0, `route sample (${x}, ${y}) is blocked`);
    }
  }
});

Deno.test("generateCave: spawns have movement clearance", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  for (const { x, y } of cave.spawns) {
    const clearance = cave.grid.distanceMove(x, y);
    assert(clearance >= 20, `spawn (${x}, ${y}) clearance=${clearance}`);
  }
});

Deno.test("generateCave: boundary is solid", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  assertEquals(cave.grid.distanceMove(5, 5), 0);
  assertEquals(cave.grid.distanceMove(1995, 1995), 0);
  assertEquals(cave.grid.distanceMove(1000, 2), 0);
});

Deno.test('arena ore is seeded and exposed deposits sit on chamber walls', () => {
  const cave = generateArenaCave(42);
  const { grid, chambers, oreSites } = cave;
  assertEquals(oreSites, generateArenaCave(42).oreSites);
  assertEquals([...new Set(oreSites.map(({ kind }) => kind))].sort(), ['copper', 'gold', 'tin']);
  const walls = oreSites.filter((site) => !site.buried);
  const chamberFields = chambers.map(createChamberField);
  assert(walls.length > 0);
  for (const site of walls) {
    const { x, y, normalX, normalY } = site;
    const step = grid.cellSize;
    assert(chamberFields.some((field) => field(x, y) >= -8));
    assertAlmostEquals(Math.hypot(normalX, normalY), 1);
    assert(grid.distanceMove(x + step * normalX, y + step * normalY) < 18);
    assert(grid.distanceMove(x - step * normalX, y - step * normalY) > 18);
    assertAlmostEquals(grid.distanceMove(x, y), 18, 0.01);
  }

  const [copper] = walls;
  assert(isOreExposed(grid, copper));
  createGridCarver(grid)(copper.x, copper.y, 32);
  assert(!isOreExposed(grid, copper));
});

Deno.test('buried arena ore starts in solid rock and becomes visible when carved out', () => {
  const { grid, oreSites } = generateArenaCave(42);
  const buried = oreSites.filter((site) => site.buried);
  assert(buried.length > 0);
  for (const site of buried) {
    assertEquals(grid.distanceMove(site.x, site.y), 0);
    assert(!isOreExposed(grid, site));
  }
  const [site] = buried;
  createGridCarver(grid)(site.x, site.y, 24);
  assert(isOreExposed(grid, site));
});

Deno.test('arena ore skips hallway walls beyond a chamber rim', () => {
  const chamber = { x: 200, y: 200, r: 80, aspect: 1.35, angle: 0 };
  const grid = {
    cellSize: 8,
    distanceMove: (x, y) => Math.max(0, 100 - Math.abs(y - chamber.y)),
  };
  assertEquals(placeArenaOre({ grid, spawns: [chamber], chambers: [chamber] }), []);
});
