import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  bakeHandCarvedGrid,
  handCarvedStrokeClearance,
  normalizeHandCarvedDungeon,
} from '../public/src/rules/geometry/handCarvedDungeon.js';
import { astar } from '../public/src/rules/ai/pathfind.js';

const layout = {
  schema: 'hack-arena.hand-carved-dungeon', version: 1, id: 'test-cave',
  name: 'Test cave', width: 1000, height: 1000, cellSize: 8,
  strokes: [
    { id: 'room', type: 'circle', cx: 250, cy: 500, r: 160 },
    { id: 'hall', type: 'corridor', ax: 250, ay: 500, bx: 750, by: 500, r: 50 },
    { id: 'end', type: 'rect', x: 700, y: 350, w: 220, h: 300 },
  ],
};

Deno.test('hand-carved layout keeps a compact, versioned stroke document', () => {
  const normalized = normalizeHandCarvedDungeon(layout, 'test-cave');
  assertEquals(normalized.schema, 'hack-arena.hand-carved-dungeon');
  assertEquals(normalized.cellSize, 8);
  assertEquals(normalized.strokes, layout.strokes);
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, id: 'other' }, 'test-cave'), Error, 'Invalid dungeon ID');
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, version: 2 }), Error, 'Unsupported dungeon layout schema or version');
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, strokes: [{ ...layout.strokes[0], type: 'unknown' }] }), Error, 'Unknown dungeon brush type');
});

Deno.test('hand-carved brush clearances union rooms, corridors, and rectangles', () => {
  assertEquals(handCarvedStrokeClearance(layout.strokes[0], 250, 500), 160);
  assertEquals(handCarvedStrokeClearance(layout.strokes[1], 500, 500), 50);
  assertEquals(handCarvedStrokeClearance(layout.strokes[2], 800, 500), 100);
  assert(handCarvedStrokeClearance(layout.strokes[2], 950, 500) < 0);
});

Deno.test('hand-carved geometry bakes the clearance grid consumed by collision and A*', () => {
  const grid = bakeHandCarvedGrid(normalizeHandCarvedDungeon(layout), 8);
  assertEquals([grid.cols, grid.rows], [126, 126]);
  assert(grid.distanceMove(250, 500) > 100);
  assert(grid.distanceMove(500, 500) > 30);
  assert(grid.distanceMove(800, 500) > 80);
  assertEquals(grid.distanceMove(500, 100), 0);
  assert(grid.moveGrid.some((value) => value > 0));
  assert(grid.densityGrid.some((value) => value > 0));
  assert(grid.densityGrid.some((value) => value < 0));
});

Deno.test('hand-carved passages are traversable by the enemy A* pathfinder', () => {
  const sample = {
    ...layout,
    width: 8000,
    height: 8000,
    strokes: [
      { id: 'start-room', type: 'circle', cx: 1450, cy: 4000, r: 540 },
      { id: 'passage', type: 'corridor', ax: 1450, ay: 4000, bx: 4450, by: 4000, r: 220 },
      { id: 'quarry-room', type: 'circle', cx: 5050, cy: 4000, r: 900 },
    ],
  };
  const path = astar(bakeHandCarvedGrid(sample), 1450, 4000, 5050, 4000, 20);
  assert(path?.length > 0);
  assert(path.every(({ x, y }) => sample.strokes.some((stroke) => handCarvedStrokeClearance(stroke, x, y) >= 20)));
});
