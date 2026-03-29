// rules/spawner.js
// Entity creation helpers. Creates entities with the right component bundles.
// No display logic. Pure ECS.

import { Position, Velocity, Facing, Collider, Speed, Input, Actor, ActorKind, Health, FOV, PointLight, AI, AIBehavior, Inventory, Projectile, Lifetime, Spellbook, SpellId, ItemInfo, Consumable, GroundItem, MeleeWeapon } from './components/index.js';

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
  world.add(id, FOV,      { distance: 220, angle: 1.4 });
  world.add(id, PointLight, { radius: 350, r: 255, g: 190, b: 120 });
  world.add(id, Inventory, { items: [], capacity: 10 });
  world.add(id, MeleeWeapon, { damage: 5, name: 'Fists', glyph: '\u270A' });
  world.add(id, Spellbook, {
    spells: [SpellId.FROST_BOLT, SpellId.LIGHTNING, 'arrow'],
    activeIndex: 0,
    cooldown: 0,
  });
  return id;
}

/**
 * Spawn a caster mob targeting the given entity.
 */
export function spawnCaster(world, grid, nearX, nearY, targetId) {
  const pos = findOpenNear(grid, nearX, nearY, 400);
  const id = world.create();
  world.add(id, Position, { x: pos.x, y: pos.y });
  world.add(id, Velocity, { vx: 0, vy: 0 });
  world.add(id, Facing,   { angle: 0 });
  world.add(id, Collider, { radius: 12 });
  world.add(id, Speed,    { max: 80 });
  world.add(id, Actor,    { kind: ActorKind.MOB, name: 'Wraith', glyph: 'W' });
  world.add(id, Health,   { hp: 60, maxHp: 60 });
  world.add(id, AI, {
    behavior: AIBehavior.CASTER,
    target: targetId,
    preferredDist: 140,
    castRate: 1.5,
    projSpeed: 220,
    aggroRange: 300,
  });
  world.add(id, MeleeWeapon, { damage: 10, name: 'Claws', glyph: '\uD83D\uDC3E' });
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
  world.add(id, Collider, { radius: 8 });
  world.add(id, PointLight, { radius: 60, r: 255, g: 50, b: 80 });
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
  world.add(id, Collider, { radius: 8 });
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
  world.add(id, Collider, { radius: 8 });
  world.add(id, PointLight, { radius: 55, r: s.r, g: s.g, b: s.b });
  return id;
}
