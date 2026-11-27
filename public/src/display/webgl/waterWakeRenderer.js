import { Actor, ActorKind, Collider, Health, Position } from '../../rules/components/index.js';
import { isStandingInWater } from '../../rules/geometry/waterCombat.js';
import { uniform } from './device.js';
import { WATER_WAKE_VERTEX } from './shaders/waterWake.vert.js';
import { WATER_WAKE_FRAGMENT } from './shaders/waterWake.frag.js';

const WAKE_SECONDS = 0.58, MAX_WAKES = 28;

export function createWaterWakeRenderer(device, quadVao, waterTexture, grid) {
  const { gl } = device;
  const program = device.program(WATER_WAKE_VERTEX, WATER_WAKE_FRAGMENT);
  const loc = {
    view: uniform(gl, program, 'u_view'),
    origin: uniform(gl, program, 'u_origin'),
    heading: uniform(gl, program, 'u_heading'),
    age: uniform(gl, program, 'u_age'),
    radius: uniform(gl, program, 'u_radius'),
    water: uniform(gl, program, 'u_water'),
    cellSize: uniform(gl, program, 'u_cell_size'),
  };
  const last = new Map();
  const wakes = [];

  return function drawWaterWakes(world, view, now, inView, reducedMotion, showPosition) {
    if (reducedMotion) {
      last.clear();
      wakes.length = 0;
      return;
    }
    while (wakes.length && now - wakes[0].time >= WAKE_SECONDS) wakes.shift();
    for (const id of last.keys()) if (!world.alive.has(id)) last.delete(id);
    for (const [id, position, collider, actor, health] of world.query(Position, Collider, Actor, Health)) {
      if ((actor.kind !== ActorKind.PLAYER && actor.kind !== ActorKind.MOB) || health.dead || health.hp <= 0) {
        last.delete(id);
        continue;
      }
      const point = showPosition(id, position);
      if (!inView(point.x, point.y, 40) || !isStandingInWater(grid, point)) {
        last.delete(id);
        continue;
      }
      const previous = last.get(id);
      if (!previous) {
        last.set(id, { x: point.x, y: point.y });
        continue;
      }
      const dx = point.x - previous.x, dy = point.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance < Math.max(9, collider.radius * 1.10)) continue;
      if (distance < 80) {
        wakes.push({ x: point.x, y: point.y, dx: dx / distance, dy: dy / distance, radius: collider.radius, time: now });
        if (wakes.length > MAX_WAKES) wakes.shift();
      }
      last.set(id, { x: point.x, y: point.y });
    }
    if (!wakes.length) return;
    gl.useProgram(program);
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waterTexture);
    gl.uniform1i(loc.water, 0);
    gl.uniform1f(loc.cellSize, grid.cellSize);
    gl.uniform4fv(loc.view, view);
    for (const wake of wakes) {
      gl.uniform2f(loc.origin, wake.x, wake.y);
      gl.uniform2f(loc.heading, wake.dx, wake.dy);
      gl.uniform1f(loc.radius, wake.radius);
      gl.uniform1f(loc.age, (now - wake.time) / WAKE_SECONDS);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  };
}
