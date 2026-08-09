// rules/spawner.js
// Entity creation helpers. Creates entities with the right component bundles.
// No display logic. Pure ECS.

import { Position, Velocity, Facing, Collider, Speed, Input, Actor, ActorKind, Health, Mana, Powerups, FOV, PointLight, AI, AIBehavior, Inventory, Projectile, Lifetime, Spellbook, SpellId, ItemInfo, Consumable, GroundItem, MeleeWeapon } from './components/index.js';

/**
 * Find open ground near a point using the grid.
 */
export function findOpenNear(grid, x, y, searchRadius = 200) {
  for (let r = 0; r < searchRadius; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
      if (grid.distanceMove(tx, ty) >= 20) return { x: tx, y: ty };
    }
  }
  return { x, y };
}

/**
 * Spawn the local player entity.
 */
export function spawnPlayer(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing,   { angle: 0 });
  world.add(id, Collider, { radius: 14 });
  world.add(id, Speed,    { max: 200 });
  world.add(id, Input);
  world.add(id, Actor,    { kind: ActorKind.PLAYER, name: 'Player', glyph: '@' });
  world.add(id, Health,   { hp: 100, maxHp: 100 });
  world.add(id, Mana,     { mana: 100, maxMana: 100, regenPerSecond: 5 });
  world.add(id, Powerups);
  world.add(id, FOV,      { distance: 220, angle: 1.4 });
  world.add(id, PointLight, { radius: 350, r: 255, g: 190, b: 120 });
  world.add(id, Inventory, { items: [], capacity: 10 });
  world.add(id, MeleeWeapon, { damage: 5, name: 'Fists', glyph: '\u270A' });
  world.add(id, Spellbook, {
    spells: [SpellId.FROST_BOLT, SpellId.LIGHTNING ],
    activeIndex: 0,
    cooldown: 0,
    charge: 0,
    charging: false,
  });
  return id;
}

/**
 * Spawn a caster mob targeting the given entity.
 */
export function spawnCaster(world, grid, nearX, nearY, targetId) {
  return spawnMob(world, grid, nearX, nearY, targetId, {
    name: 'Wraith', glyph: 'W', theme: 'shadow', radius: 12,
    speed: 80, hp: 60, mana: 50, manaRegen: 6,
    light: { radius: 105, r: 145, g: 70, b: 220 },
    behavior: AIBehavior.CASTER, preferredDist: 140, castRate: 1.5,
    projSpeed: 220, meleeDamage: 10, weapon: 'Claws', aggroRange: 300,
  });
}

export function spawnMelee(world, grid, nearX, nearY, targetId) {
  return spawnMob(world, grid, nearX, nearY, targetId, {
    name: 'Goblin Raider', glyph: 'g', theme: 'fire', radius: 11,
    speed: 125, hp: 45, mana: 0, manaRegen: 0,
    light: { radius: 70, r: 255, g: 105, b: 35 },
    behavior: AIBehavior.MELEE, preferredDist: 10, castRate: 99,
    projSpeed: 0, meleeDamage: 14, weapon: 'Jagged Blade', aggroRange: 340,
  });
}

export function spawnTank(world, grid, nearX, nearY, targetId) {
  return spawnMob(world, grid, nearX, nearY, targetId, {
    name: 'Gelatinous Cube', glyph: '■', theme: 'frost', radius: 18,
    speed: 48, hp: 180, mana: 0, manaRegen: 0,
    light: { radius: 125, r: 40, g: 225, b: 190 },
    behavior: AIBehavior.MELEE, preferredDist: 14, castRate: 99,
    projSpeed: 0, meleeDamage: 18, weapon: 'Engulf', aggroRange: 260,
  });
}

function spawnMob(world, grid, nearX, nearY, targetId, config) {
  const pos = findOpenNear(grid, nearX, nearY, 400);
  const id = world.create();
  world.add(id, Position, { x: pos.x, y: pos.y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing,   { angle: 0 });
  world.add(id, Collider, { radius: config.radius });
  world.add(id, Speed,    { max: config.speed });
  world.add(id, Actor,    { kind: ActorKind.MOB, name: config.name, glyph: config.glyph, theme: config.theme });
  world.add(id, Health,   { hp: config.hp, maxHp: config.hp });
  world.add(id, Mana,     { mana: config.mana, maxMana: config.mana, regenPerSecond: config.manaRegen });
  world.add(id, PointLight, config.light);
  world.add(id, AI, {
    behavior: config.behavior,
    target: targetId,
    preferredDist: config.preferredDist,
    castRate: config.castRate,
    projSpeed: config.projSpeed,
    aggroRange: config.aggroRange,
  });
  world.add(id, MeleeWeapon, { damage: config.meleeDamage, name: config.weapon, glyph: config.glyph });
  return id;
}

/**
 * Spawn a projectile (frost bolt or shadow bolt).
 */
export function spawnProjectile(world, { x, y, angle, speed, damage, owner, radius, light, trailColor, burstColor, ttl }) {
  const id = world.create();
  world.add(id, Position, { x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20 });
  world.add(id, Velocity, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  const projData = { damage, owner, speed, piercing: false };
  if (trailColor) projData.trailColor = trailColor;
  if (burstColor) projData.burstColor = burstColor;
  world.add(id, Projectile, projData);
  world.add(id, Lifetime, { ttl: ttl || 2.5 });
  world.add(id, Collider, { radius: radius || 5 });
  if (light) {
    world.add(id, PointLight, light);
  }
  return id;
}

/**
 * Spawn a health potion on the ground. Glowing "!" glyph.
 */
export function spawnPotion(world, x, y, potency = 30) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Health Potion', glyph: '!', slot: 'none', count: 1 });
  world.add(id, Consumable, { effect: 'heal', potency });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 60, r: 255, g: 50, b: 80 });
  return id;
}

/** Spawn a temporary mana-regeneration powerup. */
export function spawnManaSurge(world, x, y, duration = 8) {
  return spawnPowerup(world, x, y, {
    name: 'Arcane Surge', glyph: '✦', effect: 'mana_regen', duration,
    light: { radius: 95, r: 65, g: 145, b: 255 },
  });
}

export function spawnHasteRune(world, x, y, duration = 7) {
  return spawnPowerup(world, x, y, {
    name: 'Haste Rune', glyph: '»', effect: 'haste', duration,
    light: { radius: 90, r: 55, g: 245, b: 190 },
  });
}

export function spawnFuryRune(world, x, y, duration = 7) {
  return spawnPowerup(world, x, y, {
    name: 'Fury Rune', glyph: '⚔', effect: 'fury', duration,
    light: { radius: 100, r: 255, g: 80, b: 35 },
  });
}

export function spawnWardRune(world, x, y, duration = 9) {
  return spawnPowerup(world, x, y, {
    name: 'Ward Rune', glyph: '◇', effect: 'ward', duration,
    light: { radius: 105, r: 195, g: 95, b: 255 },
  });
}

function spawnPowerup(world, x, y, { name, glyph, effect, duration, light }) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name, glyph, slot: 'none', count: 1 });
  world.add(id, Consumable, { effect, potency: duration });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, light);
  return id;
}

/**
 * Spawn a bow on the ground. Glowing ")" glyph.
 * Picking it up adds 'arrow' spell to the player's spellbook.
 */
export function spawnBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Short Bow', glyph: ')', slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'add_spell', potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 50, r: 200, g: 180, b: 100 });
  return id;
}

/**
 * Spawn a sword on the ground. Glowing "/" glyph.
 * Picking it up upgrades the player's MeleeWeapon.
 */
export function spawnSword(world, x, y, tier = 1) {
  const swords = [
    { name: 'Rusty Sword',  glyph: '/', damage: 12, r: 160, g: 160, b: 160 },
    { name: 'Steel Blade',  glyph: '/', damage: 20, r: 200, g: 220, b: 255 },
    { name: 'Flame Brand',  glyph: '/', damage: 28, r: 255, g: 140, b: 60 },
  ];
  const s = swords[Math.min(tier, swords.length - 1)];
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: s.name, glyph: s.glyph, slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'melee_upgrade', potency: s.damage });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 55, r: s.r, g: s.g, b: s.b });
  return id;
}

/**
 * Spawn an epic sword — high damage, purple glow.
 */
export function spawnEpicSword(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Void Reaver', glyph: '\u2020', slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'melee_upgrade', potency: 42 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 80, r: 200, g: 80, b: 255 });
  return id;
}

/**
 * Spawn an epic bow — adds arrow spell + upgrades arrow damage via event.
 */
export function spawnEpicBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Shadow Longbow', glyph: '}', slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'add_spell', potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 70, r: 160, g: 60, b: 255 });
  return id;
}

/**
 * Spawn arrow ammo on the ground — restores arrow charges / heals a small amount.
 */
export function spawnArrows(world, x, y, count = 5) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: `Arrows (${count})`, glyph: '\u2191', slot: 'none', count });
  world.add(id, Consumable, { effect: 'heal', potency: 5 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 35, r: 200, g: 180, b: 100 });
  return id;
}

/**
 * Spawn an epic chest on the ground — glowing purple chest.
 * On pickup, rolls the epic chest loot table and spawns the result nearby.
 */
export function spawnEpicChest(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Epic Chest', glyph: '\u2302', slot: 'none', count: 1 });
  world.add(id, Consumable, { effect: 'epic_chest', potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 12 });
  world.add(id, PointLight, { radius: 100, r: 200, g: 80, b: 255 });
  return id;
}

/**
 * Spawn a legendary sword — massive damage, golden glow, pulsing light.
 */
export function spawnLegendarySword(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Godslayer', glyph: '\u2694', slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'melee_upgrade', potency: 60 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 120, r: 255, g: 200, b: 50 });
  return id;
}

/**
 * Spawn a legendary bow — golden glow.
 */
export function spawnLegendaryBow(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: 'Sunfire Longbow', glyph: '}', slot: 'hand', count: 1 });
  world.add(id, Consumable, { effect: 'add_spell', potency: 0 });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 110, r: 255, g: 200, b: 50 });
  return id;
}
