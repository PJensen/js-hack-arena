import { AI, AIBehavior, Collider, Facing, Health, PlayerTag, Position, Speed, Velocity } from '../components/index.js';
import { LOOT_GOBLIN_ESCAPE_WINDUP } from '../components/AI.js';
import { EffectStat } from '../data/effectCatalog.js';
import { rollMiningGemstone } from '../data/miningMaterials.js';
import { isActionLocked } from '../effects.js';
import { sweepMaxFree } from '../geometry/sweep.js';
import { spawnGold, spawnItem } from '../spawner.js';
import { getStatMultiplier } from '../stats.js';
import { tossLoot } from './lootTossSystem.js';

const CHASE_SECONDS = 12;
const TRAIL_INTERVAL = 1.4;
const NAV_STEP = 24;
const NAV_DEPTH = 7;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function installLootGoblinRules(world, grid) {
  const states = new Map();

  function stateFor(id) {
    if (!states.has(id)) {
      states.set(id, { chase: null, trail: TRAIL_INTERVAL, spills: 0, path: [], retry: 0, pursuer: null });
    }
    return states.get(id);
  }

  function startChase(state) {
    state.chase = CHASE_SECONDS;
    state.path = [];
    state.retry = 0;
  }

  function spill(id, position, gold, gems) {
    const count = gems + 1;
    const angle = world.get(id, Facing).angle + Math.PI;
    for (let index = 0; index < count; index++) {
      const item = index === 0
        ? spawnGold(world, position.x, position.y, gold)
        : spawnItem(world, position.x, position.y, { type: rollMiningGemstone(world.rand) });
      tossLoot(world, item, grid, id, {
        heading: angle + (index - (count - 1) / 2) * 0.96,
        distance: 23 + world.rand() * 14,
        peak: 14 + world.rand() * 7,
        rebound: true,
      });
    }
  }

  world.on('damage.dealt', ({ target, source, amount, periodic }) => {
    if (amount <= 0 || periodic || world.get(target, AI)?.behavior !== AIBehavior.LOOT_GOBLIN) return;
    const state = stateFor(target);
    if (state.chase === null) startChase(state);
    if (source != null && world.has(source, PlayerTag)) state.pursuer = source;
    spill(target, world.get(target, Position), 2 + Math.floor(world.rand() * 3), 1);
  });

  world.on('entity.died', ({ id, x, y }) => {
    if (world.get(id, AI)?.behavior !== AIBehavior.LOOT_GOBLIN) return;
    spill(id, { x, y }, 18, 3);
    states.delete(id);
  });

  return function lootGoblinSystem(_world, dt) {
    for (const [id, ai, pos, vel, speed, facing, collider, health] of world.query(AI, Position, Velocity, Speed, Facing, Collider, Health)) {
      if (ai.behavior !== AIBehavior.LOOT_GOBLIN || health.dead || health.hp <= 0) continue;
      const state = stateFor(id);
      vel.vx = 0;
      vel.vy = 0;

      if (state.chase !== null) {
        state.chase -= dt;
        if (state.chase <= 1e-9) {
          if (ai.escapeWindup === 0) ai.escapeWindup = LOOT_GOBLIN_ESCAPE_WINDUP;
          else ai.escapeWindup = Math.max(0, ai.escapeWindup - dt);
          if (ai.escapeWindup <= 1e-9) {
            world.emit('loot_goblin.escaped', { id, x: pos.x, y: pos.y });
            world.destroy(id);
            states.delete(id);
          }
          continue;
        }
      }

      let threat = null;
      let nearest = ai.aggroRange;
      for (const [player, , other, hp] of world.query(PlayerTag, Position, Health)) {
        if (hp.dead || hp.hp <= 0) continue;
        const gap = distance(pos, other);
        if (gap > nearest || sweepMaxFree(grid, pos.x, pos.y, other.x, other.y, 6) < 1) continue;
        threat = other;
        nearest = gap;
        state.pursuer = player;
      }
      if (threat && state.chase === null) startChase(state);
      if (isActionLocked(world, id, 'move')) continue;

      state.retry -= dt;
      if (!state.path.length && state.retry <= 0) {
        const pursuer = state.pursuer != null && world.get(state.pursuer, Health)?.hp > 0
          ? world.get(state.pursuer, Position) : null;
        state.path = planRoute(grid, pos, collider.radius, facing.angle, threat ?? pursuer, world.rand);
        state.retry = 0.35;
      }

      const waypoint = state.path[0];
      if (!waypoint) continue;
      const gap = distance(pos, waypoint);
      const runSpeed = speed.max * (state.chase === null ? 0.31 : 1) *
        getStatMultiplier(world, id, EffectStat.MOVEMENT_SPEED);
      const stride = Math.min(runSpeed * dt, gap);
      const fraction = sweepMaxFree(grid, pos.x, pos.y, waypoint.x, waypoint.y, collider.radius);
      if (fraction < 1) {
        state.path = [];
        continue;
      }
      if (gap > 0) {
        vel.vx = (waypoint.x - pos.x) / gap * stride / dt;
        vel.vy = (waypoint.y - pos.y) / gap * stride / dt;
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;
        facing.angle = Math.atan2(vel.vy, vel.vx);
      }
      if (stride >= gap) state.path.shift();

      if (state.chase !== null && stride > 0) {
        state.trail -= dt;
        if (state.trail <= 1e-9) {
          state.trail += TRAIL_INTERVAL;
          spill(id, pos, 1, ++state.spills % 3 === 0 ? 1 : 0);
        }
      }
    }
  };
}

// Search a small patch of connected floor. Scoring the destination lets a
// route turn through a dogleg even when its first step doesn't point away.
function planRoute(grid, origin, radius, heading, threat, random) {
  const start = { x: origin.x, y: origin.y, col: 0, row: 0, depth: 0, from: null };
  const queue = [start];
  const seen = new Set(['0,0']);
  const direction = heading + (random() - 0.5) * 1.8;
  const forwardX = Math.cos(direction), forwardY = Math.sin(direction);
  const threatDistance = threat ? distance(start, threat) : 0;
  let best = start;
  let bestScore = -Infinity;

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (point.depth > 0) {
      const forward = (point.x - start.x) * forwardX + (point.y - start.y) * forwardY;
      const away = threat ? distance(point, threat) - threatDistance : 0;
      const score = point.depth * NAV_STEP * 0.8 + forward * (threat ? 0.18 : 0.75) + away +
        random() * NAV_STEP * 0.33;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    if (point.depth === NAV_DEPTH) continue;

    for (const [dx, dy] of DIRECTIONS) {
      const col = point.col + dx, row = point.row + dy;
      const key = `${col},${row}`;
      const x = start.x + col * NAV_STEP, y = start.y + row * NAV_STEP;
      if (seen.has(key) || grid.distanceMove(x, y) < radius) continue;
      if (sweepMaxFree(grid, point.x, point.y, x, y, radius) < 1) continue;
      seen.add(key);
      queue.push({ x, y, col, row, depth: point.depth + 1, from: point });
    }
  }

  const path = [];
  for (let point = best; point.from; point = point.from) path.push(point);
  path.reverse();
  // Remove corners that have a clear direct approach.
  let first = path.length - 1;
  while (first > 0 && sweepMaxFree(grid, start.x, start.y, path[first].x, path[first].y, radius) < 1) first--;
  return path.slice(Math.max(0, first));
}
