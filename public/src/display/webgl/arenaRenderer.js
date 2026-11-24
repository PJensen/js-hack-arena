import {
  Actor, ActorKind, BowWeapon, Conditions, AuraEmitter, Collider,
  Consumable, Facing, Gold, GroundItem, Health, Input, ItemInfo, ItemSlot, Mana, MeleeWeapon,
  PickupLock, PlayerTag, PointLight, Position, Powerups, Projectile, Ring, Spellbook,
  Velocity, WeaponPickup,
} from '../../rules/components/index.js';
import { AI } from '../../rules/components/AI.js';
import { ConditionId, conditions as conditionCatalog } from '../../rules/data/conditionCatalog.js';
import { spells as spellCatalog } from '../../rules/data/spellCatalog.js';
import { rarityTextColors } from '../../rules/data/lootTable.js';
import { createMeleeImpact } from '../passes/meleeImpact.js';
import { createFloatTextPass } from '../passes/floatText.js';
import { createGorePass } from '../passes/gore.js';
import { createHudStatus } from '../ui/hudStatus.js';
import { biolum, emberLight, torchLight } from '../lightPatterns.js';
import { createWebGLDevice } from './device.js';
import { createGoreRenderer } from './goreRenderer.js';
import { createSpiderMesh } from './spiderMesh.js';
import { createGlyphAtlas } from './glyphAtlas.js';
import { createCampfireMesh } from './campfireMesh.js';
import { createGhostPipeMesh } from './ghostPipeMesh.js';
import { createLootMeshes } from './lootMesh.js';
import { LOOT_VERTEX } from './shaders/loot.vert.js';
import { LOOT_FRAGMENT } from './shaders/loot.frag.js';
import { LOOT_SHAFT_VERTEX } from './shaders/lootShaft.vert.js';
import { LOOT_SHAFT_FRAGMENT } from './shaders/lootShaft.frag.js';
import { WORLD_VERTEX } from './shaders/world.vert.js';
import { CAVE_VERTEX } from './shaders/cave.vert.js';
import { CAVE_FRAGMENT } from './shaders/cave.frag.js';
import { DISC_FRAGMENT } from './shaders/disc.frag.js';
import { GLYPH_FRAGMENT } from './shaders/glyph.frag.js';
import { PARTICLE_VERTEX } from './shaders/particle.vert.js';
import { PARTICLE_FRAGMENT } from './shaders/particle.frag.js';
import { LINE_VERTEX } from './shaders/line.vert.js';
import { SOLID_FRAGMENT } from './shaders/solid.frag.js';
import { createLightFragment } from './shaders/light.frag.js';
import { ELEMENT_FRAGMENT } from './shaders/element.frag.js';
import { POTION_GLOW_FRAGMENT } from './shaders/potionGlow.frag.js';
import { FLAME_FRAGMENT } from './shaders/flame.frag.js';
import { CAMPFIRE_VERTEX } from './shaders/campfire.vert.js';
import { PROP_MESH_FRAGMENT } from './shaders/propMesh.frag.js';
import { MUSHROOM_FRAGMENT } from './shaders/mushroom.frag.js';
import { GHOST_PIPE_VERTEX } from './shaders/ghostPipe.vert.js';
import { CUBE_FRAGMENT } from './shaders/cube.frag.js';
import { CUBE_VERTEX } from './shaders/cube.vert.js';
import { createCubeMesh } from './cubeMesh.js';
import { PROJECTILE_VERTEX } from './shaders/projectile.vert.js';
import { FROST_BOLT_FRAGMENT } from './shaders/frostBolt.frag.js';
import { CHARGE_FRAGMENT } from './shaders/charge.frag.js';
import { MELEE_ARC_VERTEX } from './shaders/meleeArc.vert.js';
import { MELEE_ARC_FRAGMENT } from './shaders/meleeArc.frag.js';

// Lighting is a core gameplay/readability layer. Keep enough simultaneous
// sources for actors, loot, projectiles, and transient spell illumination.
export const MAX_DYNAMIC_LIGHTS = 24;

function compareDirection(next, current) {
  return next > current ? 'up' : next < current ? 'down' : '';
}

function rarityColor(rarity) {
  const hex = rarityTextColors[rarity] || '#e8f1fa';
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    1,
  ];
}

function lootGlowColor(info, effect) {
  if (effect === 'heal') return [1, 0.12, 0.28];
  if (effect === 'mana') return [0.18, 0.58, 1];
  if (effect === 'epic_chest') return [0.78, 0.24, 1];
  const rarity = String(info?.rarity || 'common').toLowerCase();
  if (rarity === 'legendary') return [1, 0.72, 0.12];
  if (rarity === 'epic') return [0.78, 0.24, 1];
  if (rarity === 'rare') return [0.24, 0.5, 1];
  if (rarity === 'uncommon') return [0.22, 1, 0.42];
  return [0.75, 0.82, 0.9];
}

function lootShaftHeight(info, effect) {
  if (effect === 'heal' || effect === 'mana') return 38;
  if (effect === 'epic_chest') return 82;
  return { common: 32, uncommon: 44, rare: 60, epic: 82, legendary: 108 }[String(info?.rarity).toLowerCase()] || 32;
}

const QUAD = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
  -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
]);

function uniform(gl, program, name) {
  const found = gl.getUniformLocation(program, name);
  if (found === null) throw new Error(`WebGL program is missing ${name}`);
  return found;
}

function themeIndex(theme) {
  if (theme === 'fire' || theme === 'fury') return 0;
  if (theme === 'shadow' || theme === 'ward') return 1;
  if (theme === 'frost' || theme === 'haste') return 2;
  return 3;
}

function themeForPowerup(effect) {
  if (effect === 'fury') return 'fire';
  if (effect === 'ward') return 'shadow';
  if (effect === 'haste') return 'frost';
  return 'electric';
}

function worldProgram(device, fragment, vertex = WORLD_VERTEX) {
  const { gl } = device;
  const program = device.program(vertex, fragment);
  return {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    size: uniform(gl, program, 'u_size'),
  };
}

function directionalProgram(device, fragment) {
  const { gl } = device;
  const program = device.program(PROJECTILE_VERTEX, fragment);
  return {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    size: uniform(gl, program, 'u_size'),
    angle: uniform(gl, program, 'u_angle'),
    time: uniform(gl, program, 'u_time'),
    alpha: uniform(gl, program, 'u_alpha'),
  };
}

function uploadPropMesh(device, vertices) {
  const { gl } = device;
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, vertices);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
  return { vao, count: vertices.length / 7 };
}

function uploadCubeMesh(device, vertices) {
  const { gl } = device;
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, vertices);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  return { vao, count: vertices.length / 8 };
}

export function createWebGLArenaRenderer(deps) {
  const { canvas, overlayCanvas, cam, grid, bounds, decorations, world, fx, playerId, presentation, hud, input, net, SEED, runtimeEvents, itemTooltip, resourceBars, stepParticles } = deps;
  const syncHudStatus = createHudStatus(hud.meta);
  const device = createWebGLDevice(canvas);
  const { gl } = device;
  const overlay = overlayCanvas?.getContext('2d') || null;

  const caveProgram = device.program(CAVE_VERTEX, CAVE_FRAGMENT);
  const caveLocations = {
    view: uniform(gl, caveProgram, 'u_view'),
    field: uniform(gl, caveProgram, 'u_field'),
    gridSize: uniform(gl, caveProgram, 'u_grid_size'),
  };
  const disc = worldProgram(device, DISC_FRAGMENT);
  disc.color = uniform(gl, disc.program, 'u_color');
  disc.stroke = uniform(gl, disc.program, 'u_stroke');
  const glyph = worldProgram(device, GLYPH_FRAGMENT);
  glyph.atlas = uniform(gl, glyph.program, 'u_atlas');
  glyph.frame = uniform(gl, glyph.program, 'u_frame');
  glyph.color = uniform(gl, glyph.program, 'u_color');
  const solid = worldProgram(device, SOLID_FRAGMENT);
  solid.color = uniform(gl, solid.program, 'u_color');
  const lighting = worldProgram(device, createLightFragment(MAX_DYNAMIC_LIGHTS));
  lighting.count = uniform(gl, lighting.program, 'u_light_count');
  lighting.lights = uniform(gl, lighting.program, 'u_lights[0]');
  lighting.colors = uniform(gl, lighting.program, 'u_light_colors[0]');
  const element = worldProgram(device, ELEMENT_FRAGMENT);
  element.theme = uniform(gl, element.program, 'u_theme');
  element.time = uniform(gl, element.program, 'u_time');
  element.alpha = uniform(gl, element.program, 'u_alpha');
  const potionGlow = worldProgram(device, POTION_GLOW_FRAGMENT);
  potionGlow.theme = uniform(gl, potionGlow.program, 'u_theme');
  potionGlow.time = uniform(gl, potionGlow.program, 'u_time');
  potionGlow.alpha = uniform(gl, potionGlow.program, 'u_alpha');
  potionGlow.swirl = uniform(gl, potionGlow.program, 'u_swirl');
  const flame = worldProgram(device, FLAME_FRAGMENT);
  flame.time = uniform(gl, flame.program, 'u_time');
  flame.alpha = uniform(gl, flame.program, 'u_alpha');
  const mushroom = worldProgram(device, MUSHROOM_FRAGMENT);
  mushroom.glow = uniform(gl, mushroom.program, 'u_glow');
  mushroom.intensity = uniform(gl, mushroom.program, 'u_intensity');
  const bioluminescentProps = [decorations?.mushroom, decorations?.ghostPipe].filter(Boolean);
  const ghostPipeProgram = device.program(GHOST_PIPE_VERTEX, PROP_MESH_FRAGMENT);
  const ghostPipeLocations = {
    view: uniform(gl, ghostPipeProgram, 'u_view'),
    position: uniform(gl, ghostPipeProgram, 'u_position'),
    glow: uniform(gl, ghostPipeProgram, 'u_glow'),
    intensity: uniform(gl, ghostPipeProgram, 'u_intensity'),
  };
  const campfireProgram = device.program(CAMPFIRE_VERTEX, PROP_MESH_FRAGMENT);
  const campfireLocations = {
    view: uniform(gl, campfireProgram, 'u_view'),
    position: uniform(gl, campfireProgram, 'u_position'),
    time: uniform(gl, campfireProgram, 'u_time'),
    intensity: uniform(gl, campfireProgram, 'u_intensity'),
  };
  const cube = worldProgram(device, CUBE_FRAGMENT, CUBE_VERTEX);
  cube.time = uniform(gl, cube.program, 'u_time');
  cube.alpha = uniform(gl, cube.program, 'u_alpha');
  const cubeMesh = uploadCubeMesh(device, createCubeMesh());
  const lootProgram = device.program(LOOT_VERTEX, LOOT_FRAGMENT);
  const loot = {
    view: uniform(gl, lootProgram, 'u_view'),
    position: uniform(gl, lootProgram, 'u_position'),
    angle: uniform(gl, lootProgram, 'u_angle'),
    lean: uniform(gl, lootProgram, 'u_lean'),
    body: uniform(gl, lootProgram, 'u_body'),
    trim: uniform(gl, lootProgram, 'u_trim'),
    detail: uniform(gl, lootProgram, 'u_detail'),
  };
  const lootMeshes = Object.fromEntries(Object.entries(createLootMeshes())
    .map(([name, vertices]) => [name, uploadPropMesh(device, vertices)]));
  const lootShaft = worldProgram(device, LOOT_SHAFT_FRAGMENT, LOOT_SHAFT_VERTEX);
  lootShaft.color = uniform(gl, lootShaft.program, 'u_color');
  lootShaft.time = uniform(gl, lootShaft.program, 'u_time');
  const frostBolt = directionalProgram(device, FROST_BOLT_FRAGMENT);
  const charge = worldProgram(device, CHARGE_FRAGMENT);
  charge.theme = uniform(gl, charge.program, 'u_theme');
  charge.time = uniform(gl, charge.program, 'u_time');
  charge.alpha = uniform(gl, charge.program, 'u_alpha');
  charge.charge = uniform(gl, charge.program, 'u_charge');
  charge.theme = uniform(gl, charge.program, 'u_theme');
  charge.time = uniform(gl, charge.program, 'u_time');
  charge.alpha = uniform(gl, charge.program, 'u_alpha');
  charge.charge = uniform(gl, charge.program, 'u_charge');

  const meleeArcProgram = device.program(MELEE_ARC_VERTEX, MELEE_ARC_FRAGMENT);
  const meleeArc = {
    program: meleeArcProgram,
    view: uniform(gl, meleeArcProgram, 'u_view'),
    origin: uniform(gl, meleeArcProgram, 'u_origin'),
    range: uniform(gl, meleeArcProgram, 'u_range'),
    angle: uniform(gl, meleeArcProgram, 'u_angle'),
    halfAngle: uniform(gl, meleeArcProgram, 'u_half_angle'),
    progress: uniform(gl, meleeArcProgram, 'u_progress'),
    rend: uniform(gl, meleeArcProgram, 'u_rend'),
  };

  const lineProgram = device.program(LINE_VERTEX, SOLID_FRAGMENT);
  const lineLocations = {
    view: uniform(gl, lineProgram, 'u_view'),
    color: uniform(gl, lineProgram, 'u_color'),
  };

  const particleProgram = device.program(PARTICLE_VERTEX, PARTICLE_FRAGMENT);
  const particleLocations = {
    view: uniform(gl, particleProgram, 'u_view'),
    pixelScale: uniform(gl, particleProgram, 'u_pixel_scale'),
  };

  const quadVao = device.vertexArray();
  const quadBuffer = device.buffer(gl.ARRAY_BUFFER, QUAD);
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const goreRenderer = createGoreRenderer(device, QUAD);
  const spiderMesh = createSpiderMesh(device);

  const campfireMesh = uploadPropMesh(device, createCampfireMesh());
  const ghostPipeMesh = uploadPropMesh(device, createGhostPipeMesh());

  const caveWidth = (grid.cols - 1) * grid.cellSize;
  const caveHeight = (grid.rows - 1) * grid.cellSize;
  const caveVertices = new Float32Array([
    0, 0, 0, 0, caveWidth, 0, 1, 0, 0, caveHeight, 0, 1,
    0, caveHeight, 0, 1, caveWidth, 0, 1, 0, caveWidth, caveHeight, 1, 1,
  ]);
  const caveVao = device.vertexArray();
  const caveBuffer = device.buffer(gl.ARRAY_BUFFER, caveVertices);
  gl.bindVertexArray(caveVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, caveBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

  const fieldTexture = device.texture2D({
    width: grid.cols,
    height: grid.rows,
    data: grid.moveGrid,
    internalFormat: gl.R32F,
    format: gl.RED,
    type: gl.FLOAT,
  });
  const atlas = createGlyphAtlas(device);

  const particleVao = device.vertexArray();
  const particleBuffer = device.buffer(gl.ARRAY_BUFFER, new Float32Array(fx.pool.capacity * 7), gl.DYNAMIC_DRAW);
  const particleScratch = new Float32Array(fx.pool.capacity * 7);
  gl.bindVertexArray(particleVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  const lineVao = device.vertexArray();
  const lineBuffer = device.buffer(gl.ARRAY_BUFFER, new Float32Array(512), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const view = new Float32Array(4);
  const lightData = new Float32Array(MAX_DYNAMIC_LIGHTS * 4);
  const lightColors = new Float32Array(MAX_DYNAMIC_LIGHTS * 3);
  let fieldDirty = false;
  let disposed = false;
  const bolts = [];
  const meleeSwings = [];
  let lastFrameTime = performance.now() * 0.001;
  let combatTime = lastFrameTime;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const gore = createGorePass({ grid, seed: SEED, reducedMotion: () => motionPreference.matches });
  const combatNumbers = createFloatTextPass();
  const meleeImpact = createMeleeImpact({
    playerId,
    reducedMotion: () => motionPreference.matches,
    onContact: presentMeleeContact,
  });
  let torchParticleAccumulator = 0;
  let torchParticleSequence = 0;

  world.on('spell.bolt', (event) => {
    bolts.push({ ...event, age: 0, duration: 0.18 });
  });
  world.on('spell.cast', meleeImpact.add);
  world.on('damage.dealt', (event) => {
    if (event.meleeArc) return;
    const target = presentation && !Object.hasOwn(event, 'targetNetworkId') ? null : event.target;
    const hit = { ...event, target, amount: event.hpLost ?? event.amount };
    addCombatNumber(hit);
    if (hit.killed || (hit.damageType === 'physical' && !hit.periodic)) {
      gore.add({ ...hit, targetTheme: hit.targetTheme ?? world.get(target, Actor)?.theme });
    }
  });

  function presentMeleeContact(swing) {
    for (const hit of swing.hits) {
      spawnMeleeSparks(hit, swing);
      addCombatNumber(hit);
      gore.add({
        ...hit, spellId: swing.spellId,
        impactAngle: Math.atan2(hit.y - swing.y, hit.x - swing.x),
      });
    }
    world.emit('melee.contact.fx', { ...swing.hits[0], rend: swing.rend, targets: swing.hits.length });
  }

  function addCombatNumber(event) {
    const position = world.get(event.target, Position);
    const anchor = position ? displayPosition(event.target, position) : event;
    const radius = world.get(event.target, Collider)?.radius ?? 14;
    combatNumbers.add({
      ...event,
      target: event.target ?? event.targetNetworkId,
      x: anchor.x, y: anchor.y - radius - 16,
      incoming: event.target === playerId,
    });
  }

  function spawnMeleeSparks(hit, { rend, x, y }) {
    const direction = Math.atan2(hit.y - y, hit.x - x);
    for (let i = 0; i < (rend ? 15 : 12); i++) {
      const random = 0.5 + 0.5 * Math.sin(i * 81.7 + hit.x * 2.3 + hit.y * 7.9);
      const angle = direction + (random - 0.5) * 2.8;
      const speed = 55 + (i % 5) * 34;
      fx.pool.spawn({
        x: hit.x, y: hit.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        ax: 0, ay: 80,
        life: 0.16 + random * 0.24,
        size0: 3 + random * 4, size1: 0.6,
        r: 1, g: rend ? 0.12 + random * 0.26 : 0.52 + random * 0.46, b: rend ? 0.21 : 0.32,
        a0: 0.95, a1: 0,
      });
    }
  }
  world.on('melee.hit', (event) => {
    meleeSwings.push({ ...event, age: 0, duration: 0.22 });
  });

  function displayPosition(id, position) {
    return meleeImpact.actorPosition(id, presentation?.position(id, position) ?? position);
  }

  function setWorld(program, x, y, width, height) {
    gl.uniform4fv(program.view, view);
    gl.uniform2f(program.position, x, y);
    gl.uniform2f(program.size, width, height);
  }

  function drawDisc(x, y, radius, color, stroke) {
    gl.useProgram(disc.program);
    gl.bindVertexArray(quadVao);
    setWorld(disc, x, y, radius * 2, radius * 2);
    gl.uniform4fv(disc.color, color);
    gl.uniform4fv(disc.stroke, stroke);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawGlyph(character, x, y, size, color, flipY = false) {
    gl.useProgram(glyph.program);
    gl.bindVertexArray(quadVao);
    setWorld(glyph, x, y, size, flipY ? -size : size);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(glyph.atlas, 0);
    gl.uniform4fv(glyph.frame, atlas.frame(character));
    gl.uniform4fv(glyph.color, color);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawRect(x, y, width, height, color) {
    gl.useProgram(solid.program);
    gl.bindVertexArray(quadVao);
    setWorld(solid, x, y, width, height);
    gl.uniform4fv(solid.color, color);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawElementOrb(theme, x, y, radius, time, alpha = 1) {
    gl.useProgram(element.program);
    gl.bindVertexArray(quadVao);
    setWorld(element, x, y, radius * 2, radius * 2);
    gl.uniform1i(element.theme, themeIndex(theme));
    gl.uniform1f(element.time, time);
    gl.uniform1f(element.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawPotionGlow(theme, x, y, radius, time, alpha = 1, swirl = 1) {
    gl.useProgram(potionGlow.program);
    gl.bindVertexArray(quadVao);
    setWorld(potionGlow, x, y, radius * 2, radius * 2);
    gl.uniform1i(potionGlow.theme, themeIndex(theme));
    gl.uniform1f(potionGlow.time, time);
    gl.uniform1f(potionGlow.alpha, alpha);
    gl.uniform1f(potionGlow.swirl, swirl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawChargeField(theme, x, y, radius, time, chargeAmount, alpha = 1) {
    gl.useProgram(charge.program);
    gl.bindVertexArray(quadVao);
    setWorld(charge, x, y, radius * 2, radius * 2);
    gl.uniform1i(charge.theme, themeIndex(theme));
    gl.uniform1f(charge.time, time);
    gl.uniform1f(charge.charge, chargeAmount);
    gl.uniform1f(charge.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawFlame(x, y, width, height, time, alpha = 1) {
    gl.useProgram(flame.program);
    gl.bindVertexArray(quadVao);
    setWorld(flame, x, y, width, height);
    gl.uniform1f(flame.time, time);
    gl.uniform1f(flame.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawFrostBolt(x, y, angle, length, time, alpha = 1) {
    gl.useProgram(frostBolt.program);
    gl.bindVertexArray(quadVao);
    gl.uniform4fv(frostBolt.view, view);
    gl.uniform2f(frostBolt.position, x, y);
    gl.uniform2f(frostBolt.size, length, Math.max(7, length * 0.42));
    gl.uniform1f(frostBolt.angle, angle);
    gl.uniform1f(frostBolt.time, time);
    gl.uniform1f(frostBolt.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawMeleeArc(swing) {
    gl.useProgram(meleeArc.program);
    gl.bindVertexArray(quadVao);
    gl.uniform4fv(meleeArc.view, view);
    gl.uniform2f(meleeArc.origin, swing.x, swing.y);
    gl.uniform1f(meleeArc.range, swing.range);
    gl.uniform1f(meleeArc.angle, swing.angle);
    gl.uniform1f(meleeArc.halfAngle, swing.halfAngle);
    gl.uniform1f(meleeArc.progress, swing.age / swing.duration);
    gl.uniform1i(meleeArc.rend, Number(swing.rend));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawMeleeContact(swing) {
    const progress = Math.min(1, (swing.age - swing.contactTime) / 0.16);
    if (progress >= 1) return;
    const fade = (1 - progress) ** 2;
    const core = motionPreference.matches ? 0.25 : 0.78;
    const color = swing.rend ? [1, 0.19, 0.29] : [1, 0.64, 0.27];
    const expansion = 1 - (1 - progress) ** 3;
    for (const hit of swing.hits) {
      if (!inView(hit.x, hit.y, 42)) continue;
      const radius = (hit.killed ? 19 : 14) + expansion * 17;
      drawDisc(hit.x, hit.y, radius, [...color, fade * 0.19], [...color, fade * 0.6]);
      drawDisc(hit.x, hit.y, 8 - progress * 5, [1, 0.94, 0.83, fade * core], [...color, fade * core]);
    }
  }

  function drawCube(x, y, radius, time, alpha = 1) {
    gl.useProgram(cube.program);
    gl.bindVertexArray(cubeMesh.vao);
    gl.uniform4fv(cube.view, view);
    gl.uniform2f(cube.position, x, y + radius * 0.62);
    gl.uniform1f(cube.size, radius * 1.08);
    gl.uniform1f(cube.time, time);
    gl.uniform1f(cube.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, cubeMesh.count);
  }

  function drawLootShaft(x, y, height, color, time) {
    gl.useProgram(lootShaft.program);
    gl.bindVertexArray(quadVao);
    gl.uniform4fv(lootShaft.view, view);
    gl.uniform2f(lootShaft.position, x, y);
    gl.uniform2f(lootShaft.size, 10 + height * 0.14, height);
    gl.uniform3fv(lootShaft.color, color);
    gl.uniform1f(lootShaft.time, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawLootModel(model, id, shown, info, effect, now) {
    const angle = now * 0.85 + id * 1.7;
    const bob = Math.sin(now * 2.8 + id) * 1.5;
    const potion = model === 'potion';
    const mesh = lootMeshes[model];
    gl.bindVertexArray(mesh.vao);
    gl.uniform2f(loot.position, shown.x, shown.y + 5 + (model === 'chest' ? 0 : bob));
    gl.uniform1f(loot.angle, model === 'chest' ? -0.52 : angle);
    gl.uniform1f(loot.lean, model === 'sword' ? -0.48 : 0);
    if (potion) {
      const blue = effect === 'mana';
      gl.uniform3f(loot.body, blue ? 0.2 : 0.95, blue ? 0.58 : 0.12, blue ? 1 : 0.34);
      gl.uniform3f(loot.trim, 0.77, 0.9, 0.94);
      gl.uniform3f(loot.detail, 0.57, 0.31, 0.16);
    } else if (model === 'chest') {
      gl.uniform3f(loot.body, 0.37, 0.17, 0.48);
      gl.uniform3f(loot.trim, 0.96, 0.71, 0.28);
      gl.uniform3f(loot.detail, 0.14, 0.07, 0.18);
    } else {
      const [r, g, b] = rarityColor(info.rarity);
      if (model === 'sword') gl.uniform3f(loot.body, r, g, b);
      else gl.uniform3f(loot.body, 0.42 + r * 0.28, 0.17 + g * 0.18, 0.07 + b * 0.2);
      gl.uniform3f(loot.trim, 0.92, 0.78, 0.49);
      gl.uniform3f(loot.detail, 0.34, 0.2, 0.14);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  function drawLines(points, color, width = 1) {
    gl.useProgram(lineProgram);
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, points);
    gl.uniform4fv(lineLocations.view, view);
    gl.uniform4fv(lineLocations.color, color);
    gl.lineWidth(width);
    gl.drawArrays(gl.LINES, 0, points.length / 2);
  }

  function drawArrow(x, y, vx, vy, power) {
    const angle = Math.atan2(vy, vx);
    const length = 14 + power * 8;
    const head = 5 + power * 2;
    const tipX = x + Math.cos(angle) * length * 0.5;
    const tipY = y + Math.sin(angle) * length * 0.5;
    const tailX = x - Math.cos(angle) * length * 0.5;
    const tailY = y - Math.sin(angle) * length * 0.5;
    drawLines(new Float32Array([
      tailX, tailY, tipX, tipY,
      tipX, tipY, tipX - Math.cos(angle - 0.62) * head, tipY - Math.sin(angle - 0.62) * head,
      tipX, tipY, tipX - Math.cos(angle + 0.62) * head, tipY - Math.sin(angle + 0.62) * head,
      tailX, tailY, tailX + Math.cos(angle + 2.45) * 4, tailY + Math.sin(angle + 2.45) * 4,
      tailX, tailY, tailX + Math.cos(angle - 2.45) * 4, tailY + Math.sin(angle - 2.45) * 4,
    ]), [0.95, 0.78, 0.36, 1], 2);
  }

  function jaggedBolt(bolt) {
    const points = [];
    const dx = bolt.toX - bolt.fromX;
    const dy = bolt.toY - bolt.fromY;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    let px = bolt.fromX;
    let py = bolt.fromY;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const seed = Math.sin((i + 1) * 91.7 + (bolt.sequence || 0) * 17.3) * 43758.5453;
      const jitter = i === 12 ? 0 : ((seed - Math.floor(seed)) * 2 - 1) * 5;
      const x = bolt.fromX + dx * t + nx * jitter;
      const y = bolt.fromY + dy * t + ny * jitter;
      points.push(px, py, x, y);
      px = x; py = y;
    }
    return new Float32Array(points);
  }

  function collectLights(now) {
    const candidates = [];
    for (const [id, position, source] of world.query(Position, PointLight)) {
      if (!source.enabled) continue;
      const shown = displayPosition(id, position);
      const isPlayer = world.has(id, PlayerTag);
      const radius = isPlayer ? Math.min(source.radius, 110) : source.radius;
      if (!inView(shown.x, shown.y, radius)) continue;
      let intensity = 0.82;
      if (isPlayer) {
        intensity = world.get(id, Health)?.dead
          ? 0.08
          : 0.22 + 0.025 * Math.sin(now * 4.7 + id) + 0.015 * Math.sin(now * 11.3);
      } else if (world.has(id, Projectile)) {
        intensity = 1.12 + 0.12 * Math.sin(now * 19 + id * 2.3);
      } else if (world.has(id, GroundItem)) {
        intensity = 0.72 + 0.16 * Math.sin(now * 2.1 + id * 1.7);
      } else if (world.has(id, AI)) {
        intensity = 0.58 + 0.08 * Math.sin(now * 1.3 + id * 0.9);
      }
      candidates.push({
        x: shown.x, y: shown.y, radius, intensity,
        r: source.r / 255, g: source.g / 255, b: source.b / 255,
      });
    }
    for (const torch of decorations?.torches || []) {
      const y = torch.y - 12;
      const intensity = torchLight(now, torch.phase);
      const radius = 155 * (0.84 + 0.20 * intensity);
      if (!inView(torch.x, y, radius)) continue;
      candidates.push({
        x: torch.x, y, radius,
        intensity: 2.0 * intensity,
        r: 1, g: 0.48, b: 0.18,
      });
    }
    const campfire = decorations?.campfire;
    if (campfire) {
      const y = campfire.y - 8;
      const intensity = emberLight(now, campfire.phase);
      const radius = 185 * (0.77 + 0.25 * intensity);
      if (inView(campfire.x, y, radius)) {
        candidates.push({
          x: campfire.x, y, radius,
          intensity: 2.4 * intensity,
          r: 1, g: 0.38 + 0.07 * intensity, b: 0.14 + 0.06 * intensity,
        });
      }
    }
    for (const prop of bioluminescentProps) {
      const glow = biolum(now, prop.phase);
      const radius = 80 + 32 * glow.intensity;
      if (inView(prop.x, prop.y, radius)) {
        candidates.push({ x: prop.x, y: prop.y, radius, ...glow, intensity: 0.84 * glow.intensity });
      }
    }
    for (const bolt of bolts) {
      const alpha = Math.max(0, 1 - bolt.age / bolt.duration);
      const dx = bolt.toX - bolt.fromX;
      const dy = bolt.toY - bolt.fromY;
      const midX = bolt.fromX + dx * 0.5;
      const midY = bolt.fromY + dy * 0.5;
      candidates.push({
        x: midX, y: midY,
        radius: Math.max(100, Math.hypot(dx, dy) * 0.72),
        intensity: 2.2 * alpha,
        r: 0.42, g: 0.8, b: 1,
      });
      candidates.push({
        x: bolt.toX, y: bolt.toY, radius: 125,
        intensity: 1.8 * alpha,
        r: 0.68, g: 0.92, b: 1,
      });
    }
    for (const swing of meleeImpact.swings) {
      const progress = swing.age / swing.duration;
      const reach = swing.range * 0.66;
      const tip = Math.min(1, progress * (swing.rend ? 4.8 : 2.8));
      const angle = swing.angle + (2 * tip - 1) * swing.halfAngle;
      const x = swing.x + Math.cos(angle) * reach;
      const y = swing.y + Math.sin(angle) * reach;
      const radius = swing.range * 1.65;
      if (inView(x, y, radius)) {
        candidates.push({
          x, y, radius, intensity: 1.35 * (1 - progress) ** 2,
          r: 1, g: swing.rend ? 0.13 : 0.61, b: swing.rend ? 0.28 : 0.21,
        });
      }
    }
    if (candidates.length > MAX_DYNAMIC_LIGHTS) {
      for (const source of candidates) {
        source.distance = Math.hypot(source.x - view[0], source.y - view[1]);
      }
      candidates.sort((a, b) => a.distance - b.distance);
    }
    const count = Math.min(MAX_DYNAMIC_LIGHTS, candidates.length);
    for (let i = 0; i < count; i++) {
      const source = candidates[i];
      const lightOffset = i * 4;
      const colorOffset = i * 3;
      lightData[lightOffset] = source.x;
      lightData[lightOffset + 1] = source.y;
      lightData[lightOffset + 2] = source.radius;
      lightData[lightOffset + 3] = source.intensity;
      lightColors[colorOffset] = source.r;
      lightColors[colorOffset + 1] = source.g;
      lightColors[colorOffset + 2] = source.b;
    }
    return count;
  }

  function drawLighting(lightCount) {
    gl.useProgram(lighting.program);
    gl.bindVertexArray(quadVao);
    setWorld(lighting, view[0], view[1], view[2], view[3]);
    gl.uniform1i(lighting.count, lightCount);
    gl.uniform4fv(lighting.lights, lightData);
    gl.uniform3fv(lighting.colors, lightColors);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawActivePowerups(powerups, position, collider, now) {
    if (!powerups) return;
    const pulse = 0.5 + 0.5 * Math.sin(now * 5.5);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (powerups.manaRegenSeconds > 0) {
      drawElementOrb('electric', position.x, position.y, collider.radius + 8 + pulse * 3, now, 0.2);
    }
    if (powerups.furySeconds > 0) {
      drawElementOrb('fire', position.x, position.y, collider.radius + 6 + pulse * 5, now, 0.28);
    }
    if (powerups.wardSeconds > 0) {
      drawDisc(position.x, position.y, collider.radius + 8 + pulse * 2, [0.08, 0.02, 0.18, 0.08], [0.76, 0.38, 1, 0.65]);
      drawDisc(position.x, position.y, collider.radius + 14 - pulse * 2, [0, 0, 0, 0], [0.44, 0.68, 1, 0.32]);
    }
    if (powerups.hasteSeconds > 0) {
      const facing = world.get(playerId, Facing)?.angle || 0;
      const points = [];
      for (let lane = -1; lane <= 1; lane++) {
        const sideX = Math.cos(facing + Math.PI * 0.5) * lane * 7;
        const sideY = Math.sin(facing + Math.PI * 0.5) * lane * 7;
        points.push(
          position.x + sideX - Math.cos(facing) * (12 + pulse * 5),
          position.y + sideY - Math.sin(facing) * (12 + pulse * 5),
          position.x + sideX - Math.cos(facing) * (25 + pulse * 8),
          position.y + sideY - Math.sin(facing) * (25 + pulse * 8),
        );
      }
      drawLines(new Float32Array(points), [0.32, 1, 0.75, 0.62], 2);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawActiveConditions(conditionState, position, collider, now, entityId) {
    if (!conditionState?.active?.length) return;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (let conditionIndex = 0; conditionIndex < conditionState.active.length; conditionIndex++) {
      const condition = conditionState.active[conditionIndex];
      const pulse = 0.5 + 0.5 * Math.sin(now * 6 + entityId * 0.73 + conditionIndex);
      if (condition.id === ConditionId.BURNING) {
        drawElementOrb('fire', position.x, position.y - 3, collider.radius + 4 + pulse * 3, now + entityId, 0.55);
        for (let ember = 0; ember < 3; ember++) {
          const rise = (now * 1.8 + entityId * 0.17 + ember / 3) % 1;
          const x = position.x + (ember - 1) * collider.radius * 0.65;
          const y = position.y - rise * collider.radius * 2.1;
          const color = [1, 0.55, 0.16, (1 - rise) * 0.9];
          drawDisc(x, y, 2 - rise, color, color);
        }
      } else if (condition.visual === 'frozen') {
        drawDisc(position.x, position.y, collider.radius + 3 + pulse * 2, [0.18, 0.58, 1, 0.18], [0.58, 0.92, 1, 0.72]);
        drawGlyph('❄', position.x, position.y - collider.radius - 10, 11 + pulse * 2, [0.78, 0.96, 1, 0.95]);
      } else if (condition.visual === 'stunned') {
        for (let star = 0; star < 3; star++) {
          const angle = now * 5 + star * Math.PI * 2 / 3;
          drawGlyph('★', position.x + Math.cos(angle) * (collider.radius + 5), position.y - collider.radius - 8 + Math.sin(angle) * 4, 8, [1, 0.9, 0.24, 1]);
        }
      } else if (condition.visual === 'poisoned') {
        drawDisc(position.x, position.y, collider.radius + 2 + pulse * 2, [0.12, 0.7, 0.2, 0.25], [0.3, 1, 0.42, 0.62]);
        for (let drop = 0; drop < 3; drop++) {
          const offset = (drop - 1) * collider.radius * 0.62;
          const fall = (now * (10 + drop * 2) + entityId * 0.31) % (collider.radius * 1.5);
          drawDisc(position.x + offset, position.y - collider.radius * 0.3 + fall, 1.5, [0.24, 1, 0.35, 0.8], [0.24, 1, 0.35, 0.8]);
        }
      } else if (condition.id === 'bleeding') {
        for (let drop = 0; drop < 3; drop++) {
          const fall = (now * 1.7 + drop / 3 + entityId * 0.17) % 1;
          const x = position.x + (drop - 1) * collider.radius * 0.65;
          const y = position.y - collider.radius * 0.2 + fall * collider.radius * 1.3;
          drawGlyph('♦', x, y, 6 - fall * 2, [1, 0.06, 0.18, (1 - fall) * 0.9]);
        }
      } else if (condition.visual === 'ice_armor') {
        drawDisc(position.x, position.y, collider.radius + 5 + pulse * 1.5, [0.18, 0.52, 0.9, 0.14], [0.58, 0.9, 1, 0.78]);
        for (let shard = 0; shard < 4; shard++) {
          const angle = shard * Math.PI * 0.5 + Math.PI * 0.25;
          drawGlyph('◇', position.x + Math.cos(angle) * (collider.radius + 5), position.y + Math.sin(angle) * (collider.radius + 5), 8, [0.72, 0.94, 1, 0.9]);
        }
      } else if (condition.visual === 'regeneration') {
        drawDisc(position.x, position.y, collider.radius + 3 + pulse * 2, [0.1, 0.72, 0.28, 0.12], [0.35, 1, 0.52, 0.58]);
        drawGlyph('✚', position.x, position.y - collider.radius - 9 - pulse * 3, 10, [0.55, 1, 0.68, 0.95]);
      } else {
        drawGlyph(condition.glyph || '•', position.x, position.y - collider.radius - 9, 10, [0.9, 0.9, 1, 0.9]);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function activeConditionLabels(conditionState) {
    if (!conditionState?.active) return [];
    return conditionState.active.map((condition) => {
      const definition = conditionCatalog[condition.id];
      const name = condition.name ?? definition?.name ?? condition.id;
      const glyph = condition.glyph ?? definition?.glyph ?? '•';
      return `${glyph} ${name.toUpperCase()} ${condition.remaining.toFixed(1)}s`;
    });
  }

  function drawAuraEmitter(emitter, position, now, entityId) {
    if (!emitter?.active || emitter.radius <= 0) return;
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.2 + entityId * 0.47);
    const rawColor = emitter.visual?.color;
    const color = Array.isArray(rawColor) && rawColor.length >= 3
      ? rawColor.slice(0, 3).map((channel) => Number.isFinite(channel) ? Math.max(0, Math.min(1, channel)) : 1)
      : [0.65, 0.85, 1];
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawDisc(position.x, position.y, emitter.radius, [...color, 0.018 + pulse * 0.018], [...color, 0.22 + pulse * 0.16]);
    drawDisc(position.x, position.y, emitter.radius * 0.94, [0, 0, 0, 0], [...color, 0.08 + pulse * 0.06]);
    drawGlyph(emitter.visual?.glyph || '◌', position.x, position.y - emitter.radius - 9, 12 + pulse * 2, [...color, 0.92]);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawParticles(pixelScale) {
    const pool = fx.pool;
    for (let index = 0; index < pool.count; index++) {
      const progress = 1 - pool.life[index] / pool.lifeMax[index];
      const offset = index * 7;
      particleScratch[offset] = pool.x[index];
      particleScratch[offset + 1] = pool.y[index];
      particleScratch[offset + 2] = pool.size0[index] + (pool.size1[index] - pool.size0[index]) * progress;
      particleScratch[offset + 3] = pool.r[index];
      particleScratch[offset + 4] = pool.g[index];
      particleScratch[offset + 5] = pool.b[index];
      particleScratch[offset + 6] = pool.a0[index] + (pool.a1[index] - pool.a0[index]) * progress;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, particleScratch.subarray(0, pool.count * 7));
    gl.useProgram(particleProgram);
    gl.bindVertexArray(particleVao);
    gl.uniform4fv(particleLocations.view, view);
    gl.uniform1f(particleLocations.pixelScale, pixelScale);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, pool.count);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function inView(x, y, margin = 80) {
    return Math.abs(x - view[0]) <= view[2] * 0.5 + margin && Math.abs(y - view[1]) <= view[3] * 0.5 + margin;
  }

  function drawPropMesh({ vao, count }) {
    gl.bindVertexArray(vao);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disable(gl.DEPTH_TEST);
  }

  function spawnTorchParticle(torch, now, hot) {
    const sequence = ++torchParticleSequence;
    const noise = Math.sin(sequence * 91.73 + torch.phase * 17.1) * 43758.5453;
    const random = noise - Math.floor(noise);
    const life = (hot ? 0.34 : 0.62) + random * 0.22;
    fx.pool.spawn({
      x: torch.x + (random * 2 - 1) * 2.8,
      y: torch.y - 13,
      vx: (random * 2 - 1) * (hot ? 7 : 13) + Math.sin(now * 1.15 + torch.phase) * 3,
      vy: -(hot ? 20 : 30) - random * 18,
      ax: Math.sin(torch.phase + sequence) * 5,
      ay: -7,
      life,
      size0: hot ? 6.5 : 5,
      size1: hot ? 1.8 : 0.5,
      r: 1,
      g: hot ? 0.82 : 0.24 + random * 0.2,
      b: hot ? 0.28 : 0.025,
      a0: hot ? 0.96 : 0.82,
      a1: 0,
    });
  }

  function drawDungeonDecorations(now, renderDt) {
    torchParticleAccumulator += renderDt;
    const emitParticles = torchParticleAccumulator >= 0.055;
    if (emitParticles) torchParticleAccumulator %= 0.055;
    const campfire = decorations?.campfire;
    if (campfire && inView(campfire.x, campfire.y, 90)) {
      gl.useProgram(campfireProgram);
      gl.uniform4fv(campfireLocations.view, view);
      gl.uniform2f(campfireLocations.position, campfire.x, campfire.y);
      gl.uniform1f(campfireLocations.time, now + campfire.phase);
      gl.uniform1f(campfireLocations.intensity, emberLight(now, campfire.phase));
      drawPropMesh(campfireMesh);
      if (emitParticles) {
        const drift = Math.sin(now * 112.7 + campfire.phase);
        fx.pool.spawn({
          x: campfire.x + drift * 12,
          y: campfire.y - 12,
          vx: drift * 17,
          vy: -40 - 12 * Math.abs(drift),
          ax: 2,
          ay: -13,
          life: 0.36 + 0.24 * Math.abs(drift),
          size0: 2,
          size1: 0.4,
          r: 1,
          g: 0.48,
          b: 0.10,
          a0: 0.85,
          a1: 0,
        });
      }
    }
    for (const torch of decorations?.torches || []) {
      if (!inView(torch.x, torch.y, 45)) continue;
      drawLines(new Float32Array([torch.x, torch.y + 10, torch.x, torch.y - 7]), [0.34, 0.19, 0.08, 1], 4);
      if (emitParticles) {
        spawnTorchParticle(torch, now, true);
        spawnTorchParticle(torch, now, false);
      }
    }
  }

  // Draw after darkness composition to retain the emissive details.
  function drawDecorationEmission(now) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (const torch of decorations?.torches || []) {
      if (!inView(torch.x, torch.y, 90)) continue;
      const intensity = torchLight(now, torch.phase);
      drawFlame(torch.x, torch.y - 15, 28 + intensity * 6, 28 + intensity * 18, now + torch.phase, 0.83 * intensity);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const fungus = decorations?.mushroom;
    if (fungus && inView(fungus.x, fungus.y, 26)) {
      const glow = biolum(now, fungus.phase);
      gl.useProgram(mushroom.program);
      gl.bindVertexArray(quadVao);
      setWorld(mushroom, fungus.x, fungus.y - 6, 52, 48);
      gl.uniform3f(mushroom.glow, glow.r, glow.g, glow.b);
      gl.uniform1f(mushroom.intensity, glow.intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    const ghostPipe = decorations?.ghostPipe;
    if (ghostPipe && inView(ghostPipe.x, ghostPipe.y, 36)) {
      const glow = biolum(now, ghostPipe.phase);
      gl.useProgram(ghostPipeProgram);
      gl.uniform4fv(ghostPipeLocations.view, view);
      gl.uniform2f(ghostPipeLocations.position, ghostPipe.x, ghostPipe.y);
      gl.uniform3f(ghostPipeLocations.glow, glow.r, glow.g, glow.b);
      gl.uniform1f(ghostPipeLocations.intensity, glow.intensity);
      drawPropMesh(ghostPipeMesh);
    }
  }

  function drawChargeAnimation(book, position, collider, now) {
    if (!book?.charging) return;
    const spellId = book.spells[book.chargeSpellIndex] || 'frost_bolt';
    const spell = spellCatalog[spellId];
    if (!spell) return;
    const duration = book.castPhase === 'channeling'
      ? spell.cast.channelDuration
      : book.castPhase === 'casting'
      ? spell.cast.castTime
      : spell.cast.maxCharge;
    const charge = book.castPhase === 'channeling'
      ? 1 - book.channelRemaining / Math.max(0.001, duration)
      : Math.min(1, book.charge / Math.max(0.001, duration));
    const theme = spell.element === 'electric' ? 'electric' : spell.element === 'arrow' ? 'fire' : spell.element;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (book.castPhase === 'channeling') {
      drawLines(new Float32Array([position.x, position.y, book.castTargetX, book.castTargetY]), [0.55, 0.9, 1, 0.3], 2);
      drawChargeField(theme, book.castTargetX, book.castTargetY, spell.targeting.areaRadius, now, charge, 0.42);
    }
    drawChargeField(theme, position.x, position.y, collider.radius + 8 + charge * 10, now, charge, 0.52 + charge * 0.28);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawOverlay(width, height, ratio, shownPlayer) {
    if (!overlay || !overlayCanvas) return;
    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
      overlayCanvas.width = width; overlayCanvas.height = height;
    }
    overlay.clearRect(0, 0, width, height);
    overlay.textAlign = 'center';
    overlay.textBaseline = 'top';
    overlay.font = `700 ${Math.round(11 * ratio)}px ui-monospace, monospace`;
    for (const [id, position, collider, actor] of world.query(Position, Collider, Actor)) {
      const shown = displayPosition(id, position);
      if (!inView(shown.x, shown.y, 30)) continue;
      const sx = ((shown.x - view[0]) / view[2] + 0.5) * width;
      const sy = ((shown.y - view[1]) / view[3] + 0.5) * height;
      const labelY = sy + collider.radius * width / view[2] + 9 * ratio;
      const label = actor.rare ? `★ ${actor.name}` : actor.name;
      overlay.lineWidth = 3 * ratio;
      overlay.strokeStyle = 'rgba(2,5,9,.9)';
      overlay.strokeText(label, sx, labelY);
      overlay.fillStyle = actor.rare ? '#ffd65a' : actor.kind === ActorKind.PLAYER ? '#dff8ff' : '#d6c9e8';
      overlay.fillText(label, sx, labelY);
      const conditionLabel = activeConditionLabels(world.get(id, Conditions)).join(' · ');
      if (conditionLabel) {
        const conditionOffset = collider.radius + (actor.theme === 'spider' ? 11 : 0);
        const conditionY = sy - conditionOffset * width / view[2] - 19 * ratio;
        overlay.strokeText(conditionLabel, sx, conditionY);
        overlay.fillStyle = '#dff7ff';
        overlay.fillText(conditionLabel, sx, conditionY);
      }
    }

    combatNumbers.render(overlay, { view, width, height, ratio, reducedMotion: motionPreference.matches });
    const size = Math.round(128 * ratio);
    const pad = Math.round(15 * ratio);
    const left = width - size - pad;
    const top = pad + Math.round(46 * ratio);
    overlay.fillStyle = 'rgba(3,8,14,.76)'; overlay.fillRect(left, top, size, size);
    overlay.strokeStyle = 'rgba(112,230,255,.34)'; overlay.lineWidth = ratio; overlay.strokeRect(left, top, size, size);
    const mapPoint = (x, y) => [left + 7 * ratio + x / bounds.w * (size - 14 * ratio), top + 7 * ratio + y / bounds.h * (size - 14 * ratio)];
    overlay.fillStyle = 'rgba(255,151,48,.75)';
    for (const torch of decorations?.torches || []) { const [x, y] = mapPoint(torch.x, torch.y); overlay.fillRect(x - ratio, y - ratio, ratio * 2, ratio * 2); }
    const campfire = decorations?.campfire;
    if (campfire) {
      const [x, y] = mapPoint(campfire.x, campfire.y);
      overlay.fillStyle = 'rgba(255,190,72,.95)';
      overlay.fillRect(x - 2 * ratio, y - 2 * ratio, ratio * 4, ratio * 4);
    }
    for (const [id, position, actor] of world.query(Position, Actor)) {
      const [x, y] = mapPoint(position.x, position.y);
      overlay.beginPath(); overlay.arc(x, y, (id === playerId ? 3.2 : 2) * ratio, 0, Math.PI * 2);
      overlay.fillStyle = id === playerId ? '#7df4ff' : actor.kind === ActorKind.PLAYER ? '#ffffff' : actor.rare ? '#ffd65a' : '#d25b79'; overlay.fill();
    }
    overlay.textAlign = 'left'; overlay.textBaseline = 'bottom'; overlay.font = `800 ${Math.round(9 * ratio)}px ui-monospace,monospace`;
    overlay.fillStyle = 'rgba(210,240,255,.68)'; overlay.fillText('THE DEEP', left + 7 * ratio, top - 4 * ratio);
    updateNearbyGearTooltip(width, height, shownPlayer);
  }

  function updateNearbyGearTooltip(width, height, shownPlayer) {
    const previewRadius = 132;
    let candidate = null;
    for (const [id, position, _ground, info] of world.query(Position, GroundItem, ItemInfo)) {
      const pickup = world.get(id, WeaponPickup);
      const ring = world.get(id, Ring);
      if (!pickup && !ring) continue;
      const lock = world.get(id, PickupLock);
      if (lock?.owner === playerId && lock.remaining > 0) continue;
      const distance = Math.hypot(position.x - shownPlayer.x, position.y - shownPlayer.y);
      if (distance > previewRadius || !inView(position.x, position.y, 20)) continue;
      if (!candidate || distance < candidate.distance) candidate = { position, info, pickup, ring, distance };
    }
    if (!candidate) {
      itemTooltip?.hide();
      return;
    }

    const currentMelee = world.get(playerId, MeleeWeapon);
    const currentBow = world.get(playerId, BowWeapon);
    const rows = candidate.ring
      ? [{
        kind: 'equip', label: 'Equip: ', value: `${Math.round(candidate.ring.haste * 100)}% haste`,
        change: compareDirection(candidate.ring.haste, world.get(playerId, Ring)?.haste ?? 0),
      }]
      : candidate.pickup.slot === 'ranged'
      ? [
        {
          label: 'Arrow Physical', value: candidate.pickup.damage,
          change: currentBow?.equipped ? compareDirection(candidate.pickup.damage, currentBow.damage) : 'up',
        },
        {
          label: 'Arrows', value: candidate.pickup.infiniteArrows ? '∞' : 'Consumed',
          change: candidate.pickup.infiniteArrows && !currentBow?.infiniteArrows ? 'up'
            : !candidate.pickup.infiniteArrows && currentBow?.infiniteArrows ? 'down' : '',
        },
      ]
      : [{
        label: 'Physical', value: candidate.pickup.damage,
        change: compareDirection(candidate.pickup.damage, currentMelee?.damage || 0),
      }];

    const sx = ((candidate.position.x - view[0]) / view[2] + 0.5) * width;
    const sy = ((candidate.position.y - view[1]) / view[3] + 0.5) * height;
    const rect = canvas.getBoundingClientRect();
    itemTooltip?.update({
      info: { ...candidate.info, slot: candidate.pickup?.slot || candidate.info.slot },
      rows,
      target: { x: candidate.position.x, y: candidate.position.y },
      anchorX: rect.left + sx * rect.width / width,
      anchorY: rect.top + sy * rect.height / height,
    });
  }

  function renderFrame() {
    if (disposed) return;
    const playerPosition = world.get(playerId, Position);
    const playerCollider = world.get(playerId, Collider);
    const playerInput = world.get(playerId, Input);
    if (!playerPosition || !playerCollider || !playerInput) return;
    const now = performance.now() * 0.001;
    const renderDt = Math.min(0.05, Math.max(0, now - lastFrameTime));
    lastFrameTime = now;
    const combatDt = meleeImpact.advance(renderDt);
    combatTime += combatDt;
    combatNumbers.step(combatDt);
    gore.step(combatDt);
    stepParticles?.(combatDt);
    const punch = meleeImpact.cameraResponse();
    const renderScale = cam.scale * punch.zoom;
    const shownPlayer = displayPosition(playerId, playerPosition);
    const { width, height, ratio } = device.resize();
    view[0] = cam.x - cam.shakeX + punch.x;
    view[1] = cam.y - cam.shakeY + punch.y;
    view[2] = width / (ratio * renderScale);
    view[3] = height / (ratio * renderScale);

    if (fieldDirty) {
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.cols, grid.rows, gl.RED, gl.FLOAT, grid.moveGrid);
      fieldDirty = false;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.043, 0.059, 0.071, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(caveProgram);
    gl.bindVertexArray(caveVao);
    gl.uniform4fv(caveLocations.view, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.uniform1i(caveLocations.field, 0);
    gl.uniform2i(caveLocations.gridSize, grid.cols, grid.rows);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    drawDungeonDecorations(now, renderDt);

    goreRenderer.drawFloor(gore, view, inView);

    for (const [id, _playerTag, position, collider] of world.query(PlayerTag, Position, Collider)) {
      const shown = displayPosition(id, position);
      const local = id === playerId;
      drawDisc(shown.x, shown.y, collider.radius, local ? [0.10, 0.20, 0.28, 1] : [0.12, 0.31, 0.47, 0.82], local ? [0.4, 1, 0.86, 1] : [0.51, 0.86, 1, 1]);
      const dead = world.get(id, Health)?.dead;
      drawGlyph(dead ? '☠' : '@', shown.x, shown.y + 1, collider.radius * 1.55, dead ? [0.8, 0.18, 0.18, 1] : (local ? [0.81, 0.91, 1, 1] : [0.84, 0.96, 1, 1]));
      const facing = world.get(id, Facing)?.angle ?? 0;
      drawDisc(shown.x + Math.cos(facing) * collider.radius, shown.y + Math.sin(facing) * collider.radius, 2.2, [0.95, 1, 0.72, 1], [0.95, 1, 0.72, 1]);
    }
    for (const [id, position, collider, actor] of world.query(Position, Collider, Actor)) {
      if (actor.kind !== ActorKind.MOB) continue;
      const shown = displayPosition(id, position);
      const velocity = world.get(id, Velocity);
      const speed = Math.hypot(velocity?.vx || 0, velocity?.vy || 0);
      const facing = world.get(id, Facing)?.angle ?? 0;
      if (actor.theme === 'spider') {
        if (!inView(shown.x, shown.y, collider.radius * 2)) continue;
        const stride = motionPreference.matches ? 0 : Math.min(1, speed / 125);
        drawDisc(shown.x, shown.y, collider.radius * 1.1, [0.02, 0.012, 0.013, 0.27], [0, 0, 0, 0]);
        spiderMesh.draw(view, shown.x, shown.y, facing, collider.radius * 1.06, combatTime * 10 + id * 0.91, stride);
        if (actor.rare) drawGlyph('★', shown.x + collider.radius * 0.72, shown.y - collider.radius * 0.95, 10, [1, 0.78, 0.18, 1]);
        continue;
      }
      const moving = Math.min(1, speed / 70);
      const stride = Math.sin(combatTime * (4.2 + moving * 6) + id * 1.71);
      let bob = stride * (actor.name === 'Wraith' ? 3.5 : 1.6) * (0.4 + moving * 0.6);
      let lean = velocity ? Math.max(-2.5, Math.min(2.5, velocity.vx * 0.018)) : 0;
      if (actor.name === 'Wraith') bob += Math.sin(combatTime * 2.1 + id) * 2.4;
      if (actor.name === 'Gelatinous Cube') {
        bob = Math.abs(stride) * -1.4;
        lean *= 0.25;
        drawCube(shown.x + lean, shown.y + bob, collider.radius * (1 + stride * 0.035), combatTime + id * 0.17, 0.94);
      }
      const glyphColor = actor.theme === 'fire' ? [1, 0.84, 0.5, 1] : actor.theme === 'frost' ? [0.72, 1, 0.9, 1] : [0.85, 0.68, 1, 1];
      if (actor.name !== 'Gelatinous Cube') {
        drawGlyph(actor.glyph, shown.x + lean, shown.y + bob + 1, collider.radius * 1.5, glyphColor);
      }
      if (actor.rare) drawGlyph('★', shown.x + collider.radius * 0.72, shown.y + bob - collider.radius * 0.78, 10, [1, 0.78, 0.18, 1]);
      drawDisc(shown.x + Math.cos(facing) * collider.radius, shown.y + Math.sin(facing) * collider.radius, 2, [1, 0.57, 0.8, 1], [1, 0.57, 0.8, 1]);
    }
    for (const [id, position, collider, projectile] of world.query(Position, Collider, Projectile)) {
      const shown = displayPosition(id, position);
      const enemy = projectile.team === 'enemies' || world.has(projectile.owner, AI);
      if (projectile.style === 'arrow') {
        const velocity = world.get(id, Velocity);
        drawArrow(shown.x, shown.y, velocity?.vx || 1, velocity?.vy || 0, projectile.power || 1);
        continue;
      }
      if (projectile.style === 'frost' || projectile.trailColor === '#8cd8ff') {
        const velocity = world.get(id, Velocity);
        const angle = Math.atan2(velocity?.vy || 0, velocity?.vx || 1);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        drawFrostBolt(shown.x, shown.y, angle, Math.max(24, collider.radius * 5.8), now + id * 0.07, 0.96);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        continue;
      }
      drawElementOrb(projectile.style || (enemy ? 'shadow' : 'frost'), shown.x, shown.y, Math.max(4, collider.radius), now + id, 0.95);
      const projectileSize = projectile.trailColor === '#8cd8ff'
        ? Math.max(11, collider.radius * 2.7)
        : 11;
      drawGlyph(projectile.style === 'arrow' ? '→' : projectile.style === 'poison' ? '☠' : (enemy ? '✦' : '❄'), shown.x, shown.y, projectileSize, [1, 1, 1, 0.95]);
    }

    goreRenderer.drawAirborne(gore, view, inView);
    // Lighting is a full-world GPU composition pass. Everything except the
    // intentionally luminous VFX and HUD participates in darkness and color.
    drawLighting(collectLights(now));
    drawDecorationEmission(now);

    // Loot signals are intentionally emissive: shafts remain readable through
    // dungeon darkness, with height and color communicating rarity.
    const models = [];
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (const [id, position, _item, info] of world.query(Position, GroundItem, ItemInfo)) {
      const consumable = world.get(id, Consumable);
      if (['mana_regen', 'haste', 'fury', 'ward'].includes(consumable?.effect)) continue;
      const shown = displayPosition(id, position);
      const weapon = world.get(id, WeaponPickup);
      const effect = consumable?.effect;
      const shaft = lootShaftHeight(info, effect);
      if (!inView(shown.x, shown.y, shaft + 16)) continue;
      if (effect === 'gold') {
        const bob = Math.sin(now * 3 + id) * 1.5;
        drawGlyph('$', shown.x, shown.y - 2 + bob, 19, [1, 0.78, 0.25, 0.95]);
        continue;
      }
      const potion = effect === 'heal' || effect === 'mana';
      const model = weapon ? (weapon.slot === 'ranged' ? 'bow' : 'sword')
        : effect === 'epic_chest' ? 'chest' : potion ? 'potion' : null;
      if (model) models.push({ model, id, shown, info, effect });
      const glow = lootGlowColor(info, consumable?.effect);
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.4 + id * 0.73);
      drawLootShaft(shown.x, shown.y + 5, shaft, glow, (motionPreference.matches ? 0 : now) + id * 0.29);
      if (consumable && effect !== 'epic_chest') {
        const potionTheme = consumable.effect === 'mana' ? 'electric' : 'fire';
        const swirl = consumable.effect === 'heal' ? 0 : 1;
        drawPotionGlow(potionTheme, shown.x, shown.y, 16 + pulse * 2, now + id * 0.13, 0.9, swirl);
      }
      const itemColor = weapon || info.slot === ItemSlot.RING
        ? rarityColor(info.rarity)
        : consumable?.effect === 'add_arrows' ? [1, 0.78, 0.40, 1]
          : consumable?.effect === 'mana' ? [0.34, 0.72, 1, 1] : [1, 0.32, 0.5, 1];
      if (!model) drawGlyph(info.glyph, shown.x, shown.y, 20, itemColor);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (models.length) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(lootProgram);
      gl.uniform4fv(loot.view, view);
      for (const { model, id, shown, info, effect } of models) {
        drawLootModel(model, id, shown, info, effect, now);
      }
      gl.disable(gl.DEPTH_TEST);
    }

    // Ground powerups use a filled GPU aura. Keep this additive and behind the
    // glyph so the potion reads as luminous energy, not a 2D canvas ring.
    for (const [id, position, _item, info] of world.query(Position, GroundItem, ItemInfo)) {
      const effect = world.get(id, Consumable)?.effect;
      if (!['mana_regen', 'haste', 'fury', 'ward'].includes(effect)) continue;
      const shown = displayPosition(id, position);
      const bob = Math.sin(now * 3 + id) * 2.5;
      const pulse = 0.5 + 0.5 * Math.sin(now * 4.5 + id);
      const theme = themeForPowerup(effect);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      drawPotionGlow(theme, shown.x, shown.y + bob, 18 + pulse * 2.5, now + id * 0.13, 1);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawGlyph(info.glyph, shown.x, shown.y + bob, 18, [0.96, 1, 1, 1]);
    }

    const activePowerups = world.get(playerId, Powerups);
    drawActivePowerups(activePowerups, shownPlayer, playerCollider, now);
    for (const [id, position, collider, conditionState] of world.query(Position, Collider, Conditions)) {
      const shown = displayPosition(id, position);
      drawActiveConditions(conditionState, shown, collider, now, id);
    }
    for (const [id, position, emitter] of world.query(Position, AuraEmitter)) {
      const shown = displayPosition(id, position);
      drawAuraEmitter(emitter, shown, now, id);
    }
    drawChargeAnimation(world.get(playerId, Spellbook), shownPlayer, playerCollider, now);

    // World-space status bars for every living actor.
    for (const [id, position, collider, health] of world.query(Position, Collider, Health)) {
      const shown = displayPosition(id, position);
      const spider = world.get(id, Actor)?.theme === 'spider';
      const barWidth = Math.max(25, collider.radius * 2.35);
      const y = shown.y - collider.radius - (spider ? 20 : 9);
      const healthRatio = Math.max(0, Math.min(1, health.hp / Math.max(1, health.maxHp)));
      drawRect(shown.x, y, barWidth + 2, 5, [0.025, 0.035, 0.055, 0.92]);
      if (healthRatio > 0) drawRect(shown.x - barWidth * (1 - healthRatio) * 0.5, y, barWidth * healthRatio, 3, [0.24, 0.91, 0.43, 1]);
      const mana = world.get(id, Mana);
      if (mana && (!spider || mana.maxMana > 0)) {
        const manaRatio = Math.max(0, Math.min(1, mana.mana / Math.max(1, mana.maxMana)));
        drawRect(shown.x, y + 5, barWidth + 2, 4, [0.025, 0.035, 0.055, 0.92]);
        if (manaRatio > 0) drawRect(shown.x - barWidth * (1 - manaRatio) * 0.5, y + 5, barWidth * manaRatio, 2, [0.21, 0.58, 1, 1]);
      }
    }

    // Aim distance follows stick displacement; heading remains the rim dot.
    const aimMagnitude = Math.min(1, Math.hypot(playerInput.aimX, playerInput.aimY));
    if (aimMagnitude > 0.05 && !world.get(playerId, Health)?.dead) {
      const aimAngle = Math.atan2(playerInput.aimY, playerInput.aimX);
      const aimDistance = playerCollider.radius + 12 + aimMagnitude * 72;
      const aimX = shownPlayer.x + Math.cos(aimAngle) * aimDistance;
      const aimY = shownPlayer.y + Math.sin(aimAngle) * aimDistance;
      drawLines(new Float32Array([shownPlayer.x, shownPlayer.y, aimX, aimY]), [0.35, 0.9, 1, 0.42]);
      const book = world.get(playerId, Spellbook);
      const activeSpell = book?.charging ? spellCatalog[book.spells[book.chargeSpellIndex]] : null;
      const castDuration = activeSpell?.cast.maxCharge || activeSpell?.cast.castTime || activeSpell?.cast.channelDuration || 1;
      const charge = book?.charging ? Math.min(1, book.charge / castDuration) : 0;
      drawDisc(aimX, aimY, 3 + charge * 4, [0.35, 0.9, 1, 0.25 + charge * 0.55], [0.72, 1, 1, 0.9]);
    }

    // Draw transient combat effects over the lit scene.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (const swing of meleeImpact.swings) {
      if (inView(swing.x, swing.y, swing.range * 1.2)) drawMeleeArc(swing);
      if (swing.landed) drawMeleeContact(swing);
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i];
      bolt.age += combatDt;
      if (bolt.age >= bolt.duration) { bolts.splice(i, 1); continue; }
      const alpha = (1 - bolt.age / bolt.duration) * Math.pow(0.72, bolt.chain || 0);
      const points = jaggedBolt(bolt);
      drawLines(points, [0.22, 0.66, 1, alpha * 0.35], 5);
      drawLines(points, [0.85, 0.98, 1, alpha], 2);
      drawDisc(bolt.toX, bolt.toY, 5 + alpha * 8, [0.45, 0.85, 1, alpha * 0.32], [0.8, 1, 1, alpha]);
    }
    for (let i = meleeSwings.length - 1; i >= 0; i--) {
      const swing = meleeSwings[i];
      swing.age += combatDt;
      if (swing.age >= swing.duration) { meleeSwings.splice(i, 1); continue; }
      const angle = Math.atan2(swing.y - swing.fromY, swing.x - swing.fromX);
      const progress = swing.age / swing.duration;
      const reach = 18 + Math.min(10, swing.amount * 0.25);
      const sweep = -1.05 + progress * 2.1;
      const fade = 1 - progress;
      const slash = [];
      for (let trail = 0; trail < 3; trail++) {
        const trailAngle = angle + sweep - trail * 0.16;
        slash.push(
          swing.fromX + Math.cos(trailAngle) * 5,
          swing.fromY + Math.sin(trailAngle) * 5,
          swing.fromX + Math.cos(trailAngle) * reach,
          swing.fromY + Math.sin(trailAngle) * reach,
        );
      }
      drawLines(new Float32Array(slash), [1, 0.72, 0.32, fade * 0.9], 4);
      drawDisc(swing.x, swing.y, 3 + progress * 10, [0.6, 0.02, 0.03, fade * 0.28], [1, 0.46, 0.25, fade * 0.7]);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawParticles(renderScale * ratio);
    if (punch.flash > 0) {
      drawRect(view[0], view[1], view[2], view[3],
        punch.rend ? [1, 0.20, 0.31, punch.flash] : [1, 0.79, 0.48, punch.flash]);
    }

    const hp = world.get(playerId, Health);
    if (hp?.dead) {
      drawRect(view[0], view[1], view[2], view[3], [0.22, 0.005, 0.012, 0.52]);
      drawGlyph('☠', shownPlayer.x, shownPlayer.y - 8, 44, [1, 0.18, 0.2, 0.92]);
    }
    const keyboard = input.keyboardInput();
    const router = input.leftStick.getOutput();
    const mana = world.get(playerId, Mana);
    const meleeWeapon = world.get(playerId, MeleeWeapon);
    resourceBars?.health?.set(hp?.hp ?? 0, hp?.maxHp ?? 1);
    if (hud.weapon) {
      hud.weapon.textContent = String(meleeWeapon?.damage ?? 5);
      hud.weapon.title = `${meleeWeapon?.name || 'Fists'} · ${meleeWeapon?.damage ?? 5} physical damage per hit`;
    }
    const boosted = activePowerups?.manaRegenSeconds > 0;
    resourceBars?.mana?.set(mana?.mana ?? 0, mana?.maxMana ?? 1, { boosted });
    syncHudStatus({
      dead: hp?.dead,
      gold: world.get(playerId, Gold)?.count ?? 0,
      powerups: activePowerups,
      conditions: world.get(playerId, Conditions),
      casts: runtimeEvents.casts,
      connection: net?.getStatusText(),
    });
    document.body.classList.toggle('player-dead', Boolean(hp?.dead));
    hud.zoomReadout.textContent = `zoom: ${cam.scale.toFixed(2)}x  particles:${fx.pool.count}`;
    hud.readL.textContent = router.left.active ? `L x:${playerInput.moveX.toFixed(2)} y:${playerInput.moveY.toFixed(2)}` : (Math.abs(keyboard.mx) + Math.abs(keyboard.my) ? `KB ${keyboard.mx},${keyboard.my}` : 'L stick idle');
    hud.readR.textContent = router.right.active ? `R x:${playerInput.aimX.toFixed(2)} y:${playerInput.aimY.toFixed(2)}` : 'R stick idle';
    drawOverlay(width, height, ratio, shownPlayer);
  }

  return Object.freeze({
    renderFrame,
    terrainChanged() { fieldDirty = true; },
    dispose() { if (!disposed) { disposed = true; overlay?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); device.dispose(); } },
  });
}
