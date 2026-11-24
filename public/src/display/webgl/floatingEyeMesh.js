import { createSphereVertices } from './sphereMesh.js';
import { FLOATING_EYE_VERTEX } from './shaders/floatingEye.vert.js';
import { FLOATING_EYE_FRAGMENT } from './shaders/floatingEye.frag.js';

export function createFloatingEyeMesh(device) {
  const { gl } = device;
  const program = device.program(FLOATING_EYE_VERTEX, FLOATING_EYE_FRAGMENT);
  const uniforms = Object.fromEntries(['view', 'center', 'radius', 'optic', 'charge'].map((name) => {
    const location = gl.getUniformLocation(program, 'u_' + name);
    if (location === null) throw new Error(`Floating Eye shader is missing u_${name}`);
    return [name, location];
  }));
  const sphere = createSphereVertices(12, 20);
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, sphere);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);

  return function draw(view, x, y, radius, heading, charge) {
    const opticX = Math.cos(heading) * 0.57;
    const opticY = 0.62 + Math.sin(heading) * 0.44;
    const opticZ = 0.92;
    const length = Math.hypot(opticX, opticY, opticZ);
    gl.useProgram(program);
    gl.uniform4fv(uniforms.view, view);
    gl.uniform2f(uniforms.center, x, y);
    gl.uniform1f(uniforms.radius, radius);
    gl.uniform3f(uniforms.optic, opticX / length, opticY / length, opticZ / length);
    gl.uniform1f(uniforms.charge, charge);
    gl.bindVertexArray(vao);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, sphere.length / 3);
    gl.disable(gl.DEPTH_TEST);
    return {
      x: x + opticX / length * radius,
      y: y + (opticY - 0.87 * opticZ) / length * radius,
    };
  };
}
