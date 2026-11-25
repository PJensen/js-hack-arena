import { createSphereVertices } from './sphereMesh.js';
import { GOBLIN_VERTEX } from './shaders/goblin.vert.js';
import { PROP_MESH_FRAGMENT } from './shaders/propMesh.frag.js';

const ATTRIB_FLOATS = 15;
const PART_CAPACITY = 32;
const skin = [0.51, 0.65, 0.27];
const darkSkin = [0.33, 0.43, 0.17];
const leather = [0.44, 0.27, 0.18];
const boots = [0.29, 0.22, 0.19];
const scarf = [0.85, 0.28, 0.12];
const iron = [0.51, 0.59, 0.60];
const edge = [0.92, 0.93, 0.80];
const eye = [1, 0.73, 0.20];

export function createGoblinMesh(device) {
  const { gl } = device;
  const program = device.program(GOBLIN_VERTEX, PROP_MESH_FRAGMENT);
  const locations = Object.fromEntries(['view', 'origin', 'heading', 'radius'].map((name) => {
    const location = gl.getUniformLocation(program, `u_${name}`);
    if (location === null) throw new Error(`Goblin shader is missing u_${name}`);
    return [name, location];
  }));
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  const vertices = facetedVertices();
  device.buffer(gl.ARRAY_BUFFER, vertices);
  for (let index = 0; index < 2; index++) {
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 24, index * 12);
  }
  const pose = new Float32Array(PART_CAPACITY * ATTRIB_FLOATS);
  const instances = device.buffer(gl.ARRAY_BUFFER, pose, gl.DYNAMIC_DRAW);
  for (let index = 0; index < 5; index++) {
    const attribute = index + 2;
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, ATTRIB_FLOATS * 4, index * 12);
    gl.vertexAttribDivisor(attribute, 1);
  }
  gl.bindVertexArray(null);

  return function draw(view, x, y, radius, heading, phase, stride, attack) {
    const count = writePose(pose, phase, stride, attack);
    gl.useProgram(program);
    gl.uniform4fv(locations.view, view);
    gl.uniform2f(locations.origin, x, y);
    gl.uniform1f(locations.heading, heading);
    gl.uniform1f(locations.radius, radius);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pose, 0, count * ATTRIB_FLOATS);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, vertices.length / 6, count);
    gl.disable(gl.DEPTH_TEST);
  };
}

function writePose(output, phase, stride, attack) {
  let count = 0;
  // Coordinates are forward, height, and across. Attack progress is supplied
  // by the confirmed contact event, while locomotion only uses visible speed.
  const step = Math.cos(phase) * stride;
  const bob = Math.abs(Math.sin(phase)) * 0.095 * stride;
  const slash = attack === null ? 0 : Math.sin(Math.PI * Math.pow(attack, 0.6));
  const lean = 0.16 * stride + slash * 0.22;
  const shoulder = 1.38 + bob - slash * 0.20;
  const head = 1.82 + bob - slash * 0.17;
  ellipsoid(-0.18, 0.86 + bob, 0, 0.35, 0.29, 0.42, boots);
  ellipsoid(-0.12 + lean, 1.21 + bob - slash * 0.09, 0, 0.40, 0.48, 0.56, leather);
  ellipsoid(-0.38 + lean, shoulder - 0.08, 0, 0.19, 0.36, 0.49, scarf);
  ellipsoid(0.22 + lean, head, 0, 0.41, 0.38, 0.43, skin);
  ellipsoid(0.48 + lean, head - 0.15, 0, 0.26, 0.18, 0.36, darkSkin);
  ellipsoid(0.60 + lean, head - 0.05, 0, 0.16, 0.11, 0.14, skin);

  for (const side of [-1, 1]) {
    const footStep = side * step;
    const lift = Math.max(0, Math.sin(phase) * side) * stride * 0.21;
    const hip = [-0.19, 0.91 + bob, side * 0.31];
    const knee = [0.03 + footStep * 0.25, 0.52 + lift, side * 0.40];
    const ankle = [-0.10 + footStep * 0.53, 0.20 + lift, side * 0.43];
    segment(hip, knee, 0.22, 0.22, leather);
    segment(knee, ankle, 0.17, 0.18, boots);
    ellipsoid(ankle[0] + 0.12, ankle[1] - 0.04, ankle[2], 0.32, 0.15, 0.22, boots);

    segment([0.18 + lean, head + 0.02, side * 0.30],
      [-0.04 + lean, head + 0.27, side * 0.83], 0.13, 0.16, skin);
    ellipsoid(0.52 + lean, head + 0.04, side * 0.24, 0.079, 0.071, 0.10, eye);
    ellipsoid(0.61 + lean, head - 0.13, side * 0.26, 0.059, 0.13, 0.06, edge);
  }

  const leftShoulder = [-0.13 + lean, shoulder, -0.48];
  const leftElbow = [-0.35 + step * 0.16, shoulder - 0.31, -0.73];
  const leftFist = [-0.03 + step * 0.29, shoulder - 0.54, -0.82 + slash * 0.16];
  segment(leftShoulder, leftElbow, 0.22, 0.20, leather);
  segment(leftElbow, leftFist, 0.18, 0.17, darkSkin);
  ellipsoid(...leftFist, 0.19, 0.17, 0.17, skin);

  const rightShoulder = [-0.12 + lean, shoulder, 0.46];
  const rightElbow = [-0.49 + lean + slash * 0.98, shoulder - 0.27, 0.72 - slash * 0.19];
  const grip = [-0.21 - step * 0.21 + slash * 1.42, shoulder - 0.07 - slash * 0.36, 0.94 - slash * 1.06];
  segment(rightShoulder, rightElbow, 0.22, 0.22, iron);
  segment(rightElbow, grip, 0.18, 0.16, darkSkin);
  ellipsoid(...grip, 0.18, 0.16, 0.17, skin);
  const blade = [-0.54 + slash * 1.52, 0.79 - slash * 0.98, 0.42 - slash * 1.07];
  const bladePoint = (length) => grip.map((value, index) => value + blade[index] * length);
  segment(bladePoint(-0.21), bladePoint(0.25), 0.09, 0.08, leather);
  segment(bladePoint(0.16), bladePoint(1.25), 0.21, 0.075, iron);
  segment(bladePoint(0.39), bladePoint(1.38), 0.095, 0.082, edge);
  return count;

  function part(center, axisX, axisY, axisZ, color) {
    output.set([...center, ...axisX, ...axisY, ...axisZ, ...color], count++ * ATTRIB_FLOATS);
  }

  function ellipsoid(x, y, z, rx, ry, rz, color) {
    part([x, y, z], [rx, 0, 0], [0, ry, 0], [0, 0, rz], color);
  }

  function segment(from, to, width, thickness, color) {
    const [dx, dy, dz] = to.map((value, index) => value - from[index]);
    const length = Math.hypot(dx, dy, dz);
    const across = Math.hypot(dx, dz);
    const sideX = across ? -dz / across : 1;
    const sideZ = across ? dx / across : 0;
    const center = from.map((value, index) => (value + to[index]) * 0.5);
    part(center, [dx * 0.63, dy * 0.63, dz * 0.63],
      [-dy * sideZ * width / length, across * width / length, dy * sideX * width / length],
      [sideX * thickness, 0, sideZ * thickness], color);
  }
}

function facetedVertices() {
  const sphere = createSphereVertices(4, 8);
  const vertices = [];
  for (let i = 0; i < sphere.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = sphere.subarray(i, i + 9);
    const u = [bx - ax, by - ay, bz - az];
    const v = [cx - ax, cy - ay, cz - az];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length < 0.000001) continue;
    const outward = Math.sign(normal[0] * ax + normal[1] * ay + normal[2] * az);
    const unit = normal.map((value) => value * outward / length);
    vertices.push(ax, ay, az, ...unit, bx, by, bz, ...unit, cx, cy, cz, ...unit);
  }
  return new Float32Array(vertices);
}
