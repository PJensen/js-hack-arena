// tests/geometry_test.js
// deno test --allow-read tests/geometry_test.js

import { assertEquals, assert, assertAlmostEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import * as SDF from '../src/rules/geometry/sdf.js';
import { createKernel } from '../src/rules/geometry/kernel.js';
import { sweepMaxFree, moveWithSlide } from '../src/rules/geometry/sweep.js';
import { generateCave, CaveProfile } from '../src/rules/geometry/caveGen.js';

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

// ── Cave generation (vector) ───────────────────────────────────

Deno.test("generateCave: deterministic with same seed", () => {
  const a = generateCave({ seed: 12345, width: 1000, height: 1000 });
  const b = generateCave({ seed: 12345, width: 1000, height: 1000 });
  assertEquals(a.kernel.carves.length, b.kernel.carves.length);
  assertEquals(a.rooms.length, b.rooms.length);
  assertEquals(a.spawns.length, b.spawns.length);
  if (a.spawns.length > 0) {
    assertAlmostEquals(a.spawns[0].x, b.spawns[0].x, 0.01);
    assertAlmostEquals(a.spawns[0].y, b.spawns[0].y, 0.01);
  }
});

Deno.test("generateCave: different seeds differ", () => {
  const a = generateCave({ seed: 111, width: 1000, height: 1000 });
  const b = generateCave({ seed: 222, width: 1000, height: 1000 });
  assert(a.kernel.carves.length !== b.kernel.carves.length ||
         (a.spawns[0] && b.spawns[0] && a.spawns[0].x !== b.spawns[0].x));
});

Deno.test("generateCave: at least one spawn", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  assert(cave.spawns.length >= 1);
});

Deno.test("generateCave: all profiles produce carves", () => {
  for (const [name, profile] of Object.entries(CaveProfile)) {
    const cave = generateCave({ seed: 99, width: 1000, height: 1000, profile });
    assert(cave.kernel.carves.length > 0, `${name} produced 0 carves`);
  }
});

Deno.test("generateCave: has rooms", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  assert(cave.rooms.length > 0, `expected rooms, got ${cave.rooms.length}`);
});

Deno.test("generateCave: rooms have vector data (x, y, r)", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  for (const room of cave.rooms) {
    assert(typeof room.x === 'number');
    assert(typeof room.y === 'number');
    assert(typeof room.r === 'number');
    assert(room.r > 0);
  }
});

Deno.test("generateCave: carves are SDF primitives with type field", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  for (const c of cave.kernel.carves) {
    assert(['circle', 'capsule', 'rectslot', 'square'].includes(c.type),
      `unexpected carve type: ${c.type}`);
  }
});

Deno.test("generateCave: has capsule corridors connecting rooms", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  const capsules = cave.kernel.carves.filter(c => c.type === 'capsule');
  assert(capsules.length > 0, "expected capsule corridors");
});

Deno.test("generateCave: spawns have real SDF clearance", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  for (const s of cave.spawns) {
    const clearance = cave.kernel.distanceMove(s.x, s.y);
    assert(clearance >= 20, `spawn (${s.x},${s.y}) clearance=${clearance}`);
  }
});

Deno.test("generateCave: boundary is solid (no carves at edge)", () => {
  const cave = generateCave({ seed: 42, width: 2000, height: 2000 });
  assertEquals(cave.kernel.distanceMove(5, 5), 0);
  assertEquals(cave.kernel.distanceMove(1995, 1995), 0);
  assertEquals(cave.kernel.distanceMove(1000, 2), 0);
});
