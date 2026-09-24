import {
  AI, ArrowAmmo, BowWeapon, Collider, Health, Input, Lifetime, Mana, PlayerTag,
  Position, Powerups, Projectile, Spellbook, Velocity,
} from '../components/index.js';
import {
  DeliveryKind, SpellCastMode, TargetingType, spells as spellCatalog,
} from '../data/spellCatalog.js';
import { isActionLocked } from '../effects.js';
import { applyImpacts, resolveImpacts } from '../impacts.js';

export function createPlayerCombatSystem({ grid }) {
  const damagedTargets = new Set();
  let observingWorld = null;
  return function playerCombatSystem(world, dt) {
    if (observingWorld !== world) {
      observingWorld = world;
      world.on('damage.dealt', (event) => {
        if (event.amount > 0 && world.has(event.target, PlayerTag)) damagedTargets.add(event.target);
      });
    }
    for (const [playerId, , input, book, position] of world.query(PlayerTag, Input, Spellbook, Position)) {
      normalizeBook(book);
      tickCooldowns(book, dt);
      const pressed = Boolean(input.fire) && !book.triggerHeld;
      book.triggerHeld = Boolean(input.fire);

      const health = world.get(playerId, Health);
      if (health?.dead || health?.hp <= 0) {
        interruptCast(world, playerId, book, 'dead');
        continue;
      }
      if (isActionLocked(world, playerId, 'cast')) {
        interruptCast(world, playerId, book, 'silenced');
        continue;
      }
      const damaged = damagedTargets.delete(playerId);
      if (damaged && book.castPhase !== 'idle') {
        const activeSpell = spellCatalog[book.spells[book.chargeSpellIndex]];
        if (activeSpell?.cast.interruptOnDamage) {
          interruptCast(world, playerId, book, 'damage');
          continue;
        }
      }

      if (book.castPhase !== 'idle') {
        maintainCast(world, grid, playerId, input, book, position, dt);
        continue;
      }
      if (!pressed || book.spells.length === 0) continue;

      const spellIndex = Math.min(book.activeIndex, book.spells.length - 1);
      const spellId = book.spells[spellIndex];
      const spell = spellCatalog[spellId];
      if (!spell) continue;
      if (!hasRequiredWeaponAndAmmo(world, playerId, spell, { deny })) continue;
      if (!hasRequiredAim(spell, input)) {
        deny(world, playerId, spellId, 'target');
        continue;
      }
      if (book.cooldown > 0) {
        deny(world, playerId, spellId, 'global_cooldown');
        continue;
      }
      if ((book.cooldowns[spellId] || 0) > 0) {
        deny(world, playerId, spellId, 'cooldown');
        continue;
      }

      const mana = world.get(playerId, Mana);
      const minimumMana = spell.cast.mode === SpellCastMode.CHANNELED
        ? spell.mana.perTick || 0
        : manaCostFor(spell, spell.cast.mode === SpellCastMode.CHARGED ? 0.25 : 1);
      if (mana && mana.mana < minimumMana) {
        deny(world, playerId, spellId, 'mana');
        continue;
      }

      captureCast(book, spellIndex, spell, input, position);
      if (spell.cast.mode === SpellCastMode.INSTANT) {
        resolveCast(world, grid, playerId, book, position, spell, 1);
      } else if (spell.cast.mode === SpellCastMode.CHANNELED) {
        book.castPhase = 'channeling';
        book.channelRemaining = spell.cast.channelDuration;
        book.charging = true;
        engageCooldowns(book, spellId, spell);
        emitCast(world, playerId, spellId, position, book, 1, 0);
      } else {
        book.castPhase = spell.cast.mode === SpellCastMode.CHARGED ? 'charging' : 'casting';
        book.charging = true;
      }
    }
  };
}

function maintainCast(world, grid, playerId, input, book, position, dt) {
  const spellId = book.spells[book.chargeSpellIndex];
  const spell = spellCatalog[spellId];
  if (!spell) return interruptCast(world, playerId, book, 'invalid_spell');
  const moving = Math.hypot(input.moveX, input.moveY) > 0.1;

  if (book.castPhase === 'charging') {
    if (input.fire) {
      book.charge = Math.min(spell.cast.maxCharge, book.charge + dt);
      captureAim(book, input, position, spell);
      return;
    }
    const power = Math.max(0.25, Math.min(1, book.charge / spell.cast.maxCharge));
    resolveCast(world, grid, playerId, book, position, spell, power);
    return;
  }

  if ((spell.cast.interruptOnRelease && !input.fire) || (spell.cast.interruptOnMove && moving)) {
    interruptCast(world, playerId, book, !input.fire ? 'released' : 'moved');
    return;
  }

  if (book.castPhase === 'casting') {
    book.charge = Math.min(spell.cast.castTime, book.charge + dt);
    captureAim(book, input, position, spell);
    if (book.charge >= spell.cast.castTime) resolveCast(world, grid, playerId, book, position, spell, 1);
    return;
  }

  if (book.castPhase === 'channeling') {
    if (book.channelRemaining <= 0) return finishCast(book);
    const mana = world.get(playerId, Mana);
    const manaPerTick = spell.mana.perTick || 0;
    if (mana && mana.mana < manaPerTick) {
      deny(world, playerId, spellId, 'mana');
      interruptCast(world, playerId, book, 'mana');
      return;
    }
    if (mana) mana.mana = Math.max(0, mana.mana - manaPerTick);
    book.channelRemaining = Math.max(0, book.channelRemaining - dt);
    book.charge += dt;
    const fury = world.get(playerId, Powerups)?.furyMultiplier || 1;
    const impacts = resolveImpacts(spell.impacts, { amountMultiplier: fury });
    const targets = applyArea(world, playerId, spell, impacts, book.castTargetX, book.castTargetY);
    world.emit('spell.channel', {
      playerId, spellId, x: book.castTargetX, y: book.castTargetY,
      remaining: book.channelRemaining, manaCost: manaPerTick, targets,
    });
    if (book.channelRemaining <= 0) finishCast(book);
  }
}

function resolveCast(world, grid, playerId, book, position, spell, power) {
  const spellId = book.spells[book.chargeSpellIndex];
  if (!hasRequiredWeaponAndAmmo(world, playerId, spell, { deny })) {
    finishCast(book);
    return false;
  }
  const mana = world.get(playerId, Mana);
  const manaCost = manaCostFor(spell, power);
  if (mana && mana.mana < manaCost) {
    deny(world, playerId, spellId, 'mana');
    finishCast(book);
    return false;
  }

  const fury = world.get(playerId, Powerups)?.furyMultiplier || 1;
  const impacts = applyWeaponDamage(
    playerId,
    spell,
    resolveImpacts(spell.impacts, { power, amountMultiplier: fury }),
    world,
  );
  let resolved = false;
  if (spell.targeting.type === TargetingType.ENEMY_CHAIN) {
    resolved = castChain(world, grid, playerId, position, spell, impacts);
  } else if (spell.targeting.type === TargetingType.SELF) {
    resolved = applyImpacts(world, playerId, playerId, impacts, {
      x: position.x, y: position.y, spellId, damageType: spell.element,
    });
  } else if (spell.delivery.kind === DeliveryKind.PROJECTILE) {
    spawnSpellProjectile(world, playerId, position, book, spell, impacts, power);
    resolved = true;
  }
  if (!resolved) {
    finishCast(book);
    return false;
  }

  if (mana) mana.mana = Math.max(0, mana.mana - manaCost);
  spendAmmo(world, playerId, spell);
  engageCooldowns(book, spellId, spell);
  emitCast(world, playerId, spellId, position, book, power, manaCost);
  finishCast(book);
  return true;
}

function castChain(world, grid, playerId, position, spell, impacts) {
  const candidates = [];
  for (const [id, targetPosition, ,] of world.query(Position, Health, AI)) {
    const distance = Math.hypot(targetPosition.x - position.x, targetPosition.y - position.y);
    if (distance <= spell.targeting.range && hasLineOfSight(grid, position.x, position.y, targetPosition.x, targetPosition.y)) {
      candidates.push({ id, position: targetPosition, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
  if (candidates.length === 0) return false;

  const hit = new Set();
  let fromX = position.x;
  let fromY = position.y;
  for (let chain = 0; chain < spell.targeting.maxTargets; chain++) {
    let best = null;
    let bestDistance = chain === 0 ? spell.targeting.range : spell.targeting.chainRadius;
    for (const candidate of candidates) {
      if (hit.has(candidate.id)) continue;
      const distance = Math.hypot(candidate.position.x - fromX, candidate.position.y - fromY);
      if (distance <= bestDistance && hasLineOfSight(grid, fromX, fromY, candidate.position.x, candidate.position.y)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) break;
    hit.add(best.id);
    const chainImpacts = resolveImpacts(impacts, { amountMultiplier: Math.pow(0.7, chain) });
    applyImpacts(world, best.id, playerId, chainImpacts, {
      x: best.position.x, y: best.position.y, spellId: spell.id, damageType: spell.element,
    });
    world.emit('spell.bolt', {
      source: playerId, target: best.id, fromX, fromY,
      toX: best.position.x, toY: best.position.y, chain,
    });
    fromX = best.position.x;
    fromY = best.position.y;
  }
  return hit.size > 0;
}

function applyArea(world, playerId, spell, impacts, x, y) {
  let targets = 0;
  for (const [targetId, position, ,] of world.query(Position, Health, AI)) {
    if (Math.hypot(position.x - x, position.y - y) > spell.targeting.areaRadius) continue;
    if (applyImpacts(world, targetId, playerId, impacts, {
      x: position.x, y: position.y, spellId: spell.id, damageType: spell.element,
    })) targets += 1;
  }
  return targets;
}

function spawnSpellProjectile(world, playerId, position, book, spell, impacts, power) {
  const angle = Math.atan2(book.chargeAimY, book.chargeAimX);
  const speedScale = spell.cast.mode === SpellCastMode.CHARGED ? 0.8 + power * 0.35 : 1;
  const radiusScale = spell.cast.mode === SpellCastMode.CHARGED ? 0.65 + power * 1.6 : 1;
  const projectileId = world.create();
  world.add(projectileId, Position, { x: position.x + Math.cos(angle) * 20, y: position.y + Math.sin(angle) * 20 });
  world.add(projectileId, Velocity, {
    vx: Math.cos(angle) * spell.delivery.speed * speedScale,
    vy: Math.sin(angle) * spell.delivery.speed * speedScale,
  });
  const damage = impacts.find((impact) => impact.kind === 'damage')?.amount || 0;
  const bow = world.get(playerId, BowWeapon);
  const condition = impacts.find((impact) => impact.kind === 'apply_condition' || impact.kind === 'apply_aura');
  world.add(projectileId, Projectile, {
    damage: Math.max(1, Math.round(damage)), owner: playerId, team: 'players',
    speed: spell.delivery.speed, piercing: false,
    trailColor: spell.trailColor, burstColor: spell.burstColor,
    power, style: spell.element,
    conditionId: condition?.conditionId || condition?.auraId || null,
    conditionDuration: condition?.duration || 0,
    auraId: condition?.conditionId || condition?.auraId || null,
    auraDuration: condition?.duration || 0,
    impacts, spellId: spell.id,
    recoverableAmmo: spell.ammoType === 'arrow' && !bow?.infiniteArrows,
  });
  world.add(projectileId, Lifetime, { ttl: spell.delivery.ttl });
  world.add(projectileId, Collider, { radius: spell.delivery.radius * radiusScale });
}

function hasRequiredWeaponAndAmmo(world, playerId, spell, { deny }) {
  if (spell.ammoType !== 'arrow') return true;
  const bow = world.get(playerId, BowWeapon);
  if (!bow?.equipped) {
    deny(world, playerId, spell.id, 'weapon');
    return false;
  }
  if (!bow.infiniteArrows && (world.get(playerId, ArrowAmmo)?.count || 0) < 1) {
    deny(world, playerId, spell.id, 'ammo');
    return false;
  }
  return true;
}

function applyWeaponDamage(playerId, spell, impacts, world) {
  if (spell.ammoType !== 'arrow') return impacts;
  const bow = world.get(playerId, BowWeapon);
  const baseDamage = spell.impacts.find((impact) => impact.kind === 'damage')?.amount || 10;
  const scale = (bow?.damage || baseDamage) / baseDamage;
  return impacts.map((impact) => impact.kind === 'damage'
    ? { ...impact, amount: impact.amount * scale }
    : impact);
}

function spendAmmo(world, playerId, spell) {
  if (spell.ammoType !== 'arrow') return;
  const bow = world.get(playerId, BowWeapon);
  if (bow?.infiniteArrows) return;
  const ammo = world.get(playerId, ArrowAmmo);
  if (ammo) ammo.count = Math.max(0, ammo.count - 1);
}

function captureCast(book, spellIndex, spell, input, position) {
  book.chargeSpellIndex = spellIndex;
  book.castMode = spell.cast.mode;
  book.charge = 0;
  book.channelRemaining = 0;
  captureAim(book, input, position, spell);
}

function captureAim(book, input, position, spell) {
  if (Math.hypot(input.aimX, input.aimY) > 0.1) {
    book.chargeAimX = input.aimX;
    book.chargeAimY = input.aimY;
  }
  const magnitude = Math.max(0.0001, Math.hypot(book.chargeAimX, book.chargeAimY));
  const range = spell.targeting.range || 0;
  book.castTargetX = position.x + book.chargeAimX / magnitude * range;
  book.castTargetY = position.y + book.chargeAimY / magnitude * range;
}

function engageCooldowns(book, spellId, spell) {
  book.cooldown = Math.max(book.cooldown, spell.globalCooldown);
  book.cooldowns[spellId] = Math.max(book.cooldowns[spellId] || 0, spell.cooldown || 0);
}

function tickCooldowns(book, dt) {
  book.cooldown = Math.max(0, book.cooldown - dt);
  for (const spellId of Object.keys(book.cooldowns)) {
    book.cooldowns[spellId] = Math.max(0, book.cooldowns[spellId] - dt);
    if (book.cooldowns[spellId] === 0) delete book.cooldowns[spellId];
  }
}

function manaCostFor(spell, power) {
  const cost = spell.mana.cost || 0;
  return Math.round(spell.mana.chargeCost ? cost * (0.55 + power * 0.45) : cost);
}

function hasRequiredAim(spell, input) {
  return spell.targeting.type === TargetingType.SELF || Math.hypot(input.aimX, input.aimY) > 0.1;
}

function emitCast(world, playerId, spellId, position, book, power, manaCost) {
  world.emit('spell.cast', {
    playerId, spellId, x: position.x, y: position.y,
    angle: Math.atan2(book.chargeAimY, book.chargeAimX),
    charge: power, manaCost, castMode: book.castMode,
  });
}

function interruptCast(world, playerId, book, reason) {
  if (book.castPhase !== 'idle') {
    world.emit('spell.interrupted', {
      playerId, spellId: book.spells[book.chargeSpellIndex] || null, reason,
    });
  }
  finishCast(book);
}

function finishCast(book) {
  book.castPhase = 'idle';
  book.castMode = 'instant';
  book.charging = false;
  book.charge = 0;
  book.channelRemaining = 0;
}

function deny(world, playerId, spellId, reason) {
  world.emit('spell.denied', { playerId, spellId, reason });
}

function normalizeBook(book) {
  if (!book.cooldowns || typeof book.cooldowns !== 'object') book.cooldowns = {};
  if (!book.castPhase) book.castPhase = 'idle';
  if (!book.castMode) book.castMode = 'instant';
  book.triggerHeld = Boolean(book.triggerHeld);
}

function hasLineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.ceil(distance / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}
