import { createSphereVertices } from './sphereMesh.js';
import { WRAITH_VERTEX } from './shaders/wraith.vert.js';
import { WRAITH_FRAGMENT } from './shaders/wraith.frag.js';

const VERTEX_FLOATS = 13;
const violet = [0.31, 0.19, 0.49];
const mantle = [0.43, 0.29, 0.65];
const seam = [0.66, 0.47, 0.91];
const voidColor = [0.055, 0.031, 0.105];
const spirit = [0.74, 0.56, 0.99];

export function createWraithMesh(device) {
  const { gl } = device;
  const program = device.program(WRAITH_VERTEX, WRAITH_FRAGMENT);
  const uniforms = Object.fromEntries(['view', 'origin', 'heading', 'radius', 'phase', 'hover', 'cast'].map((name) => {
    const location = gl.getUniformLocation(program, `u_${name}`);
    if (location === null) throw new Error(`Wraith shader is missing u_${name}`);
    return [name, location];
  }));
  const { vertices, solid, total } = buildMesh();
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, vertices);
  for (const [index, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 4, 9]]) {
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, VERTEX_FLOATS * 4, offset * 4);
  }
  gl.bindVertexArray(null);

  return function draw(view, x, y, radius, heading, phase, hover, cast) {
    gl.useProgram(program);
    gl.uniform4fv(uniforms.view, view);
    gl.uniform2f(uniforms.origin, x, y);
    gl.uniform1f(uniforms.heading, heading);
    gl.uniform1f(uniforms.radius, radius);
    gl.uniform1f(uniforms.phase, phase);
    gl.uniform1f(uniforms.hover, hover);
    gl.uniform1f(uniforms.cast, cast);
    gl.bindVertexArray(vao);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, solid);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, solid, total - solid);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
  };
}

function buildMesh() {
  const vertices = [];
  const sphere = createSphereVertices(5, 8);
  const solidStyle = [0, 0, 1, 0];

  // The hood has an open front, with a recessed face and a narrow bright hem.
  const crown = hoodRing(-0.33, 1.87, 0.27, 0.30);
  const dome = hoodRing(-0.02, 1.89, 0.46, 0.45);
  const rim = hoodRing(0.29, 1.91, 0.40, 0.34);
  const lip = hoodRing(0.34, 1.91, 0.34, 0.27);
  band(crown, dome, mantle, solidStyle);
  band(dome, rim, mantle, solidStyle);
  band(rim, lip, seam, solidStyle);
  ellipsoid(-0.34, 1.89, 0, 0.16, 0.30, 0.31, mantle);
  ellipsoid(0.16, 1.89, 0, 0.16, 0.35, 0.30, voidColor);

  const collar = robeRing(-0.07, 1.63, 0.30, 0.39);
  const shoulders = robeRing(-0.11, 1.42, 0.36, 0.73);
  const waist = robeRing(-0.23, 0.98, 0.41, 0.53);
  const skirt = robeRing(-0.50, 0.55, 0.46, 0.69);
  band(collar, shoulders, mantle, solidStyle);
  band(shoulders, waist, violet, solidStyle);
  band(waist, skirt, violet, solidStyle, [0, 0.38, 1, 0]);
  ellipsoid(0.27, 1.45, 0, 0.10, 0.12, 0.11, seam);

  for (const side of [-1, 1]) {
    ellipsoid(0.31, 1.95, side * 0.106, 0.07, 0.043, 0.074, spirit, [0, 0, 1, 0.84]);
    const arm = [side * 0.22, 0, 1, 0];
    const cuff = [side * 0.85, 0, 1, 0];
    const top = sleeveRing(-0.11, 1.43, side * 0.52, 0.24);
    const fold = sleeveRing(0.01, 1.08, side * 0.83, 0.23);
    const wrist = sleeveRing(0.25, 0.99, side * 0.86, 0.17);
    band(top, fold, mantle, arm, cuff);
    band(fold, wrist, seam, cuff);
    ellipsoid(0.34, 0.99, side * 0.86, 0.17, 0.11, 0.13, spirit, [side, 0, 1, 0.87]);
  }

  const solid = vertices.length / VERTEX_FLOATS;
  for (let i = 0; i < skirt.length; i++) {
    const a = skirt[i];
    const b = skirt[(i + 1) % skirt.length];
    const rag = 0.5 + 0.5 * Math.sin(i * 4.7);
    const tip = [(a[0] + b[0]) * 0.5 - 0.49 - 0.43 * rag, 0.08 + rag * 0.2, (a[2] + b[2]) * 0.62];
    const folded = [(a[0] + b[0]) * 0.5 - 0.23, 0.46, (a[2] + b[2]) * 0.56];
    const root = [0, 0.38, 1, 0];
    const crease = [0, 0.72, 0.66, 0];
    const fade = [0, 1, 0, 0];
    triangle(a, b, folded, violet, root, root, crease);
    triangle(a, folded, tip, mantle, root, crease, fade);
    triangle(folded, b, tip, violet, crease, root, fade);
  }
  return { vertices: new Float32Array(vertices), solid, total: vertices.length / VERTEX_FLOATS };

  function ring(point) {
    return Array.from({ length: 8 }, (_, index) => point(index * Math.PI / 4));
  }

  function hoodRing(x, y, height, width) {
    return ring(angle => [x - 0.075 * Math.cos(angle), y + height * Math.cos(angle), width * Math.sin(angle)]);
  }

  function robeRing(x, y, depth, width) {
    return ring(angle => [x + depth * Math.cos(angle), y, width * Math.sin(angle)]);
  }

  function sleeveRing(x, y, z, radius) {
    return ring(angle => [x + radius * Math.cos(angle), y + radius * 0.52 * Math.sin(angle), z + radius * Math.sin(angle)]);
  }

  function band(from, to, color, fromStyle, toStyle = fromStyle) {
    for (let i = 0; i < from.length; i++) {
      const next = (i + 1) % from.length;
      triangle(from[i], from[next], to[i], color, fromStyle, fromStyle, toStyle);
      triangle(to[i], from[next], to[next], color, toStyle, fromStyle, toStyle);
    }
  }

  function ellipsoid(x, y, z, rx, ry, rz, color, style = solidStyle) {
    for (let i = 0; i < sphere.length; i += 9) {
      const point = offset => [x + sphere[i + offset] * rx, y + sphere[i + offset + 1] * ry, z + sphere[i + offset + 2] * rz];
      triangle(point(0), point(6), point(3), color, style, style, style);
    }
  }

  function triangle(a, b, c, color, aStyle, bStyle, cStyle) {
    const [ux, uy, uz] = b.map((value, index) => value - a[index]);
    const [vx, vy, vz] = c.map((value, index) => value - a[index]);
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal);
    if (length < 0.000001) return;
    const unit = normal.map(value => value / length);
    vertices.push(...a, ...unit, ...color, ...aStyle, ...b, ...unit, ...color, ...bStyle, ...c, ...unit, ...color, ...cStyle);
  }
}
