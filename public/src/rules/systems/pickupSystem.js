// Consumables are collected by walking over them; gear requires an explicit
// intent from their comparison card. Replaced equipment is dropped nearby.
import {
  ArrowAmmo, BowWeapon, Collider, Conditions, Consumable, Facing, Gold, GroundItem, Health,
  Input, ItemInfo, ItemSlot, LootToss, Mana, MaterialStacks, MeleeWeapon, PickupLock, Position, Powerups,
  Ring, Spellbook, SpellId, WeaponPickup,
} from '../components/index.js';
import { ConditionId } from '../data/conditionCatalog.js';
import { getMiningMaterial } from '../data/miningMaterials.js';
import { applyCondition, applyHealing } from '../effects.js';
import { findOpenNear, spawnRing, spawnWeaponPickup } from '../spawner.js';

export function createPickupSystem({ grid = null, mine } = {}) {
  return function pickupSystem(world, dt) {
    const players = [];
    for (const [id, pos, col, hp, input] of world.query(Position, Collider, Health, Input)) {
      if (hp.dead || hp.hp <= 0) continue;
      players.push({ id, pos, col, input });
    }

    const toDestroy = new Set();
    for (const [itemId] of world.query(Position, Collider, GroundItem)) {
      const lock = world.get(itemId, PickupLock);
      if (lock?.remaining > 0) lock.remaining = Math.max(0, lock.remaining - dt);
    }

    for (const player of players) {
      const targetX = player.input.pickupX;
      const targetY = player.input.pickupY;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;
      player.input.pickupX = null;
      player.input.pickupY = null;
      if (player.input.mine) {
        player.input.mine = false;
        mine?.(world, player, targetX, targetY);
        continue;
      }

      let selected = null;
      let selectedDistance = Infinity;
      for (const [itemId, ipos] of world.query(Position, Collider, GroundItem, ItemInfo)) {
        if (toDestroy.has(itemId) || world.has(itemId, LootToss)) continue;
        if (!isGear(world, itemId)) continue;
        const lock = world.get(itemId, PickupLock);
        if (lock?.owner === player.id && lock.remaining > 0) continue;
        const targetDistance = Math.hypot(ipos.x - targetX, ipos.y - targetY);
        if (targetDistance > 28 || targetDistance >= selectedDistance) continue;
        if (Math.hypot(player.pos.x - ipos.x, player.pos.y - ipos.y) > 160) continue;
        selected = itemId;
        selectedDistance = targetDistance;
      }
      if (selected != null && applyItemPickup(world, player.id, selected, grid)) {
        toDestroy.add(selected);
      }
    }

    for (const [itemId, ipos, icol] of world.query(Position, Collider, GroundItem)) {
      if (toDestroy.has(itemId) || world.has(itemId, LootToss)) continue;
      if (isGear(world, itemId)) continue;
      const lock = world.get(itemId, PickupLock);
      for (const player of players) {
        if (lock?.owner === player.id && lock.remaining > 0) continue;
        const dx = player.pos.x - ipos.x, dy = player.pos.y - ipos.y;
        if (Math.hypot(dx, dy) >= player.col.radius + icol.radius + 6) continue;
        if (applyItemPickup(world, player.id, itemId, grid)) {
          toDestroy.add(itemId);
          break;
        }
      }
    }
    for (const id of toDestroy) world.destroy(id);
  };
}

// Kept as a convenient standalone system for small rule-level callers.
export function pickupSystem(world, dt) {
  return createPickupSystem()(world, dt);
}

function isGear(world, itemId) {
  return world.has(itemId, WeaponPickup) || world.has(itemId, Ring);
}

// Apply the selected item's effect. The caller handles access and removal.
export function applyItemPickup(world, playerId, itemId, grid) {
  const player = { id: playerId, pos: world.get(playerId, Position), hp: world.get(playerId, Health) };
  const ipos = world.get(itemId, Position);
  const info = world.get(itemId, ItemInfo);
  if (isGear(world, itemId)) {
    equipGear(world, player, { itemId, ipos, info }, grid);
    return true;
  }
  const consumable = world.get(itemId, Consumable);
  return consumable ? consumeItem(world, player, itemId, ipos, info, consumable) : false;
}

function equipGear(world, player, { itemId, ipos, info }, grid) {
  const ring = world.get(itemId, Ring);
  const pickup = world.get(itemId, WeaponPickup);
  const slot = ring ? ItemSlot.RING : pickup.slot || info.slot;
  const dropPosition = getDropPosition(world, player, ipos, grid);

  if (ring) {
    const current = world.get(player.id, Ring);
    if (current.name) {
      const dropped = spawnRing(world, dropPosition.x, dropPosition.y, current);
      lockDroppedGear(world, dropped, player.id);
    }
    Object.assign(current, ring);
  } else if (slot === ItemSlot.MELEE) {
    const current = world.get(player.id, MeleeWeapon);
    if (current && current.name !== 'Fists') {
      dropEquippedWeapon(world, dropPosition, player.id, {
        name: current.name, glyph: current.glyph, rarity: current.rarity,
        slot: ItemSlot.MELEE, damage: current.damage,
      });
    }
    Object.assign(current, {
      name: info.name, glyph: info.glyph, rarity: info.rarity,
      damage: pickup.damage,
    });
  } else if (slot === ItemSlot.RANGED) {
    const current = world.get(player.id, BowWeapon);
    if (current?.equipped) {
      dropEquippedWeapon(world, dropPosition, player.id, {
        name: current.name, glyph: current.glyph, rarity: current.rarity,
        slot: ItemSlot.RANGED, damage: current.damage,
        infiniteArrows: current.infiniteArrows,
      });
    }
    Object.assign(current, {
      equipped: true,
      name: info.name,
      glyph: info.glyph,
      rarity: info.rarity,
      damage: pickup.damage,
      infiniteArrows: pickup.infiniteArrows,
    });
    const book = world.get(player.id, Spellbook);
    if (book && !book.spells.includes(SpellId.ARROW)) book.spells.push(SpellId.ARROW);
  } else {
    return;
  }

  world.emit('item.pickup', { entity: player.id, item: info?.name, slot, x: player.pos.x, y: player.pos.y });
}

function dropEquippedWeapon(world, position, ownerId, weapon) {
  const id = spawnWeaponPickup(world, position.x, position.y, weapon);
  lockDroppedGear(world, id, ownerId);
}

function lockDroppedGear(world, id, ownerId) {
  world.add(id, PickupLock, { owner: ownerId, remaining: 0.75 });
}

function getDropPosition(world, player, itemPosition, grid) {
  let dx = player.pos.x - itemPosition.x;
  let dy = player.pos.y - itemPosition.y;
  let length = Math.hypot(dx, dy);
  if (length < 0.01) {
    const facing = world.get(player.id, Facing)?.angle ?? 0;
    dx = Math.cos(facing + Math.PI);
    dy = Math.sin(facing + Math.PI);
    length = 1;
  }
  const x = player.pos.x + dx / length * 48;
  const y = player.pos.y + dy / length * 48;
  return grid ? findOpenNear(grid, x, y, 72) : { x, y };
}

function consumeItem(world, player, itemId, position, info, consumable) {
  const { hp, id } = player;
  const material = getMiningMaterial(consumable.effect);
  const stock = material && world.get(id, MaterialStacks);
  if (stock) {
    const type = consumable.effect;
    stock.counts[type] = (stock.counts[type] ?? 0) + info.count;
    world.emit('item.pickup', { entity: id, item: info.name, x: player.pos.x, y: player.pos.y });
    return true;
  }
  if (consumable.effect === 'heal_over_time') {
    if (hp.hp >= hp.maxHp) return false;
    if (world.get(id, Conditions)?.active.some((condition) => condition.id === ConditionId.HEALTH_POTION)) return false;
    applyCondition(world, id, ConditionId.HEALTH_POTION, id);
    world.emit('item.pickup', { entity: id, item: info?.name, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'heal') {
    const healed = applyHealing(world, id, consumable.potency, { sourceId: itemId });
    if (healed === 0) return false;
    world.emit('item.pickup', { entity: id, item: info?.name, healed, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'mana' && world.has(id, Mana)) {
    const mana = world.get(id, Mana);
    if (mana.mana >= mana.maxMana) return false;
    const restored = Math.min(consumable.potency, mana.maxMana - mana.mana);
    mana.mana += restored;
    world.emit('item.pickup', { entity: id, item: info?.name, restoredMana: restored, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'add_arrows' && world.has(id, ArrowAmmo)) {
    const ammo = world.get(id, ArrowAmmo);
    const amount = Math.max(0, Math.floor(consumable.potency));
    ammo.count += amount;
    world.emit('item.pickup', { entity: id, item: info?.name, arrows: amount, arrowCount: ammo.count, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'add_spell' && world.has(id, Spellbook)) {
    const book = world.get(id, Spellbook);
    const spellId = consumable.spellId;
    if (spellId && !book.spells.includes(spellId)) book.spells.push(spellId);
    world.emit('item.pickup', { entity: id, item: info?.name, spellId, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'mana_regen' && world.has(id, Powerups)) {
    const powerups = world.get(id, Powerups);
    powerups.manaRegenMultiplier = 2.5;
    powerups.manaRegenSeconds = Math.max(powerups.manaRegenSeconds, consumable.potency);
    world.emit('item.pickup', { entity: id, item: info?.name, powerup: 'mana_regen', duration: consumable.potency, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (['haste', 'fury', 'ward'].includes(consumable.effect) && world.has(id, Powerups)) {
    const powerups = world.get(id, Powerups);
    const config = {
      haste: ['hasteMultiplier', 'hasteSeconds', 1.45],
      fury: ['furyMultiplier', 'furySeconds', 1.6],
      ward: ['wardMultiplier', 'wardSeconds', 0.5],
    }[consumable.effect];
    powerups[config[0]] = config[2];
    powerups[config[1]] = Math.max(powerups[config[1]], consumable.potency);
    world.emit('item.pickup', { entity: id, item: info?.name, powerup: consumable.effect, duration: consumable.potency, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'gold' && world.has(id, Gold)) {
    const gold = consumable.potency;
    world.get(id, Gold).count += gold;
    world.emit('item.pickup', { entity: id, item: info?.name, gold, x: player.pos.x, y: player.pos.y });
    return true;
  }

  if (consumable.effect === 'epic_chest') {
    world.emit('chest.opened', { entity: id, x: position.x, y: position.y });
    world.emit('item.pickup', { entity: id, item: info?.name, x: player.pos.x, y: player.pos.y });
    return true;
  }

  return false;
}
