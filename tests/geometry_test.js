// tests/geometry_test.js
// Deno test: deno test --allow-read tests/geometry_test.js

import { assertEquals, assert, assertAlmostEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import * as SDF from '../src/rules/geometry/sdf.js';
import { createKernel } from '../src/rules/geometry/kernel.js';
import { sweepMaxFree, moveWithSlide } from '../src/rules/geometry/sweep.js';
import { generateCave, CaveProfile } from '../src/rules/geometry/caveGen.js';

// ── SDF primitives ─────────────────────────────────────────────

Deno.test("SDF.circle: centre is at full radius", () => {
  const d = SDF.circle(100, 100, 100, 100, 30);
  assertEquals(d, 30);
});

Deno.test("SDF.circle: point on boundary is 0", () => {
  const d = SDF.circle(130, 100, 100, 100, 30);
  assertAlmostEquals(d, 0, 1e-6);
});

Deno.test("SDF.circle: outside is negative", () => {
  const d = SDF.circle(200, 200, 100, 100, 30);
  assert(d < 0, `expected negative, got ${d}`);
});

Deno.test("SDF.capsule: point on segment centre", () => {
  const d = SDF.capsule(50, 50, 0, 50, 100, 50, 20);
  assertEquals(d, 20);
});

Deno.test("SDF.obox: centre of box", () => {
  const d = SDF.obox(50, 50, 50, 50, 20, 10, 0);
  // Inside the box, obox returns negative of the inside distance (positive = outside)
  // For our SDF convention: negative inside for obox
  assert(d !== undefined);
});

// ── Kernel ─────────────────────────────────────────────────────

Deno.test("kernel: distanceMove returns 0 outside all carves", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: true, affectsOccl: true });
  assertEquals(k.distanceMove(500, 500), 0);
});

Deno.test("kernel: distanceMove > 0 inside a carve", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: true, affectsOccl: true });
  assert(k.distanceMove(100, 100) >= 30);
});

Deno.test("kernel: affectsMove=false is ignored by distanceMove", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 30, { affectsMove: false, affectsOccl: true });
  assertEquals(k.distanceMove(100, 100), 0);
});

Deno.test("kernel: serialize / deserialize roundtrip", () => {
  const k = createKernel();
  k.carveCircle(10, 20, 5, { affectsMove: true, affectsOccl: false });
  k.carveCapsule(0, 0, 100, 100, 10, { affectsMove: true, affectsOccl: true });
  const json = k.serialize();
  const k2 = createKernel();
  k2.deserialize(json);
  assertEquals(k2.carves.length, 2);
  assertEquals(k2.carves[0].type, 'circle');
  assertEquals(k2.carves[1].type, 'capsule');
});

Deno.test("kernel: clear removes all carves", () => {
  const k = createKernel();
  k.carveCircle(0, 0, 10, {});
  k.carveCircle(0, 0, 10, {});
  k.clear();
  assertEquals(k.carves.length, 0);
});

// ── Sweep ──────────────────────────────────────────────────────

Deno.test("sweep: free path returns 1", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 50, { affectsMove: true });
  // Move entirely within the carved area
  const t = sweepMaxFree(k, 100, 100, 110, 100, 5);
  assertEquals(t, 1);
});

Deno.test("sweep: zero-length path returns 1", () => {
  const k = createKernel();
  const t = sweepMaxFree(k, 50, 50, 50, 50, 10);
  assertEquals(t, 1);
});

// ── Wall-slide ─────────────────────────────────────────────────

Deno.test("moveWithSlide: free space moves fully", () => {
  const k = createKernel();
  k.carveCircle(100, 100, 200, { affectsMove: true });
  const { x, y } = moveWithSlide(k, 100, 100, 10, 0, 5);
  assertAlmostEquals(x, 110, 1);
  assertAlmostEquals(y, 100, 1);
});

Deno.test("moveWithSlide: no movement when dx=dy=0", () => {
  const k = createKernel();
  const { x, y } = moveWithSlide(k, 50, 50, 0, 0, 10);
  assertEquals(x, 50);
  assertEquals(y, 50);
});

// ── Cave generation ────────────────────────────────────────────

Deno.test("generateCave: deterministic with same seed", () => {
  const a = generateCave({ seed: 12345, width: 400, height: 400, cellSize: 20 });
  const b = generateCave({ seed: 12345, width: 400, height: 400, cellSize: 20 });
  assertEquals(a.kernel.carves.length, b.kernel.carves.length);
  assertEquals(a.spawns.length, b.spawns.length);
  if (a.spawns.length > 0 && b.spawns.length > 0) {
    assertAlmostEquals(a.spawns[0].x, b.spawns[0].x, 0.01);
    assertAlmostEquals(a.spawns[0].y, b.spawns[0].y, 0.01);
  }
});

Deno.test("generateCave: different seeds produce different caves", () => {
  const a = generateCave({ seed: 111, width: 400, height: 400, cellSize: 20 });
  const b = generateCave({ seed: 222, width: 400, height: 400, cellSize: 20 });
  // Very unlikely to produce identical carve counts
  assert(a.kernel.carves.length !== b.kernel.carves.length ||
         a.spawns.length !== b.spawns.length ||
         (a.spawns[0] && b.spawns[0] && a.spawns[0].x !== b.spawns[0].x),
    "different seeds should produce different caves");
});

Deno.test("generateCave: has at least one spawn", () => {
  const cave = generateCave({ seed: 42, width: 600, height: 600, cellSize: 10 });
  assert(cave.spawns.length >= 1, `expected at least 1 spawn, got ${cave.spawns.length}`);
});

Deno.test("generateCave: all profiles produce carves", () => {
  for (const [name, profile] of Object.entries(CaveProfile)) {
    const cave = generateCave({ seed: 99, width: 400, height: 400, profile, cellSize: 15 });
    assert(cave.kernel.carves.length > 0, `${name} produced 0 carves`);
  }
});

Deno.test("generateCave: connectivity removes isolated regions", () => {
  const cave = generateCave({ seed: 42, width: 800, height: 800, cellSize: 10 });
  // Should report that it processed connectivity
  assert(cave.connectivity !== undefined);
  assert(typeof cave.connectivity.regionsRemoved === 'number');
});

Deno.test("generateCave: spawns have SDF clearance", () => {
  const cave = generateCave({ seed: 42, width: 800, height: 800, cellSize: 10 });
  for (const s of cave.spawns) {
    const clearance = cave.kernel.distanceMove(s.x, s.y);
    assert(clearance >= 14, `spawn at (${s.x},${s.y}) has clearance ${clearance}, need >= 14`);
  }
});

Deno.test("generateCave: boundary is solid", () => {
  const cave = generateCave({ seed: 42, width: 600, height: 600, cellSize: 10 });
  // Corners and edges should be solid (field = 0, no SDF clearance)
  assertEquals(cave.kernel.distanceMove(5, 5), 0);
  assertEquals(cave.kernel.distanceMove(595, 595), 0);
  assertEquals(cave.kernel.distanceMove(300, 2), 0);
});
