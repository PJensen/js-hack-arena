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
import { AI, Actor, Health } from '../public/src/rules/components/index.js';
import { createArenaDungeonSimulation } from '../public/src/rules/sim/arenaDungeon.js';

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

Deno.test('legacy roughness migrates to strokes and bakes deterministically', () => {
  const start = { x: 248, y: 504 };
  const [room, hall, end] = layout.strokes;
  const rough = normalizeHandCarvedDungeon({
    ...layout, roughness: 65, start,
    strokes: [room, { ...hall, roughness: 25 }, { ...end, roughness: 0 }],
  });
  assertEquals(rough.start, start);
  assertEquals(rough.roughness, undefined);
  assertEquals(rough.strokes.map(({ roughness }) => roughness), [65, 25, undefined]);
  const preview = bakeHandCarvedGrid(rough);
  const plain = bakeHandCarvedGrid(layout);
  assert(preview.moveGrid.some((value, i) => (value > 0) !== (plain.moveGrid[i] > 0)));
  assertEquals(preview.moveGrid, bakeHandCarvedGrid(rough).moveGrid);
  assert(preview.distanceMove(start.x, start.y) >= PLAYER_COLLIDER_RADIUS);
  assertThrows(() => normalizeHandCarvedDungeon({ ...layout, roughness: 101 }), Error, 'Roughness');
});

Deno.test('narrow rough brushes break up a straight edge at the scale of the brush', () => {
  const wall = { id: 'wall', type: 'path', points: [{ x: 216, y: 496 }, { x: 784, y: 496 }], r: 16, roughness: 80 };
  let changes = 0;
  let last = handCarvedStrokeClearance(wall, 256, 512) > 0;
  for (let x = 260; x <= 740; x += 4) {
    const inside = handCarvedStrokeClearance(wall, x, 512) > 0;
    if (inside !== last) changes++;
    last = inside;
    assert(handCarvedStrokeClearance(wall, x, 496) > 0);
  }
  assert(changes >= 8);
});

Deno.test('a built rock wall blocks mob sight and can be carved open again', () => {
  const start = { x: 440, y: 504 };
  const room = { id: 'room', type: 'rect', x: 320, y: 280, w: 620, h: 450 };
  const wall = { id: 'wall', type: 'rect', erase: true, x: 580, y: 420, w: 64, h: 160 };
  const door = { id: 'door', type: 'corridor', ax: 530, ay: 504, bx: 686, by: 504, r: 24 };
  function goblinTarget(strokes) {
    const draft = normalizeHandCarvedDungeon({
      ...layout, start, strokes,
      placements: [{ id: 'goblin', kind: 'mob', variant: 'goblin', x: 768, y: 504 }],
    });
    const seed = 42;
    const sim = createArenaDungeonSimulation({ seed, cave: createHandCarvedCave(draft, seed) });
    const player = sim.addPlayer('designer');
    sim.step();
    const targets = [...sim.world.query(AI)].map(([, ai]) => ai.target);
    assertEquals(targets.length, 1);
    return targets[0] === player;
  }
  assert(goblinTarget([room]));
  assert(!goblinTarget([room, wall]));
  assert(goblinTarget([room, wall, door]));
});

Deno.test('brush roughness changes built rock edges without opening its core', () => {
  const room = { id: 'room', type: 'rect', x: 160, y: 160, w: 680, h: 680 };
  const wall = { id: 'wall', type: 'rect', erase: true, x: 440, y: 320, w: 128, h: 360 };
  const smooth = bakeHandCarvedGrid({ ...layout, strokes: [room, wall] });
  const draft = normalizeHandCarvedDungeon({ ...layout, strokes: [room, { ...wall, roughness: 80 }] });
  assertEquals(draft.strokes[1].roughness, 80);
  const rough = bakeHandCarvedGrid(draft);
  assert(rough.moveGrid.some((value, i) => (value > 0) !== (smooth.moveGrid[i] > 0)));
  for (let y = 368; y <= 632; y += 8) assertEquals(rough.distanceMove(504, y), 0);
  assert(rough.distanceMove(320, 504) > PLAYER_COLLIDER_RADIUS);
});

Deno.test('water paint stays on the floor and dry paint clears it without changing movement', () => {
  const room = { id: 'room', type: 'rect', x: 240, y: 240, w: 480, h: 480 };
  const water = { id: 'water', type: 'rect', x: 100, y: 320, w: 580, h: 220, floor: 'water' };
  const dry = { id: 'dry', type: 'circle', cx: 480, cy: 400, r: 56, floor: 'stone' };
  const draft = normalizeHandCarvedDungeon({ ...layout, start: { x: 360, y: 400 }, strokes: [room, water, dry] });
  assertEquals(draft.strokes, [room, water, dry]);
  const grid = bakeHandCarvedGrid(draft);
  const sample = (x, y) => grid.waterGrid[y / 8 * grid.cols + x / 8];
  assertEquals(sample(360, 400), 255);
  assertEquals(sample(480, 400), 0);
  assertEquals(sample(128, 400), 0);
  assertEquals(grid.stoneGrid[50 * grid.cols + 60], 255);
  assertEquals(grid.stoneGrid[50 * grid.cols + 45], 0);
  const stoneOnly = bakeHandCarvedGrid({ ...draft, strokes: [room, dry] });
  assertEquals(stoneOnly.stoneGrid[50 * grid.cols + 60], 255);
  assertEquals(grid.moveGrid, bakeHandCarvedGrid({ ...layout, strokes: [room] }).moveGrid);
});

Deno.test('lava paint replaces water and stone on open floor and preserves collision', () => {
  const room = { id: 'room', type: 'rect', x: 240, y: 240, w: 480, h: 480 };
  const water = { id: 'water', type: 'rect', x: 264, y: 320, w: 440, h: 220, floor: 'water' };
  const lava = { id: 'lava', type: 'rect', x: 160, y: 360, w: 384, h: 144, floor: 'lava' };
  const stone = { id: 'stone', type: 'circle', cx: 480, cy: 432, r: 32, floor: 'stone' };
  const strokes = [room, water, { ...stone, id: 'stone-under-lava', cx: 360 }, lava, stone];
  const draft = normalizeHandCarvedDungeon({ ...layout, start: { x: 360, y: 400 }, strokes });
  const { grid } = createHandCarvedCave(draft);
  const index = (x, y) => y / 8 * grid.cols + x / 8;
  assertEquals(grid.lavaGrid[index(200, 432)], 0);
  assertEquals(grid.lavaGrid[index(360, 432)], 255);
  assertEquals(grid.stoneGrid[index(360, 432)], 0);
  assertEquals(grid.waterGrid[index(360, 432)], 0);
  assertEquals(grid.lavaGrid[index(480, 432)], 0);
  assertEquals(grid.stoneGrid[index(480, 432)], 255);
  assertEquals(grid.waterGrid[index(592, 432)], 255);
  assertEquals(grid.moveGrid, bakeHandCarvedGrid({ ...draft, strokes: [room] }).moveGrid);
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

Deno.test('authored placement runs through the arena simulation and encounters stay cleared', () => {
  const start = { x: 260, y: 504 };
  const draft = normalizeHandCarvedDungeon({
    ...layout, start, width: 2000, height: 2000,
    strokes: [{ id: 'hall', type: 'rect', x: 120, y: 240, w: 1760, h: 1360 }],
    placements: [
      { id: 'torch', kind: 'decoration', variant: 'torch', x: 340, y: 500 },
      { id: 'props', kind: 'dressing', variant: 'mushroom', x: 520, y: 500, radius: 140, count: 2 },
      { id: 'chest', kind: 'chest', variant: 'fixed', item: 'void_reaver', ...start },
      { id: 'item', kind: 'item', variant: 'arrows', x: 420, y: 500 },
      { id: 'spider', kind: 'mob', variant: 'spider', x: 800, y: 504, patrol: [{ x: 800, y: 570 }] },
      { id: 'pack', kind: 'mob_zone', variant: 'cave_pack', x: 1120, y: 800, radius: 240, count: 3 },
      { id: 'hearth', kind: 'campfire', x: 280, y: 420 },
      { id: 'bank', kind: 'bank', x: 270, y: 320 },
      { id: 'exit', kind: 'exit', x: 1600, y: 500 },
      { id: 'ore', kind: 'ore', variant: 'copper', x: 142, y: 660 },
      { id: 'ore-zone', kind: 'ore_zone', variant: 'tin', x: 170, y: 1170, radius: 160, count: 2 },
    ],
  });
  const cave = createHandCarvedCave(draft, 42);
  assertEquals(cave.placementWarnings, []);
  assertEquals(cave.authoredMobSites, createHandCarvedCave(draft, 42).authoredMobSites);
  assertEquals(cave.decorations.torches.length, 1);
  assertEquals(cave.decorations.mushrooms.length, 2);
  assertEquals(cave.camp, { bank: { x: 270, y: 320 }, portal: { x: 1600, y: 500 } });
  const sim = createArenaDungeonSimulation({ seed: 42, cave });
  sim.addPlayer('designer');
  const mobs = () => [...sim.world.query(Actor, AI)];
  assertEquals(mobs().length, 4);
  const [id, , ai] = mobs()[0];
  assertEquals(ai.patrolPoints, [{ x: 800, y: 570 }]);
  assertEquals(ai.target, null);
  assertEquals(sim.getMineableOre().map(({ kind }) => kind), ['copper', 'tin', 'tin']);
  sim.world.get(id, Health).hp = 0;
  sim.step();
  assertEquals(mobs().length, 3);
  const itemNames = sim.captureSnapshot().entities.filter(({ kind }) => kind === 'item').map(({ state }) => state.name);
  assert(itemNames.includes('Void Reaver'));
  assert(itemNames.includes('Arrows (5)'));
  sim.addPlayer('second-designer');
  sim.step();
  assertEquals(mobs().length, 3);
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
