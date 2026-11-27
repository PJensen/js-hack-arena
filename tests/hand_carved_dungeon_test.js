import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  bakeHandCarvedGrid,
  createHandCarvedCave,
  handCarvedPlayerFits,
  handCarvedStrokeClearance,
  normalizeHandCarvedDungeon,
  PLAYER_COLLIDER_RADIUS,
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

Deno.test('hand-carved oval and freehand brushes have usable clearance', () => {
  const strokes = [
    { id: 'oval', type: 'ellipse', x: 100, y: 200, w: 400, h: 200 },
    { id: 'wandering-cut', type: 'path', points: [{ x: 100, y: 700 }, { x: 400, y: 650 }, { x: 800, y: 700 }], r: 40 },
  ];
  const normalized = normalizeHandCarvedDungeon({ ...layout, strokes });
  assertEquals(handCarvedStrokeClearance(normalized.strokes[0], 300, 300), 100);
  assertEquals(handCarvedStrokeClearance(normalized.strokes[0], 500, 300), 0);
  assert(handCarvedStrokeClearance(normalized.strokes[1], 400, 650) > 39);
  assert(handCarvedStrokeClearance(normalized.strokes[1], 400, 600) < 0);
  const grid = bakeHandCarvedGrid(normalized, 8);
  assert(grid.distanceMove(300, 300) > 80);
  assert(grid.distanceMove(400, 650) > 30);
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

Deno.test('eraser strokes restore rock, reduce nearby clearance, and can be carved over', () => {
  const room = { id: 'room', type: 'circle', cx: 504, cy: 504, r: 200 };
  const erase = {
    id: 'wall', type: 'path', erase: true, r: 32,
    points: [{ x: 504, y: 272 }, { x: 504, y: 736 }],
  };
  const erased = normalizeHandCarvedDungeon({ ...layout, strokes: [room, erase] });
  assertEquals(erased.strokes[1], erase);
  const grid = bakeHandCarvedGrid(erased);
  assertEquals(grid.distanceMove(504, 504), 0);
  assertEquals(grid.distanceMove(552, 504), 16);
  const reopened = bakeHandCarvedGrid({
    ...erased, strokes: [...erased.strokes, { ...room, id: 'opening', r: 24 }],
  });
  assertEquals(reopened.distanceMove(504, 504), 24);
});

Deno.test('wall roughness bakes deterministically and preserves a valid player start', () => {
  const start = { x: 248, y: 504 };
  const rough = normalizeHandCarvedDungeon({ ...layout, roughness: 65, start });
  assertEquals(rough.start, start);
  assertEquals(rough.roughness, 65);
  const preview = bakeHandCarvedGrid(rough);
  const plain = bakeHandCarvedGrid(layout);
  assert(preview.moveGrid.some((value, i) => (value > 0) !== (plain.moveGrid[i] > 0)));
  assertEquals(preview.moveGrid, bakeHandCarvedGrid(rough).moveGrid);
  assert(preview.distanceMove(start.x, start.y) >= PLAYER_COLLIDER_RADIUS);
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, roughness: 101 }), Error, 'Roughness');
});

Deno.test('player fit checks the whole footprint and rejects an erased start', () => {
  assert(handCarvedPlayerFits(layout, 250, 500));
  assert(!handCarvedPlayerFits(layout, 250, 350));
  const start = { x: 250, y: 500 };
  const rock = { id: 'rock', type: 'circle', erase: true, cx: start.x, cy: start.y, r: 80 };
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, start, strokes: [...layout.strokes, rock] }),
    Error, 'The player start needs enough room on open floor');
});

Deno.test('playtest uses the authored start, bounds, and floor', () => {
  const start = { x: 250, y: 500 };
  const draft = normalizeHandCarvedDungeon({ ...layout, start });
  const cave = createHandCarvedCave(draft);
  assertEquals(cave.bounds, { w: 1000, h: 1000 });
  assertEquals(cave.spawns, [start]);
  assert(cave.grid.distanceMove(start.x, start.y) >= PLAYER_COLLIDER_RADIUS);
  assertEquals(cave.grid.distanceMove(100, 100), 0);
  assertThrows(() => createHandCarvedCave(layout), Error, 'Set a player start');
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
