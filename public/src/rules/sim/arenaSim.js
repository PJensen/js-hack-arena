import { World } from '../../lib/ecs-js/index.js';
import {
  AI,
  Actor,
  ActorKind,
  Collider,
  Consumable,
  Facing,
  GroundItem,
  Health,
  Input,
  ItemInfo,
  Lifetime,
  MeleeWeapon,
  PlayerTag,
  Position,
  Projectile,
  Spellbook,
  Velocity,
} from '../components/index.js';
import { mobDropTable, mobDropTotalWeight, rollTable } from '../data/lootTable.js';
import { createGridCarver } from '../geometry/carve.js';
import {
  spawnArrows,
  spawnBow,
  spawnCaster,
  spawnEpicBow,
  spawnEpicChest,
  spawnEpicSword,
  spawnLegendaryBow,
  spawnLegendarySword,
  spawnPlayer,
  spawnPotion,
  spawnSword,
} from '../spawner.js';
import { createAISystem } from '../systems/aiSystem.js';
import { createBumpSystem } from '../systems/bumpSystem.js';
import { deathSystem } from '../systems/deathSystem.js';
import { createMovementSystem } from '../systems/movementSystem.js';
import { pickupSystem } from '../systems/pickupSystem.js';
import { createPlayerCombatSystem } from '../systems/playerCombatSystem.js';
import { createProjectileSystem } from '../systems/projectileSystem.js';

export const SIM_TICK_HZ = 20;
export const SIM_DT = 1 / SIM_TICK_HZ;
export const SIM_SNAPSHOT_VERSION = 2;
export const SIM_MODE = Object.freeze({
  AUTHORITY: 'authority',
  REPLICA: 'replica',
});

const PRESENTATION_EVENTS = Object.freeze([
  'damage.dealt',
  'entity.died',
  'item.pickup',
  'projectile.expired',
  'projectile.hit',
  'projectile.wall',
  'spell.bolt',
  'spell.cast',
  'terrain.carved',
]);
const EVENT_HISTORY_LIMIT = 96;

/**
 * Authoritative gameplay world or client-side replica of one.
 * Hosts own IO and presentation; this object owns gameplay facts.
 */
export function createArenaSimulation({
  seed,
  grid,
  spawns = [],
  mode = SIM_MODE.AUTHORITY,
  enemyCount = 1,
  respawnEnemies = true,
} = {}) {
  if (!grid) throw new Error('arena simulation requires a collision grid');
  if (!Object.values(SIM_MODE).includes(mode)) throw new Error(`invalid arena simulation mode: ${mode}`);

  const world = new World({ seed });
  const playerByPeer = new Map();
  const lastInputSeqByPeer = new Map();
  const networkIdByEntity = new Map();
  const entityByNetworkId = new Map();
  const eventHistory = [];
  let tick = 0;
  let revision = 0;
  let eventSequence = 0;
  let lastAppliedRevision = -1;
  let lastAppliedEventSequence = -1;
  let populationStarted = false;

  if (mode === SIM_MODE.AUTHORITY) {
    installAuthoritativeRules(world, grid);
    installEventJournal(world, eventHistory, () => ({ tick, sequence: ++eventSequence }));
    installLootRules(world);
  }

  function addPlayer(peerId, spawnIndex = 0, networkId = null) {
    const owner = normalizePeerId(peerId);
    if (playerByPeer.has(owner)) return playerByPeer.get(owner);

    const spawn = spawns[positiveModulo(spawnIndex, Math.max(1, spawns.length))]
      || { x: 1000, y: 1000 };
    const entityId = spawnPlayer(world, spawn.x, spawn.y);
    world.add(entityId, PlayerTag);
    playerByPeer.set(owner, entityId);
    lastInputSeqByPeer.set(owner, -1);
    bindNetworkId(entityId, normalizeNetworkId(networkId ?? `player:${owner}`));
    revision += 1;

    if (mode === SIM_MODE.AUTHORITY && !populationStarted) {
      populationStarted = true;
      for (let i = 0; i < enemyCount; i++) {
        const angle = (i / Math.max(1, enemyCount)) * Math.PI * 2;
        const mobId = spawnCaster(
          world,
          grid,
          spawn.x + Math.cos(angle) * (180 + i * 30),
          spawn.y + Math.sin(angle) * (180 + i * 30),
          entityId,
        );
        ensureNetworkId(mobId, 'mob');
      }
      if (enemyCount > 0) revision += 1;
    }
    return entityId;
  }

  function removePlayer(peerId) {
    const owner = normalizePeerId(peerId);
    const entityId = playerByPeer.get(owner);
    if (entityId == null) return false;
    playerByPeer.delete(owner);
    lastInputSeqByPeer.delete(owner);
    if (world.alive.has(entityId)) world.destroy(entityId);
    retargetEnemies();
    revision += 1;
    return true;
  }

  function setPlayerInput(peerId, command = {}) {
    const owner = normalizePeerId(peerId);
    const entityId = playerByPeer.get(owner);
    if (entityId == null || !world.has(entityId, Input)) return false;

    const seq = normalizeOptionalSequence(command.seq);
    if (seq != null && seq <= (lastInputSeqByPeer.get(owner) ?? -1)) return false;
    const input = world.get(entityId, Input);
    input.moveX = clampUnit(command.moveX);
    input.moveY = clampUnit(command.moveY);
    input.aimX = clampUnit(command.aimX);
    input.aimY = clampUnit(command.aimY);
    input.fire = Boolean(command.fire);

    if (Number.isInteger(command.spellSlot) && world.has(entityId, Spellbook)) {
      const book = world.get(entityId, Spellbook);
      if (command.spellSlot >= 0 && command.spellSlot < book.spells.length) {
        book.activeIndex = command.spellSlot;
      }
    }
    if (seq != null) lastInputSeqByPeer.set(owner, seq);
    return true;
  }

  function step(dt = SIM_DT) {
    if (mode !== SIM_MODE.AUTHORITY) throw new Error('replica simulations cannot advance gameplay');
    const stepDt = Number(dt);
    if (!Number.isFinite(stepDt) || stepDt <= 0) throw new Error('arena simulation step requires a positive finite dt');
    tick += 1;
    world.tick(stepDt);
    revision += 1;
    return tick;
  }

  function captureSnapshot() {
    const entities = [];
    for (const entityId of world.alive) {
      const record = captureEntity(entityId);
      if (record) entities.push(record);
    }
    entities.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const snapshot = {
      version: SIM_SNAPSHOT_VERSION,
      tick,
      revision,
      entities,
      events: eventHistory.map(cloneEvent),
    };
    pruneRetiredNetworkIds();
    return snapshot;
  }

  function applySnapshot(rawSnapshot) {
    if (mode !== SIM_MODE.REPLICA) throw new Error('authoritative simulations cannot apply remote snapshots');
    const snapshot = normalizeSnapshot(rawSnapshot);
    if (snapshot.revision <= lastAppliedRevision) return false;

    const liveIds = new Set(snapshot.entities.map((record) => record.id));
    for (const record of snapshot.entities) ensureReplicaEntity(record);
    for (const record of snapshot.entities) applyEntityRecord(record);
    for (const [networkId, entityId] of [...entityByNetworkId]) {
      if (!liveIds.has(networkId)) {
        forgetEntity(entityId);
        if (world.alive.has(entityId)) world.destroy(entityId);
      }
    }

    tick = snapshot.tick;
    revision = snapshot.revision;
    lastAppliedRevision = snapshot.revision;
    for (const event of snapshot.events) {
      if (event.sequence <= lastAppliedEventSequence) continue;
      lastAppliedEventSequence = event.sequence;
      world.emit(event.type, { ...event.payload, sequence: event.sequence, tick: event.tick });
    }
    return true;
  }

  function getPlayerEntity(peerId) {
    return playerByPeer.get(normalizePeerId(peerId)) ?? null;
  }

  function getPlayerSnapshot(peerId) {
    const entityId = getPlayerEntity(peerId);
    return entityId != null && world.alive.has(entityId) ? captureEntity(entityId) : null;
  }

  function captureEntity(entityId) {
    if (!world.has(entityId, Position)) return null;
    if (world.has(entityId, PlayerTag)) return capturePlayer(entityId);
    if (world.has(entityId, AI)) return captureMob(entityId);
    if (world.has(entityId, Projectile)) return captureProjectile(entityId);
    if (world.has(entityId, GroundItem)) return captureItem(entityId);
    return null;
  }

  function capturePlayer(entityId) {
    const peerId = findPeerForEntity(entityId);
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const facing = world.get(entityId, Facing);
    const collider = world.get(entityId, Collider);
    const health = world.get(entityId, Health);
    const book = world.get(entityId, Spellbook);
    const weapon = world.get(entityId, MeleeWeapon);
    return {
      id: ensureNetworkId(entityId, 'player'),
      kind: 'player',
      owner: peerId,
      inputSeq: lastInputSeqByPeer.get(peerId) ?? -1,
      state: {
        x: position.x, y: position.y,
        vx: velocity.vx, vy: velocity.vy,
        facing: facing.angle,
        radius: collider.radius,
        hp: health.hp, maxHp: health.maxHp,
        spells: [...book.spells], activeSpell: book.activeIndex, cooldown: book.cooldown,
        weapon: { name: weapon.name, glyph: weapon.glyph, damage: weapon.damage },
      },
    };
  }

  function captureMob(entityId) {
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const facing = world.get(entityId, Facing);
    const collider = world.get(entityId, Collider);
    const health = world.get(entityId, Health);
    const actor = world.get(entityId, Actor);
    return {
      id: ensureNetworkId(entityId, 'mob'),
      kind: 'mob',
      state: {
        x: position.x, y: position.y,
        vx: velocity.vx, vy: velocity.vy,
        facing: facing.angle,
        radius: collider.radius,
        hp: health.hp, maxHp: health.maxHp,
        name: actor.name, glyph: actor.glyph,
      },
    };
  }

  function captureProjectile(entityId) {
    const position = world.get(entityId, Position);
    const velocity = world.get(entityId, Velocity);
    const collider = world.get(entityId, Collider);
    const projectile = world.get(entityId, Projectile);
    const lifetime = world.get(entityId, Lifetime);
    return {
      id: ensureNetworkId(entityId, 'projectile'),
      kind: 'projectile',
      state: {
        x: position.x, y: position.y,
        vx: velocity.vx, vy: velocity.vy,
        radius: collider.radius,
        damage: projectile.damage,
        team: projectile.team,
        piercing: projectile.piercing,
        trailColor: projectile.trailColor,
        burstColor: projectile.burstColor,
        ttl: lifetime.ttl,
        owner: ensureNetworkId(projectile.owner, world.has(projectile.owner, AI) ? 'mob' : 'player'),
      },
    };
  }

  function captureItem(entityId) {
    const position = world.get(entityId, Position);
    const collider = world.get(entityId, Collider);
    const info = world.get(entityId, ItemInfo);
    const consumable = world.get(entityId, Consumable);
    return {
      id: ensureNetworkId(entityId, 'item'),
      kind: 'item',
      state: {
        x: position.x, y: position.y,
        radius: collider.radius,
        name: info?.name ?? 'Item', glyph: info?.glyph ?? '?',
        effect: consumable?.effect ?? null, potency: consumable?.potency ?? 0,
      },
    };
  }

  function ensureReplicaEntity(record) {
    if (entityByNetworkId.has(record.id)) return entityByNetworkId.get(record.id);
    let entityId;
    if (record.kind === 'player') {
      entityId = addPlayer(record.owner, 0, record.id);
    } else {
      entityId = world.create();
      bindNetworkId(entityId, record.id);
      addReplicaComponents(entityId, record);
    }
    return entityId;
  }

  function addReplicaComponents(entityId, record) {
    const state = record.state;
    world.add(entityId, Position, { x: state.x, y: state.y });
    if (record.kind === 'mob') {
      world.add(entityId, Velocity, { vx: state.vx, vy: state.vy });
      world.add(entityId, Facing, { angle: state.facing });
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, Health, { hp: state.hp, maxHp: state.maxHp });
      world.add(entityId, Actor, { kind: ActorKind.MOB, name: state.name, glyph: state.glyph });
      world.add(entityId, AI, { target: null });
    } else if (record.kind === 'projectile') {
      world.add(entityId, Velocity, { vx: state.vx, vy: state.vy });
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, Projectile, recordToProjectile(state));
      world.add(entityId, Lifetime, { ttl: state.ttl });
    } else if (record.kind === 'item') {
      world.add(entityId, Collider, { radius: state.radius });
      world.add(entityId, GroundItem);
      world.add(entityId, ItemInfo, { name: state.name, glyph: state.glyph });
      if (state.effect) world.add(entityId, Consumable, { effect: state.effect, potency: state.potency });
    }
  }

  function applyEntityRecord(record) {
    const entityId = entityByNetworkId.get(record.id);
    const state = record.state;
    const position = world.get(entityId, Position);
    position.x = state.x;
    position.y = state.y;
    if (world.has(entityId, Velocity)) {
      const velocity = world.get(entityId, Velocity);
      velocity.vx = state.vx;
      velocity.vy = state.vy;
    }
    if (world.has(entityId, Facing)) world.get(entityId, Facing).angle = state.facing;
    if (world.has(entityId, Collider)) world.get(entityId, Collider).radius = state.radius;
    if (world.has(entityId, Health)) {
      const health = world.get(entityId, Health);
      health.hp = state.hp;
      health.maxHp = state.maxHp;
    }

    if (record.kind === 'player') {
      lastInputSeqByPeer.set(record.owner, record.inputSeq);
      const book = world.get(entityId, Spellbook);
      book.spells = [...state.spells];
      book.activeIndex = state.activeSpell;
      book.cooldown = state.cooldown;
      const weapon = world.get(entityId, MeleeWeapon);
      Object.assign(weapon, state.weapon);
    } else if (record.kind === 'mob') {
      const actor = world.get(entityId, Actor);
      actor.name = state.name;
      actor.glyph = state.glyph;
    } else if (record.kind === 'projectile') {
      const projectile = world.get(entityId, Projectile);
      Object.assign(projectile, recordToProjectile(state));
      projectile.owner = entityByNetworkId.get(state.owner) ?? null;
      world.get(entityId, Lifetime).ttl = state.ttl;
    }
  }

  function bindNetworkId(entityId, networkId) {
    const previous = networkIdByEntity.get(entityId);
    if (previous != null) entityByNetworkId.delete(previous);
    networkIdByEntity.set(entityId, networkId);
    entityByNetworkId.set(networkId, entityId);
  }

  function ensureNetworkId(entityId, kind) {
    if (entityId == null) return null;
    let networkId = networkIdByEntity.get(entityId);
    if (networkId) return networkId;
    if (!world.alive.has(entityId)) return null;
    networkId = `${kind}:${entityId}`;
    bindNetworkId(entityId, networkId);
    return networkId;
  }

  function forgetEntity(entityId) {
    const networkId = networkIdByEntity.get(entityId);
    const peerId = findPeerForEntity(entityId);
    if (peerId != null) {
      playerByPeer.delete(peerId);
      lastInputSeqByPeer.delete(peerId);
    }
    networkIdByEntity.delete(entityId);
    if (networkId != null) entityByNetworkId.delete(networkId);
  }

  function pruneRetiredNetworkIds() {
    const referencedOwners = new Set();
    for (const [, projectile] of world.query(Projectile)) {
      if (projectile.owner != null) referencedOwners.add(projectile.owner);
    }
    for (const [entityId, networkId] of [...networkIdByEntity]) {
      if (world.alive.has(entityId) || referencedOwners.has(entityId)) continue;
      networkIdByEntity.delete(entityId);
      entityByNetworkId.delete(networkId);
    }
  }

  function findPeerForEntity(entityId) {
    for (const [peerId, candidate] of playerByPeer) if (candidate === entityId) return peerId;
    return null;
  }

  function retargetEnemies() {
    const target = playerByPeer.values().next().value ?? null;
    for (const [, ai] of world.query(AI)) ai.target = target;
  }

  function installLootRules(targetWorld) {
    targetWorld.on('entity.died', (event) => {
      if (event.kind !== ActorKind.MOB) return;
      spawnPotion(targetWorld, event.x, event.y, 25);
      const drop = rollTable(mobDropTable, mobDropTotalWeight, targetWorld.rand);
      const itemId = spawnDrop(targetWorld, drop, event.x + targetWorld.rand() * 12 - 6, event.y + targetWorld.rand() * 12 - 6);
      if (itemId != null) ensureNetworkId(itemId, 'item');
      if (respawnEnemies) {
        const target = playerByPeer.values().next().value ?? null;
        const targetPosition = target == null ? null : targetWorld.get(target, Position);
        if (targetPosition) {
          const angle = targetWorld.rand() * Math.PI * 2;
          const distance = 280 + targetWorld.rand() * 160;
          const mobId = spawnCaster(
            targetWorld,
            grid,
            targetPosition.x + Math.cos(angle) * distance,
            targetPosition.y + Math.sin(angle) * distance,
            target,
          );
          ensureNetworkId(mobId, 'mob');
        }
      }
      revision += 1;
    });
  }

  return {
    addPlayer,
    applySnapshot,
    captureSnapshot,
    getMode: () => mode,
    getPlayerEntity,
    getPlayerSnapshot,
    getRevision: () => revision,
    getTick: () => tick,
    removePlayer,
    setPlayerInput,
    step,
    world,
  };
}

export function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('simulation snapshot must be an object');
  if (snapshot.version !== SIM_SNAPSHOT_VERSION) {
    throw new Error(`simulation snapshot version mismatch: ${snapshot.version ?? 'missing'}`);
  }
  const tick = nonNegativeInteger(snapshot.tick, 'snapshot tick');
  const revision = nonNegativeInteger(snapshot.revision, 'snapshot revision');
  if (!Array.isArray(snapshot.entities)) throw new Error('simulation snapshot entities must be an array');
  if (!Array.isArray(snapshot.events)) throw new Error('simulation snapshot events must be an array');

  const ids = new Set();
  const owners = new Set();
  const entities = snapshot.entities.map((entity) => {
    const record = normalizeEntityRecord(entity);
    if (ids.has(record.id)) throw new Error(`duplicate simulation entity id: ${record.id}`);
    if (record.kind === 'player' && owners.has(record.owner)) throw new Error(`duplicate simulation player owner: ${record.owner}`);
    ids.add(record.id);
    if (record.kind === 'player') owners.add(record.owner);
    return record;
  });
  const events = snapshot.events.map(normalizeEvent);
  return { version: SIM_SNAPSHOT_VERSION, tick, revision, entities, events };
}

function installAuthoritativeRules(world, grid) {
  const systems = [
    createMovementSystem({ grid }),
    createAISystem({ grid }),
    createPlayerCombatSystem({ grid }),
    createBumpSystem(),
    pickupSystem,
    createProjectileSystem({ grid, carve: createGridCarver(grid) }),
    deathSystem,
  ];
  world.setScheduler((targetWorld, dt) => {
    for (const system of systems) system(targetWorld, dt);
  });
}

function installEventJournal(world, history, nextIdentity) {
  for (const type of PRESENTATION_EVENTS) {
    world.on(type, (payload) => {
      const identity = nextIdentity();
      history.push({ ...identity, type, payload: clonePayload(payload) });
      if (history.length > EVENT_HISTORY_LIMIT) history.splice(0, history.length - EVENT_HISTORY_LIMIT);
    });
  }
}

function spawnDrop(world, drop, x, y) {
  if (!drop || drop.type === 'nothing') return null;
  if (drop.type === 'potion') return spawnPotion(world, x, y, drop.potency);
  if (drop.type === 'bow') return spawnBow(world, x, y);
  if (drop.type === 'sword') return spawnSword(world, x, y, drop.tier);
  if (drop.type === 'arrows') return spawnArrows(world, x, y, drop.count);
  if (drop.type === 'epic_chest') return spawnEpicChest(world, x, y);
  if (drop.type === 'epic_sword') return spawnEpicSword(world, x, y);
  if (drop.type === 'epic_bow') return spawnEpicBow(world, x, y);
  if (drop.type === 'legendary_sword') return spawnLegendarySword(world, x, y);
  if (drop.type === 'legendary_bow') return spawnLegendaryBow(world, x, y);
  return null;
}

function normalizeEntityRecord(entity) {
  if (!entity || typeof entity !== 'object') throw new Error('simulation entity must be an object');
  const id = normalizeNetworkId(entity.id);
  const kind = String(entity.kind || '');
  if (!['player', 'mob', 'projectile', 'item'].includes(kind)) throw new Error(`unsupported simulation entity kind: ${kind || 'missing'}`);
  const state = entity.state;
  if (!state || typeof state !== 'object') throw new Error(`simulation ${id} state must be an object`);

  if (kind === 'player') {
    return {
      id, kind,
      owner: normalizePeerId(entity.owner),
      inputSeq: snapshotSequence(entity.inputSeq),
      state: normalizePlayerState(id, state),
    };
  }
  if (kind === 'mob') return { id, kind, state: normalizeMobState(id, state) };
  if (kind === 'projectile') return { id, kind, state: normalizeProjectileState(id, state) };
  return { id, kind, state: normalizeItemState(id, state) };
}

function normalizePlayerState(id, state) {
  if (!Array.isArray(state.spells) || !state.spells.every((spell) => typeof spell === 'string')) {
    throw new Error(`simulation ${id}.spells must be an array of strings`);
  }
  const weapon = state.weapon;
  if (!weapon || typeof weapon !== 'object') throw new Error(`simulation ${id}.weapon must be an object`);
  return {
    ...normalizeBodyState(id, state),
    spells: [...state.spells],
    activeSpell: nonNegativeInteger(state.activeSpell, `${id}.activeSpell`),
    cooldown: finiteNumber(state.cooldown, `${id}.cooldown`),
    weapon: {
      name: String(weapon.name), glyph: String(weapon.glyph),
      damage: finiteNumber(weapon.damage, `${id}.weapon.damage`),
    },
  };
}

function normalizeMobState(id, state) {
  return { ...normalizeBodyState(id, state), name: String(state.name), glyph: String(state.glyph) };
}

function normalizeBodyState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`), y: finiteNumber(state.y, `${id}.y`),
    vx: finiteNumber(state.vx, `${id}.vx`), vy: finiteNumber(state.vy, `${id}.vy`),
    facing: finiteNumber(state.facing, `${id}.facing`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    hp: finiteNumber(state.hp, `${id}.hp`), maxHp: finiteNumber(state.maxHp, `${id}.maxHp`),
  };
}

function normalizeProjectileState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`), y: finiteNumber(state.y, `${id}.y`),
    vx: finiteNumber(state.vx, `${id}.vx`), vy: finiteNumber(state.vy, `${id}.vy`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    damage: finiteNumber(state.damage, `${id}.damage`),
    team: String(state.team || 'neutral'),
    piercing: Boolean(state.piercing),
    trailColor: String(state.trailColor || ''), burstColor: String(state.burstColor || ''),
    ttl: finiteNumber(state.ttl, `${id}.ttl`), owner: normalizeNetworkId(state.owner),
  };
}

function normalizeItemState(id, state) {
  return {
    x: finiteNumber(state.x, `${id}.x`), y: finiteNumber(state.y, `${id}.y`),
    radius: finiteNumber(state.radius, `${id}.radius`),
    name: String(state.name), glyph: String(state.glyph),
    effect: state.effect == null ? null : String(state.effect),
    potency: finiteNumber(state.potency, `${id}.potency`),
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || !PRESENTATION_EVENTS.includes(event.type)) {
    throw new Error('invalid simulation presentation event');
  }
  return {
    sequence: nonNegativeInteger(event.sequence, 'event sequence'),
    tick: nonNegativeInteger(event.tick, 'event tick'),
    type: event.type,
    payload: clonePayload(event.payload),
  };
}

function recordToProjectile(state) {
  return {
    damage: state.damage,
    owner: null,
    team: state.team,
    speed: Math.hypot(state.vx, state.vy),
    piercing: state.piercing,
    trailColor: state.trailColor,
    burstColor: state.burstColor,
  };
}

function cloneEvent(event) {
  return { ...event, payload: clonePayload(event.payload) };
}

function clonePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return JSON.parse(JSON.stringify(payload));
}

function normalizePeerId(peerId) {
  const id = String(peerId || '').trim();
  if (!id) throw new Error('player peer id is required');
  return id;
}

function normalizeNetworkId(id) {
  const value = String(id ?? '').trim();
  if (!value) throw new Error('simulation entity id must be a non-empty string');
  return value;
}

function positiveModulo(value, divisor) {
  const n = Number.isInteger(value) ? value : 0;
  return ((n % divisor) + divisor) % divisor;
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function normalizeOptionalSequence(value) {
  if (value == null) return null;
  const seq = Number(value);
  return Number.isInteger(seq) && seq >= 0 ? seq : null;
}

function snapshotSequence(value) {
  const seq = Number(value);
  if (!Number.isInteger(seq) || seq < -1) throw new Error('simulation input sequence must be an integer greater than or equal to -1');
  return seq;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`simulation ${field} must be a non-negative integer`);
  return number;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`simulation ${field} must be finite`);
  return number;
}
