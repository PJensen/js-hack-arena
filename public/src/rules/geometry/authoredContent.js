import { seedFromString } from '../../shared/net/protocol.js';
import { AUTHORED_ENTRANCE_CLEARANCE, decorationIds, dungeonOreIds } from '../data/dungeonPlacements.js';
import { mobSpawners } from '../spawner.js';
import { mulberry32 } from './caveGen.js';
import { isOreExposed } from './oreSites.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pack = ['goblin', 'spider', 'bat', 'wraith'];
const propLists = { torch: 'torches', mushroom: 'mushrooms', ghost_pipe: 'ghostPipes' };

export function compileAuthoredContent(placements, grid, start, seed) {
  const cave = {
    camp: {}, campfires: [], chestSites: [], itemSites: [], authoredMobSites: [], oreSites: [],
    decorations: { torches: [], mushrooms: [], ghostPipes: [] },
    placementWarnings: [],
  };
  const clearance = ({ x, y }) => grid.distanceMove(x, y);
  const awayFromStart = (point) => distance(start, point) >= AUTHORED_ENTRANCE_CLEARANCE;
  const mobCounts = new Map();
  const canPlaceMob = (point, variant) => cave.authoredMobSites.length < 150
    && (mobCounts.get(variant) ?? 0) < mobSpawners[variant].maxPerDungeon
    && awayFromStart(point) && clearance(point) >= 20
    && cave.authoredMobSites.every((site) => distance(site, point) >= 40);
  const warnings = cave.placementWarnings;
  const addProp = (point, kind, random) => cave.decorations[propLists[kind]].push({ ...point, phase: random() * Math.PI * 2 });
  const addMob = (point, variant, patrol) => {
    mobCounts.set(variant, (mobCounts.get(variant) ?? 0) + 1);
    cave.authoredMobSites.push({ ...point, variant, patrolPoints: (patrol ?? []).filter((target) => clearance(target) >= 20 && awayFromStart(target)) });
  };
  const oreAvailable = (point) => cave.oreSites.every((site) => distance(site, point) >= 48);
  // Reserve authored points first so a zone cannot crowd out an exact placement.
  for (const placement of placements.filter(({ radius }) => !radius)) {
    const { kind, variant, x, y, id, patrol } = placement;
    const point = { x, y };
    const random = mulberry32(seedFromString(`${seed}:${id}`));
    if (kind === 'ore') {
      const site = findOreWall(grid, point, oreAvailable);
      if (site) cave.oreSites.push({ ...site, kind: variant });
      else warnings.push('An ore marker has no free wall nearby.');
    } else if (kind === 'mob') {
      if (canPlaceMob(point, variant)) addMob(point, variant, patrol);
      else warnings.push('A fixed mob could not be placed. Check floor clearance, the entrance, and nearby mobs.');
    } else if (clearance(point) < 14) {
      warnings.push(`A ${kind} marker needs more room on open floor.`);
    } else if (kind === 'decoration') {
      addProp(point, variant, random);
    } else if (kind === 'chest') {
      cave.chestSites.push({ ...point, loot: variant, item: placement.item, mimic: placement.mimic === true && awayFromStart(point) });
    } else if (kind === 'item') {
      cave.itemSites.push({ ...point, type: variant });
    } else if (kind === 'campfire') {
      cave.campfires.push(point);
    } else {
      cave.camp[kind === 'exit' ? 'portal' : 'bank'] = point;
    }
  }
  for (const { id, kind, variant, x, y, radius, count, patrol } of placements.filter(({ radius }) => radius)) {
    const center = { x, y };
    const random = mulberry32(seedFromString(`${seed}:${id}`));
    const points = [];
    for (let tries = 0; tries < count * 32 && points.length < count; tries++) {
      const angle = random() * Math.PI * 2, reach = Math.sqrt(random()) * radius;
      const point = tries === 0 ? center : { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
      if (kind === 'mob_zone') {
        const mob = variant === 'cave_pack' ? pack[points.length % pack.length] : variant;
        if (!canPlaceMob(point, mob)) continue;
        addMob(point, mob, patrol);
      } else if (kind === 'ore_zone') {
        const site = findOreWall(grid, point, (candidate) => distance(candidate, center) <= radius && oreAvailable(candidate));
        if (!site) continue;
        const material = variant === 'mixed' ? dungeonOreIds[Math.floor(random() * dungeonOreIds.length)] : variant;
        cave.oreSites.push({ ...site, kind: material });
      } else {
        if (clearance(point) < 16 || points.some((other) => distance(point, other) < 48)) continue;
        addProp(point, variant === 'cave' ? decorationIds[Math.floor(random() * decorationIds.length)] : variant, random);
      }
      points.push(point);
    }
    if (points.length < count) warnings.push(`A ${kind.replace('_', ' ')} placed ${points.length} of ${count} requested.`);
  }
  if (!cave.camp.bank && !cave.camp.portal) cave.camp = null;
  if (warnings.length > 4) warnings.splice(4, warnings.length - 4, `Plus ${warnings.length - 4} more placement warnings.`);
  return cave;
}

function findOreWall(grid, point, accept) {
  let best = null, closest = 65;
  const step = grid.cellSize;
  const px = Math.round(point.x / step) * step, py = Math.round(point.y / step) * step;
  for (let y = py - 64; y <= py + 64; y += step) {
    for (let x = px - 64; x <= px + 64; x += step) {
      const dist = distance(point, { x, y });
      if (dist >= closest) continue;
      const clearance = grid.distanceMove(x, y);
      if (clearance <= 0 || clearance > 26) continue;
      const nx = grid.distanceMove(x - step, y) - grid.distanceMove(x + step, y);
      const ny = grid.distanceMove(x, y - step) - grid.distanceMove(x, y + step);
      const length = Math.hypot(nx, ny);
      if (!length) continue;
      const candidate = { x, y, normalX: nx / length, normalY: ny / length };
      if (accept(candidate) && isOreExposed(grid, candidate)) {
        best = candidate;
        closest = dist;
      }
    }
  }
  return best;
}
