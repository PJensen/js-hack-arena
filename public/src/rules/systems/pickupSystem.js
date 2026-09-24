// Consumables are collected by walking over them; weapons require an explicit
// intent from their comparison card. Replaced equipment is dropped nearby.
import {
  ArrowAmmo, BowWeapon, Collider, Consumable, Facing, GroundItem, Health,
  Input, ItemInfo, ItemSlot, MeleeWeapon, PickupLock, Position, Powerups,
  Spellbook, SpellId, WeaponPickup,
} from '../components/index.js';
import { findOpenNear, spawnWeaponPickup } from '../spawner.js';

export function createPickupSystem({ grid = null } = {}) {
  return function pickupSystem(world, dt) {
    const players = [];
    for (const [id, pos, col, hp, input] of world.query(Position, Collider, Health, Input)) {
      if (hp.dead || hp.hp <= 0) continue;
      players.push({ id, pos, col, hp, input });
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

      let selected = null;
      let selectedDistance = Infinity;
      for (const [itemId, ipos, _collider, info] of world.query(Position, Collider, GroundItem, ItemInfo)) {
        if (!world.has(itemId, WeaponPickup) || toDestroy.has(itemId)) continue;
        const lock = world.get(itemId, PickupLock);
        if (lock?.owner === player.id && lock.remaining > 0) continue;
        const targetDistance = Math.hypot(ipos.x - targetX, ipos.y - targetY);
        if (targetDistance > 28 || targetDistance >= selectedDistance) continue;
        if (Math.hypot(player.pos.x - ipos.x, player.pos.y - ipos.y) > 160) continue;
        selected = { itemId, ipos, info };
        selectedDistance = targetDistance;
      }
      if (selected) {
        equipWeapon(world, player, selected.itemId, selected.ipos, selected.info, grid);
        toDestroy.add(selected.itemId);
      }
    }

    for (const [itemId, ipos, icol] of world.query(Position, Collider, GroundItem)) {
      if (toDestroy.has(itemId) || world.has(itemId, WeaponPickup)) continue;
      const lock = world.get(itemId, PickupLock);
      const info = world.get(itemId, ItemInfo);
      for (const player of players) {
        if (lock?.owner === player.id && lock.remaining > 0) continue;
        const dx = player.pos.x - ipos.x, dy = player.pos.y - ipos.y;
        if (Math.hypot(dx, dy) >= player.col.radius + icol.radius + 6) continue;
        if (!world.has(itemId, Consumable)) continue;
        const consumable = world.get(itemId, Consumable);
        if (consumeItem(world, player, itemId, ipos, info, consumable)) {
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

function equipWeapon(world, player, itemId, itemPosition, info, grid) {
  const pickup = world.get(itemId, WeaponPickup);
  const slot = pickup.slot || info?.slot;
  const dropPosition = getDropPosition(world, player, itemPosition, grid);

  if (slot === ItemSlot.MELEE) {
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

  world.emit('item.pickup', { entity: player.id, item: info?.name, slot });
}

function dropEquippedWeapon(world, position, ownerId, weapon) {
  const id = spawnWeaponPickup(world, position.x, position.y, weapon);
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
  if (consumable.effect === 'heal') {
    if (hp.hp >= hp.maxHp) return false;
    const healed = Math.min(consumable.potency, hp.maxHp - hp.hp);
    hp.hp += healed;
    world.emit('damage.dealt', {
      target: id, source: itemId, amount: -healed,
      x: player.pos.x, y: player.pos.y,
    });
    world.emit('item.pickup', { entity: id, item: info?.name, healed });
    return true;
  }

  if (consumable.effect === 'add_arrows' && world.has(id, ArrowAmmo)) {
    const ammo = world.get(id, ArrowAmmo);
    const amount = Math.max(0, Math.floor(consumable.potency));
    ammo.count += amount;
    world.emit('item.pickup', { entity: id, item: info?.name, arrows: amount, arrowCount: ammo.count });
    return true;
  }

  if (consumable.effect === 'add_spell' && world.has(id, Spellbook)) {
    const book = world.get(id, Spellbook);
    const spellId = consumable.spellId;
    if (spellId && !book.spells.includes(spellId)) book.spells.push(spellId);
    world.emit('item.pickup', { entity: id, item: info?.name, spellId });
    return true;
  }

  if (consumable.effect === 'mana_regen' && world.has(id, Powerups)) {
    const powerups = world.get(id, Powerups);
    powerups.manaRegenMultiplier = 2.5;
    powerups.manaRegenSeconds = Math.max(powerups.manaRegenSeconds, consumable.potency);
    world.emit('item.pickup', { entity: id, item: info?.name, powerup: 'mana_regen', duration: consumable.potency });
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
    world.emit('item.pickup', { entity: id, item: info?.name, powerup: consumable.effect, duration: consumable.potency });
    return true;
  }

  if (consumable.effect === 'epic_chest') {
    world.emit('chest.opened', { entity: id, x: position.x, y: position.y });
    world.emit('item.pickup', { entity: id, item: info?.name });
    return true;
  }

  return false;
}
