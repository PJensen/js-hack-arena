import { GORE_LIMITS } from '../passes/gore.js';
import { GORE_MARK_VERTEX } from './shaders/goreMark.vert.js';
import { GORE_MARK_FRAGMENT } from './shaders/goreMark.frag.js';
import { GORE_FRAGMENT_VERTEX } from './shaders/goreFragment.vert.js';
import { GORE_FRAGMENT_FRAGMENT } from './shaders/goreFragment.frag.js';

const INSTANCE_FLOATS = 12;

export function createGoreRenderer(device, quad) {
  const { gl } = device;
  const marks = batch(GORE_MARK_VERTEX, GORE_MARK_FRAGMENT, quad, false, GORE_LIMITS.stains);
  const chunks = batch(GORE_FRAGMENT_VERTEX, GORE_FRAGMENT_FRAGMENT, fragmentMesh(), true, GORE_LIMITS.fragments);

  function batch(vertex, fragment, mesh, normals, capacity) {
    const program = device.program(vertex, fragment);
    const viewLocation = gl.getUniformLocation(program, 'u_view');
    if (viewLocation === null) throw new Error('Gore shader is missing u_view');
    const vao = device.vertexArray();
    gl.bindVertexArray(vao);
    device.buffer(gl.ARRAY_BUFFER, mesh);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, normals ? 3 : 2, gl.FLOAT, false, normals ? 24 : 8, 0);
    if (normals) {
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    }
    const scratch = new Float32Array(capacity * INSTANCE_FLOATS);
    const buffer = device.buffer(gl.ARRAY_BUFFER, scratch, gl.DYNAMIC_DRAW);
    for (let i = 2; i <= 4; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, INSTANCE_FLOATS * 4, (i - 2) * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
    return { program, viewLocation, vao, scratch, buffer, vertices: mesh.length / (normals ? 6 : 2) };
  }

  function draw(batch, count, view) {
    if (!count) return;
    gl.useProgram(batch.program);
    gl.uniform4fv(batch.viewLocation, view);
    gl.bindVertexArray(batch.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.scratch.subarray(0, count * INSTANCE_FLOATS));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, batch.vertices, count);
  }

  function drawFloor(gore, view, inView) {
    let count = 0;
    for (const stain of gore.stains) {
      if (!inView(stain.x, stain.y, stain.size)) continue;
      const wetness = Math.max(0, 1 - stain.age / 2.5);
      const spread = 1 - 0.2 * wetness;
      marks.scratch.set([
        stain.x, stain.y, 0, stain.angle,
        stain.size * spread, stain.size * spread * 0.64, stain.seed, wetness,
        ...stain.color, stain.opacity * (0.82 + wetness * 0.18),
      ], count++ * INSTANCE_FLOATS);
    }
    draw(marks, count, view);
    drawChunks(gore, view, inView, true);
  }

  function drawAirborne(gore, view, inView) {
    let count = 0;
    for (const drop of gore.drops) {
      if (!inView(drop.x, drop.y - drop.height, drop.size * 2)) continue;
      const opacity = drop.material.spectral ? Math.max(0, 1 - drop.age / drop.life) * 0.62 : 0.92;
      marks.scratch.set([
        drop.x, drop.y, drop.height, drop.angle,
        drop.size * (drop.material.spectral ? 2.8 : 1.25), drop.size * 0.78, drop.seed,
        drop.material.spectral ? -1 : 0.88,
        ...drop.material.drop, opacity,
      ], count++ * INSTANCE_FLOATS);
    }
    draw(marks, count, view);
    drawChunks(gore, view, inView, false);
  }

  function drawChunks(gore, view, inView, settled) {
    let count = 0;
    for (const chunk of gore.fragments) {
      if (Boolean(chunk.settled) !== settled) continue;
      if (!inView(chunk.x, chunk.y - chunk.height, chunk.size)) continue;
      chunks.scratch.set([
        chunk.x, chunk.y, chunk.height + chunk.size * 0.33, chunk.angle,
        chunk.size, chunk.pitch, chunk.shape, Number(Boolean(chunk.material.gel)),
        ...chunk.color, chunk.material.gel ? 0.86 : 1,
      ], count++ * INSTANCE_FLOATS);
    }
    if (!count) return;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    draw(chunks, count, view);
    gl.disable(gl.DEPTH_TEST);
  }

  return { drawFloor, drawAirborne };
}

function fragmentMesh() {
  const rim = [[-1, 0, 0], [0, 0, 0.85], [1, 0, 0], [0, 0, -0.78]];
  const tips = [[0.18, 0.79, 0.12], [-0.12, -0.58, 0.06]];
  const vertices = [];
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % rim.length];
    for (const [start, end, tip] of [[a, b, tips[0]], [b, a, tips[1]]]) {
      const [ux, uy, uz] = end.map((value, axis) => value - start[axis]);
      const [vx, vy, vz] = tip.map((value, axis) => value - start[axis]);
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const point of [start, end, tip]) vertices.push(...point, ...normal);
    }
  }
  return new Float32Array(vertices);
}
