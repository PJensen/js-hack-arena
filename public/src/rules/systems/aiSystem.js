// rules/systems/aiSystem.js — AI pathing, LOS, tactical behaviour, projectile spawning
import { Position, Velocity, Speed, Facing, AI, AIBehavior, Collider, Health, Projectile, Lifetime, Mana, Actor, ActorKind } from '../components/index.js';
import { moveWithSlide, sweepMaxFree } from '../geometry/sweep.js';
import { astar } from '../ai/pathfind.js';
import { applyCondition, getStatMultiplier, isActionLocked } from '../effects.js';
import { ConditionId } from '../data/conditionCatalog.js';
import { ImpactKind } from '../data/spellCatalog.js';
import { GAZE_CHARGE_SECONDS, WEB_WINDUP_SECONDS } from '../components/AI.js';

const PATH_REFRESH = 0.5;        // recompute every 0.5s
const GAZE_FLASH_SECONDS = 0.25;

function hasLOS(grid, ax, ay, bx, by, gaze) {
  if (gaze) return sweepMaxFree(grid, ax, ay, bx, by, 5) === 1;
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}

export function createAISystem(ctx) {
  const { grid } = ctx;
  const aiPaths = new Map();

  return function aiSystem(world, dt) {
    for (const id of aiPaths.keys()) if (!world.alive.has(id)) aiPaths.delete(id);
    const players = [...world.query(Position, Health, Actor)]
      .filter(([, , , actor]) => actor.kind === ActorKind.PLAYER);
    for (const [id, pos, vel, spd, fac, ai, col] of world.query(Position, Velocity, Speed, Facing, AI, Collider)) {
      const gaze = ai.behavior === AIBehavior.GAZE;
      const health = gaze ? world.get(id, Health) : null;
      if (health?.dead || health?.hp <= 0) continue;
      if (gaze) ai.castCooldown = Math.max(0, ai.castCooldown - dt);
      const movementSpeed = spd.max * getStatMultiplier(world, id, 'movementSpeed');
      const moveLocked = isActionLocked(world, id, 'move');
      if (ai.behavior === AIBehavior.PASSIVE) {
        ai.target = null;
        patrol(grid, pos, vel, ai, movementSpeed, moveLocked, dt, col.radius);
        continue;
      }
      const castLocked = isActionLocked(world, id, 'cast');
      if (ai.target != null && !world.alive.has(ai.target)) ai.target = null;
      const targetHealth = world.get(ai.target, Health);
      if (targetHealth?.dead || targetHealth?.hp <= 0) ai.target = null;

      if (ai.target == null) {
        ai.webWindup = 0;
        ai.gazeCharge = 0;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const [candidate, candidatePosition, candidateHealth] of players) {
          if (candidateHealth.dead || candidateHealth.hp <= 0) continue;
          const distance = Math.hypot(candidatePosition.x - pos.x, candidatePosition.y - pos.y);
          if (distance > ai.aggroRange || distance >= nearestDistance) continue;
          if (!hasLOS(grid, pos.x, pos.y, candidatePosition.x, candidatePosition.y, gaze)) continue;
          nearest = candidate;
          nearestDistance = distance;
        }
        if (nearest != null) ai.target = nearest;
      }

      if (ai.target == null) {
        patrol(grid, pos, vel, ai, movementSpeed, moveLocked, dt, col.radius);
        continue;
      }

      if (!world.has(ai.target, Position)) {
        ai.target = null;
        ai.gazeCharge = 0;
        continue;
      }

      const tpos = world.get(ai.target, Position);
      const dx = tpos.x - pos.x, dy = tpos.y - pos.y;
      const dist = Math.hypot(dx, dy);

      // LOS check
      ai.sight = dist < ai.aggroRange && hasLOS(grid, pos.x, pos.y, tpos.x, tpos.y, gaze);

      if (gaze) {
        if (!ai.sight) {
          ai.target = null;
          ai.gazeCharge = 0;
          patrol(grid, pos, vel, ai, movementSpeed, moveLocked, dt, col.radius);
        } else {
          vel.vx = 0;
          vel.vy = 0;
          fac.angle = Math.atan2(dy, dx);
          stepGaze(world, id, ai, dt, castLocked);
        }
        continue;
      }

      if (ai.sight) {
        // ── Has LOS — tactical behaviour ──
        aiPaths.delete(id);  // drop path, we can see them
        ai.castCooldown -= dt;
        if (ai.webSpit && stepWebSpit(world, id, ai, pos, fac, dx, dy, dist, dt, castLocked)) {
          vel.vx = 0;
          vel.vy = 0;
          continue;
        }

        const melee = ai.behavior === AIBehavior.MELEE;
        const tooClose = !melee && dist < ai.preferredDist * 0.7;
        const tooFar = dist > ai.preferredDist * 1.3;

        if (dist === 0) {
          vel.vx = 0;
          vel.vy = 0;
        } else if (tooClose) {
          vel.vx = -(dx / dist) * movementSpeed;
          vel.vy = -(dy / dist) * movementSpeed;
        } else if (tooFar || melee) {
          let approachSpeed = movementSpeed * (melee ? 1 : 0.6);
          if (ai.plantAtContact) {
            const contact = col.radius + (world.get(ai.target, Collider)?.radius ?? 0) + 1;
            approachSpeed = Math.min(approachSpeed, Math.max(0, dist - contact) / dt);
          }
          vel.vx = (dx / dist) * approachSpeed;
          vel.vy = (dy / dist) * approachSpeed;
        } else {
          vel.vx = -(dy / dist) * movementSpeed * 0.4;
          vel.vy =  (dx / dist) * movementSpeed * 0.4;
        }

        fac.angle = Math.atan2(dy, dx);

        // Cast
        const mana = world.get(id, Mana);
        const manaCost = 10;
        if (!castLocked && !melee && ai.castCooldown <= 0 && (!mana || mana.mana >= manaCost)) {
          ai.castCooldown = ai.castRate;
          if (mana) mana.mana -= manaCost;
          const angle = Math.atan2(dy, dx);
          const boltId = world.create();
          world.add(boltId, Position,   { x: pos.x + Math.cos(angle) * 18, y: pos.y + Math.sin(angle) * 18 });
          world.add(boltId, Velocity,   { vx: Math.cos(angle) * ai.projSpeed, vy: Math.sin(angle) * ai.projSpeed });
          world.add(boltId, Projectile, {
            damage: 12,
            owner: id,
            team: 'enemies',
            speed: ai.projSpeed,
            piercing: false,
            trailColor: '#b060ff',
            burstColor: '#d0a0ff',
            style: 'shadow',
          });
          world.add(boltId, Lifetime,   { ttl: 2.5 });
          world.add(boltId, Collider,   { radius: 5 });
        }
      } else {
        ai.webWindup = 0;
        // ── No LOS — A* pathfind ──
        let cached = aiPaths.get(id);
        if (!cached || cached.age > PATH_REFRESH || cached.path.length === 0) {
          const path = astar(grid, pos.x, pos.y, tpos.x, tpos.y, col.radius);
          cached = { path: path || [], age: 0 };
          aiPaths.set(id, cached);
        }
        cached.age += dt;

        if (cached.path.length > 0) {
          // Steer toward next waypoint
          const wp = cached.path[0];
          const wdx = wp.x - pos.x, wdy = wp.y - pos.y;
          const wdist = Math.hypot(wdx, wdy);

          if (wdist < grid.cellSize * 2) {
            cached.path.shift();  // reached waypoint
          } else {
            vel.vx = (wdx / wdist) * movementSpeed;
            vel.vy = (wdy / wdist) * movementSpeed;
            fac.angle = Math.atan2(wdy, wdx);
          }
        } else {
          vel.vx = 0; vel.vy = 0;
        }
      }

      // Move with wall slide
      if (moveLocked) { vel.vx = 0; vel.vy = 0; }
      const mdx = vel.vx * dt, mdy = vel.vy * dt;
      if (Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01) {
        const moved = moveWithSlide(grid, pos.x, pos.y, mdx, mdy, col.radius);
        pos.x = moved.x;
        pos.y = moved.y;
      }
    }
  };
}

function stepGaze(world, id, ai, dt, castLocked) {
  if (castLocked) {
    ai.gazeCharge = 0;
  } else if (ai.castCooldown > 0) {
    if (ai.castCooldown <= ai.castRate - GAZE_FLASH_SECONDS) ai.gazeCharge = 0;
  } else {
    ai.gazeCharge = Math.min(1, ai.gazeCharge + dt / GAZE_CHARGE_SECONDS);
    if (ai.gazeCharge >= 1 - 1e-9) {
      ai.gazeCharge = 1;
      ai.castCooldown = ai.castRate;
      applyCondition(world, ai.target, ConditionId.PARALYZED, id);
    }
  }
}

function stepWebSpit(world, id, ai, pos, facing, dx, dy, distance, dt, castLocked) {
  if (castLocked) {
    ai.webWindup = 0;
    return false;
  }
  if (ai.webWindup > 0) {
    ai.webWindup = Math.max(0, ai.webWindup - dt);
    if (ai.webWindup > 1e-6) return true;
    ai.webWindup = 0;
    const vx = Math.cos(facing.angle) * ai.projSpeed;
    const vy = Math.sin(facing.angle) * ai.projSpeed;
    const shot = world.create();
    world.add(shot, Position, { x: pos.x, y: pos.y });
    world.add(shot, Velocity, { vx, vy });
    world.add(shot, Projectile, {
      damage: 0, owner: id, team: 'enemies', speed: ai.projSpeed, style: 'web',
      impacts: [{ kind: ImpactKind.APPLY_CONDITION, conditionId: ConditionId.IMMOBILIZED }],
    });
    world.add(shot, Lifetime, { ttl: 0.9 });
    world.add(shot, Collider, { radius: 5 });
    return true;
  }
  if (ai.castCooldown > 0 || distance < 55 || distance > 200) return false;
  ai.castCooldown = ai.castRate + WEB_WINDUP_SECONDS;
  ai.webWindup = WEB_WINDUP_SECONDS;
  facing.angle = Math.atan2(dy, dx);
  return true;
}

function patrol(grid, pos, vel, ai, movementSpeed, moveLocked, dt, radius) {
  if (moveLocked || !ai.patrolPoints?.length) {
    vel.vx = 0;
    vel.vy = 0;
    return;
  }
  const waypoint = ai.patrolPoints[ai.patrolIndex % ai.patrolPoints.length];
  const dx = waypoint.x - pos.x, dy = waypoint.y - pos.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 18) {
    ai.patrolIndex = (ai.patrolIndex + 1) % ai.patrolPoints.length;
    vel.vx = 0;
    vel.vy = 0;
    return;
  }
  vel.vx = (dx / distance) * movementSpeed * 0.35;
  vel.vy = (dy / distance) * movementSpeed * 0.35;
  const moved = moveWithSlide(grid, pos.x, pos.y, vel.vx * dt, vel.vy * dt, radius);
  pos.x = moved.x;
  pos.y = moved.y;
}
