import {
  Actor, ActorKind, Collider, GroundItem, Health, Input, ItemInfo, PlayerTag,
  Position, Projectile,
} from '../../rules/components/index.js';
import { AI } from '../../rules/components/AI.js';
import { createWebGLDevice } from './device.js';
import { createGlyphAtlas } from './glyphAtlas.js';

const WORLD_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_size;
out vec2 v_uv;
vec2 world_to_clip(vec2 world) {
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  return vec2(clip.x, -clip.y);
}
void main() {
  vec2 world = u_position + a_position * u_size;
  gl_Position = vec4(world_to_clip(world), 0.0, 1.0);
  v_uv = a_position + 0.5;
}`;

const CAVE_VERTEX = `#version 300 es
layout(location=0) in vec4 a_vertex;
uniform vec4 u_view;
out vec2 v_uv;
out vec2 v_world;
void main() {
  vec2 clip = (a_vertex.xy - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_world = a_vertex.xy;
  v_uv = a_vertex.zw;
}`;

const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform ivec2 u_grid_size;
uniform vec2 u_light;
in vec2 v_uv;
in vec2 v_world;
out vec4 out_color;
float field_sample(vec2 uv) {
  vec2 point = clamp(uv, 0.0, 1.0) * vec2(u_grid_size - 1);
  ivec2 base = ivec2(floor(point));
  ivec2 next = min(base + 1, u_grid_size - 1);
  vec2 blend = fract(point);
  float a = texelFetch(u_field, base, 0).r;
  float b = texelFetch(u_field, ivec2(next.x, base.y), 0).r;
  float c = texelFetch(u_field, ivec2(base.x, next.y), 0).r;
  float d = texelFetch(u_field, next, 0).r;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}
void main() {
  float clearance = field_sample(v_uv);
  vec3 wall = vec3(0.043, 0.059, 0.071);
  vec3 edge = vec3(0.059, 0.102, 0.157);
  vec3 floorColor = vec3(0.078, 0.125, 0.188);
  vec3 color = clearance > 18.0 ? floorColor : (clearance > 10.0 ? edge : wall);
  float distanceToLight = distance(v_world, u_light);
  float torch = max(0.0, 1.0 - distanceToLight / 310.0);
  torch *= torch;
  color *= 0.62 + torch * 0.82;
  color += torch * vec3(0.13, 0.065, 0.018);
  out_color = vec4(color, 1.0);
}`;

const DISC_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform vec4 u_stroke;
in vec2 v_uv;
out vec4 out_color;
void main() {
  float distanceFromCenter = length(v_uv - 0.5) * 2.0;
  float aa = fwidth(distanceFromCenter);
  float coverage = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, distanceFromCenter);
  float border = smoothstep(0.78 - aa, 0.78 + aa, distanceFromCenter);
  if (coverage <= 0.0) discard;
  out_color = mix(u_color, u_stroke, border);
  out_color.a *= coverage;
}`;

const GLYPH_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform vec4 u_frame;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 out_color;
void main() {
  vec2 uv = u_frame.xy + v_uv * u_frame.zw;
  float alpha = texture(u_atlas, uv).a;
  if (alpha < 0.03) discard;
  out_color = vec4(u_color.rgb, u_color.a * alpha);
}`;

const PARTICLE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
layout(location=1) in float a_size;
layout(location=2) in vec4 a_color;
uniform vec4 u_view;
uniform float u_pixel_scale;
out vec4 v_color;
void main() {
  vec2 clip = (a_position - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, a_size * u_pixel_scale);
  v_color = a_color;
}`;

const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 out_color;
void main() {
  float radius = length(gl_PointCoord * 2.0 - 1.0);
  float alpha = 1.0 - smoothstep(0.68, 1.0, radius);
  if (alpha <= 0.0) discard;
  out_color = vec4(v_color.rgb, v_color.a * alpha);
}`;

const QUAD = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
  -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
]);

function uniform(gl, program, name) {
  const found = gl.getUniformLocation(program, name);
  if (found === null) throw new Error(`WebGL program is missing ${name}`);
  return found;
}

function worldProgram(device, fragment) {
  const { gl } = device;
  const program = device.program(WORLD_VERTEX, fragment);
  return {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    size: uniform(gl, program, 'u_size'),
  };
}

export function createWebGLArenaRenderer(deps) {
  const { canvas, cam, grid, world, fx, playerId, presentation, hud, input, net, SEED, runtimeEvents } = deps;
  const device = createWebGLDevice(canvas);
  const { gl } = device;

  const caveProgram = device.program(CAVE_VERTEX, CAVE_FRAGMENT);
  const caveLocations = {
    view: uniform(gl, caveProgram, 'u_view'),
    field: uniform(gl, caveProgram, 'u_field'),
    gridSize: uniform(gl, caveProgram, 'u_grid_size'),
    light: uniform(gl, caveProgram, 'u_light'),
  };
  const disc = worldProgram(device, DISC_FRAGMENT);
  disc.color = uniform(gl, disc.program, 'u_color');
  disc.stroke = uniform(gl, disc.program, 'u_stroke');
  const glyph = worldProgram(device, GLYPH_FRAGMENT);
  glyph.atlas = uniform(gl, glyph.program, 'u_atlas');
  glyph.frame = uniform(gl, glyph.program, 'u_frame');
  glyph.color = uniform(gl, glyph.program, 'u_color');

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

  const view = new Float32Array(4);
  let fieldDirty = false;
  let disposed = false;

  function displayPosition(id, position) {
    return presentation?.position(id, position) ?? position;
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

  function drawGlyph(character, x, y, size, color) {
    gl.useProgram(glyph.program);
    gl.bindVertexArray(quadVao);
    setWorld(glyph, x, y, size, size);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(glyph.atlas, 0);
    gl.uniform4fv(glyph.frame, atlas.frame(character));
    gl.uniform4fv(glyph.color, color);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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

  function renderFrame() {
    if (disposed) return;
    const playerPosition = world.get(playerId, Position);
    const playerCollider = world.get(playerId, Collider);
    const playerInput = world.get(playerId, Input);
    if (!playerPosition || !playerCollider || !playerInput) return;
    const shownPlayer = displayPosition(playerId, playerPosition);
    const { width, height, ratio } = device.resize();
    view[0] = cam.x - cam.shakeX;
    view[1] = cam.y - cam.shakeY;
    view[2] = width / (ratio * cam.scale);
    view[3] = height / (ratio * cam.scale);

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
    gl.uniform2f(caveLocations.light, shownPlayer.x, shownPlayer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    for (const [_id, position, _item, info] of world.query(Position, GroundItem, ItemInfo)) {
      drawGlyph(info.glyph, position.x, position.y, 20, [1, 0.32, 0.5, 1]);
    }
    for (const [id, _playerTag, position, collider] of world.query(PlayerTag, Position, Collider)) {
      const shown = displayPosition(id, position);
      const local = id === playerId;
      drawDisc(shown.x, shown.y, collider.radius, local ? [0.10, 0.20, 0.28, 1] : [0.12, 0.31, 0.47, 0.82], local ? [0.4, 1, 0.86, 1] : [0.51, 0.86, 1, 1]);
      drawGlyph('@', shown.x, shown.y + 1, collider.radius * 1.55, local ? [0.81, 0.91, 1, 1] : [0.84, 0.96, 1, 1]);
    }
    for (const [id, position, collider, actor] of world.query(Position, Collider, Actor)) {
      if (actor.kind !== ActorKind.MOB) continue;
      const shown = displayPosition(id, position);
      drawDisc(shown.x, shown.y, collider.radius, [0.16, 0.08, 0.25, 1], [0.63, 0.31, 1, 1]);
      drawGlyph(actor.glyph, shown.x, shown.y + 1, collider.radius * 1.5, [0.82, 0.63, 1, 1]);
    }
    for (const [id, position, collider, projectile] of world.query(Position, Collider, Projectile)) {
      const shown = displayPosition(id, position);
      const enemy = projectile.team === 'enemies' || world.has(projectile.owner, AI);
      drawDisc(shown.x, shown.y, Math.max(3, collider.radius), enemy ? [0.7, 0.3, 1, 0.9] : [0.55, 0.82, 1, 0.9], enemy ? [0.88, 0.69, 1, 1] : [0.88, 0.96, 1, 1]);
      drawGlyph(projectile.trailColor === '#c8a050' ? '→' : (enemy ? '✦' : '❄'), shown.x, shown.y, 11, [1, 1, 1, 0.95]);
    }
    drawParticles(cam.scale * ratio);

    const hp = world.get(playerId, Health);
    const keyboard = input.keyboardInput();
    const router = input.leftStick.getOutput();
    hud.hud.textContent = `Hack Arena  WEBGL  seed:${SEED.toString(16)}  HP:${hp?.hp ?? 0}/${hp?.maxHp ?? 0}  casts:${runtimeEvents.casts}${net ? `  ${net.getStatusText()}` : ''}`;
    hud.zoomReadout.textContent = `zoom: ${cam.scale.toFixed(2)}x  particles:${fx.pool.count}`;
    hud.readL.textContent = router.left.active ? `L x:${playerInput.moveX.toFixed(2)} y:${playerInput.moveY.toFixed(2)}` : (Math.abs(keyboard.mx) + Math.abs(keyboard.my) ? `KB ${keyboard.mx},${keyboard.my}` : 'L stick idle');
    hud.readR.textContent = router.right.active ? `R x:${playerInput.aimX.toFixed(2)} y:${playerInput.aimY.toFixed(2)}` : 'R stick idle';
  }

  return Object.freeze({
    renderFrame,
    terrainChanged() { fieldDirty = true; },
    dispose() { if (!disposed) { disposed = true; device.dispose(); } },
  });
}
