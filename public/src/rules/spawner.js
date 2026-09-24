// rules/spawner.js
// Entity creation helpers. Creates entities with the right component bundles.
// No display logic. Pure ECS.

import { Position, Velocity, Facing, Collider, Speed, Input, Actor, ActorKind, Health, Mana, Powerups, FOV, PointLight, AI, AIBehavior, Projectile, Lifetime, Spellbook, SpellId, ItemInfo, ItemSlot, Consumable, GroundItem, MeleeWeapon, WeaponPickup, BowWeapon, ArrowAmmo, RecoverableArrows, Conditions, AuraEmitter } from './components/index.js';
import { auras as auraCatalog } from './data/auraCatalog.js';

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

export function attachAuraEmitter(world, entityId, aura, { team = null, duration = null } = {}) {
  const definition = typeof aura === 'string' ? auraCatalog[aura] : aura;
  if (!definition || !Array.isArray(definition.effects)) throw new Error(`unknown aura definition: ${aura}`);
  if (!world.alive.has(entityId) || !world.has(entityId, Position)) {
    throw new Error('aura emitters require a live positioned entity');
  }
  const radius = Number(definition.radius);
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('aura radius must be positive and finite');
  const targets = definition.targets || 'all';
  if (!['hostile', 'friendly', 'all'].includes(targets)) throw new Error(`invalid aura target relationship: ${targets}`);
  const effectiveTeam = team || (!world.has(entityId, Actor) ? definition.team || null : null);
  if (!effectiveTeam && !world.has(entityId, Actor) && targets !== 'all') {
    throw new Error('non-actor aura emitters require a team when targeting hostiles or friendlies');
  }
  const requestedDuration = duration == null ? Number(definition.duration) || 0 : Number(duration) || 0;
  const lifetime = Math.max(0, requestedDuration);
  const color = definition.visual?.color;
  world.add(entityId, AuraEmitter, {
    id: String(definition.id || 'custom_aura'),
    name: String(definition.name || definition.id || 'Aura'),
    radius,
    targets,
    team: effectiveTeam,
    effects: definition.effects.map((effect) => ({ ...effect, elapsed: 0 })),
    visual: {
      glyph: String(definition.visual?.glyph || '◌'),
      color: Array.isArray(color) && color.length >= 3
        ? color.slice(0, 3).map((channel) => Number.isFinite(channel) ? Math.max(0, Math.min(1, channel)) : 1)
        : [0.65, 0.85, 1],
    },
    duration: lifetime,
    remaining: lifetime > 0 ? lifetime : -1,
    active: true,
  });
  return entityId;
}

export function spawnAuraField(world, x, y, aura, options = {}) {
  const id = world.create();
  world.add(id, Position, { x, y });
  try {
    attachAuraEmitter(world, id, aura, options);
  } catch (error) {
    world.destroy(id);
    throw error;
  }
  const duration = world.get(id, AuraEmitter).duration;
  if (duration > 0) world.add(id, Lifetime, { ttl: duration });
  return id;
}

/**
 * Spawn the local player entity.
 */
export function spawnPlayer(world, x, y, name = 'Player') {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing,   { angle: 0 });
  world.add(id, Collider, { radius: 14 });
  world.add(id, Speed,    { max: 200 });
  world.add(id, Input);
  world.add(id, Actor,    { kind: ActorKind.PLAYER, team: 'friendly', name, glyph: '@' });
  world.add(id, Health,   { hp: 100, maxHp: 100 });
  world.add(id, Mana,     { mana: 100, maxMana: 100, regenPerSecond: 5 });
  world.add(id, Powerups);
  world.add(id, Conditions);
  world.add(id, FOV,      { distance: 220, angle: 1.4 });
  world.add(id, PointLight, { radius: 350, r: 255, g: 190, b: 120 });
  world.add(id, MeleeWeapon, { damage: 5, name: 'Fists', glyph: '\u270A', rarity: '' });
  world.add(id, BowWeapon);
  world.add(id, ArrowAmmo, { count: 10 });
  world.add(id, Spellbook, {
    spells: [SpellId.FROST_BOLT, SpellId.LIGHTNING],
    activeIndex: 0,
    cooldown: 0,
    charge: 0,
    charging: false,
    cooldowns: {},
    castPhase: 'idle',
    castMode: 'instant',
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
  const rare = world.rand() < 0.09;
  const healthScale = rare ? 1.65 : 1;
  const damageScale = rare ? 1.35 : 1;
  const id = world.create();
  world.add(id, Position, { x: pos.x, y: pos.y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing,   { angle: 0 });
  world.add(id, Collider, { radius: config.radius });
  world.add(id, Speed,    { max: config.speed });
  world.add(id, Actor,    { kind: ActorKind.MOB, team: 'hostile', name: config.name, glyph: config.glyph, theme: config.theme, rare });
  world.add(id, Health,   { hp: Math.round(config.hp * healthScale), maxHp: Math.round(config.hp * healthScale) });
  world.add(id, Mana,     { mana: config.mana, maxMana: config.mana, regenPerSecond: config.manaRegen });
  world.add(id, Conditions);
  world.add(id, PointLight, config.light);
  world.add(id, AI, {
    behavior: config.behavior,
    target: targetId,
    preferredDist: config.preferredDist,
    castRate: config.castRate,
    projSpeed: config.projSpeed,
    aggroRange: config.aggroRange,
  });
  world.add(id, MeleeWeapon, { damage: Math.round(config.meleeDamage * damageScale), name: config.weapon, glyph: config.glyph });
  world.add(id, RecoverableArrows);
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

/** Spawn an automatically equipped ranged weapon. */
export function spawnWeaponPickup(world, x, y, {
  name, glyph, slot, damage, rarity = 'common', infiniteArrows = false,
  light = null,
}) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name, glyph, slot, count: 1, rarity });
  world.add(id, WeaponPickup, { slot, damage, infiniteArrows });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, light || lightForRarity(rarity));
  return id;
}

export function spawnBow(world, x, y, rarity = 'common') {
  return spawnWeaponPickup(world, x, y, {
    name: 'Short Bow', glyph: ')', slot: ItemSlot.RANGED, damage: 10, rarity,
  });
}

/**
 * Spawn a sword on the ground. Glowing "/" glyph.
 * Picking it up upgrades the player's MeleeWeapon.
 */
export function spawnSword(world, x, y, tier = 1, rarity = null) {
  const swords = [
    { name: 'Rusty Sword', glyph: '/', damage: 12, rarity: 'common' },
    { name: 'Steel Blade', glyph: '/', damage: 20, rarity: 'uncommon' },
    { name: 'Flame Brand', glyph: '/', damage: 28, rarity: 'rare' },
  ];
  const s = swords[Math.max(0, Math.min(tier, swords.length - 1))];
  return spawnWeaponPickup(world, x, y, {
    name: s.name, glyph: s.glyph, slot: ItemSlot.MELEE, damage: s.damage,
    rarity: rarity || s.rarity,
  });
}

/** Spawn a '?' spellbook that permanently teaches a mana-powered ability. */
export function spawnSpellbook(world, x, y, spellId = SpellId.POISON_ORB) {
  const spellbooks = {
    [SpellId.LIGHTNING]: { name: 'Tome of Storms', r: 95, g: 165, b: 255 },
    [SpellId.FROST_BOLT]: { name: 'Rime Grimoire', r: 135, g: 225, b: 255 },
    [SpellId.POISON_ORB]: { name: 'Venom Codex', r: 75, g: 235, b: 105 },
    [SpellId.ICE_ARMOR]: { name: 'Codex of Rimeguard', r: 125, g: 215, b: 255 },
    [SpellId.BLIZZARD]: { name: 'Wintercall Grimoire', r: 170, g: 225, b: 255 },
    [SpellId.REGENERATION]: { name: 'Verdant Scripture', r: 95, g: 245, b: 130 },
  };
  const book = spellbooks[spellId];
  if (!book) throw new Error(`unknown spellbook ability: ${spellId}`);
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: book.name, glyph: '?', slot: 'offhand', count: 1 });
  world.add(id, Consumable, { effect: 'add_spell', potency: 0, spellId });
  world.add(id, GroundItem);
  world.add(id, Collider, { radius: 10 });
  world.add(id, PointLight, { radius: 85, r: book.r, g: book.g, b: book.b });
  return id;
}

/**
 * Spawn an epic sword — high damage, purple glow.
 */
export function spawnEpicSword(world, x, y) {
  return spawnWeaponPickup(world, x, y, {
    name: 'Void Reaver', glyph: '\u2020', slot: ItemSlot.MELEE, damage: 42, rarity: 'epic',
  });
}

/** Spawn an epic bow with stronger physical arrows. */
export function spawnEpicBow(world, x, y) {
  return spawnWeaponPickup(world, x, y, {
    name: 'Shadow Longbow', glyph: '}', slot: ItemSlot.RANGED, damage: 16, rarity: 'epic',
  });
}

/** Spawn a recoverable stack of arrows on the ground. */
export function spawnArrows(world, x, y, count = 5) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, ItemInfo, { name: `Arrows (${count})`, glyph: '\u2191', slot: 'none', count });
  world.add(id, Consumable, { effect: 'add_arrows', potency: count });
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
  return spawnWeaponPickup(world, x, y, {
    name: 'Godslayer', glyph: '\u2694', slot: ItemSlot.MELEE, damage: 60, rarity: 'legendary',
  });
}

/** The Sunfire Longbow keeps the magical infinite-arrow exception. */
export function spawnLegendaryBow(world, x, y) {
  return spawnWeaponPickup(world, x, y, {
    name: 'Sunfire Longbow', glyph: '}', slot: ItemSlot.RANGED, damage: 20,
    rarity: 'legendary', infiniteArrows: true,
  });
}

function lightForRarity(rarity) {
  if (rarity === 'uncommon') return { radius: 65, r: 100, g: 220, b: 100 };
  if (rarity === 'rare') return { radius: 70, r: 80, g: 140, b: 255 };
  if (rarity === 'epic') return { radius: 80, r: 200, g: 80, b: 255 };
  if (rarity === 'legendary') return { radius: 95, r: 255, g: 200, b: 50 };
  return { radius: 55, r: 160, g: 160, b: 160 };
}
