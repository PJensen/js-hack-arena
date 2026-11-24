import { SPIDER_VERTEX } from './shaders/spider.vert.js';
import { SPIDER_FRAGMENT } from './shaders/spider.frag.js';
import { createSphereVertices } from './sphereMesh.js';

const PART_FLOATS = 16;
const PART_CAPACITY = 34;
const TAU = 2 * Math.PI;
const legShell = [0.34, 0.21, 0.15, 0];
const legTip = [0.23, 0.15, 0.13, 0];
const eye = [1, 0.29, 0.12, 0.9];

export function createSpiderMesh(device) {
  const { gl } = device;
  const program = device.program(SPIDER_VERTEX, SPIDER_FRAGMENT);
  const uniforms = Object.fromEntries(['view', 'origin', 'heading', 'size'].map((name) => {
    const location = gl.getUniformLocation(program, 'u_' + name);
    if (location === null) throw new Error(`Spider shader is missing u_${name}`);
    return [name, location];
  }));
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  const sphere = createSphereVertices(7, 12);
  device.buffer(gl.ARRAY_BUFFER, sphere);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

  const scratch = new Float32Array(PART_CAPACITY * PART_FLOATS);
  const buffer = device.buffer(gl.ARRAY_BUFFER, scratch, gl.DYNAMIC_DRAW);
  let byteOffset = 0;
  for (let index = 1; index <= 5; index++) {
    const size = index === 5 ? 4 : 3;
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, PART_FLOATS * 4, byteOffset);
    gl.vertexAttribDivisor(index, 1);
    byteOffset += size * 4;
  }
  gl.bindVertexArray(null);

  function draw(view, x, y, heading, radius, phase, stride, rear) {
    const count = writeSpiderPose(scratch, phase, stride, rear);
    gl.useProgram(program);
    gl.uniform4fv(uniforms.view, view);
    gl.uniform2f(uniforms.origin, x, y);
    gl.uniform1f(uniforms.heading, heading);
    gl.uniform1f(uniforms.size, radius);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch.subarray(0, count * PART_FLOATS));
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, sphere.length / 3, count);
    gl.disable(gl.DEPTH_TEST);
  }

  return { draw };
}

export function writeSpiderPose(output, phase, stride, rear = 0) {
  let count = 0;
  const bob = Math.sin(phase * 2) * stride * 0.065;
  ellipsoid(-0.55, 0.74 + bob, 0, 0.82, 0.47, 0.58, [0.35, 0.19, 0.15, 0]);
  ellipsoid(-0.79, 1.045 + bob, 0, 0.48, 0.17, 0.37, [0.64, 0.27, 0.10, 0]);
  const headLift = rear * 0.58;
  ellipsoid(0.39, 0.55 + bob + headLift, 0, 0.54, 0.33, 0.43, [0.29, 0.18, 0.13, 0]);
  const front = [1.58, 0.62, -0.59, -1.62];
  const spread = [1.34, 1.76, 1.77, 1.46];
  for (const side of [-1, 1]) {
    for (let leg = 0; leg < 4; leg++) {
      const cycle = (phase / TAU + (leg + (side > 0 ? 1 : 0)) * 0.5) % 1;
      const swing = Math.max(0, (cycle - 0.58) / 0.42);
      const reach = stride * (cycle < 0.58 ? 1 - 2 * cycle / 0.58 : -Math.cos(Math.PI * swing)) * 0.37;
      const lift = Math.sin(Math.PI * swing) * stride * 0.30;
      const forelegLift = leg === 0 ? rear * 0.9 : 0;
      const hip = [0.50 - leg * 0.26, 0.47 + bob + headLift * (1 - leg / 4), side * 0.34];
      const knee = [front[leg] * 0.61 + reach * 0.38, 0.82 + bob + lift * 0.4 + forelegLift, side * spread[leg] * 0.65];
      const foot = [front[leg] + reach - forelegLift * 0.33, 0.07 + lift + forelegLift, side * spread[leg]];
      segment(hip, knee, 0.105, legShell);
      ellipsoid(...knee, 0.13, 0.105, 0.13, [0.44, 0.25, 0.16, 0]);
      segment(knee, foot, 0.075, legTip);
    }
    ellipsoid(0.77, 0.70 + bob + headLift, side * 0.16, 0.095, 0.087, 0.077, eye);
    ellipsoid(0.70, 0.68 + bob + headLift, side * 0.29, 0.065, 0.058, 0.057, eye);
    segment([0.75, 0.47 + bob + headLift, side * 0.20], [1.06, 0.28 + bob + headLift, side * 0.27], 0.075, legShell);
  }
  return count;

  function part(x, y, z, axisX, axisY, axisZ, color) {
    output.set([x, y, z, ...axisX, ...axisY, ...axisZ, ...color], count++ * PART_FLOATS);
  }

  function ellipsoid(x, y, z, rx, ry, rz, color) {
    part(x, y, z, [rx, 0, 0], [0, ry, 0], [0, 0, rz], color);
  }

  function segment(a, b, thickness, color) {
    const [dx, dy, dz] = b.map((value, i) => value - a[i]);
    const length = Math.hypot(dx, dy, dz);
    const across = Math.hypot(dx, dz);
    const sideX = -dz / across;
    const sideZ = dx / across;
    const axisX = [dx * 0.55, dy * 0.55, dz * 0.55];
    const axisY = [-dy * sideZ, dx * sideZ - dz * sideX, dy * sideX].map((value) => value * thickness / length);
    const axisZ = [sideX * thickness, 0, sideZ * thickness];
    part((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, axisX, axisY, axisZ, color);
  }
}
