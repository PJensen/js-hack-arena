import { isOreWall } from '../../rules/geometry/oreSites.js';
import { uniform } from './device.js';
import { createOreMesh } from './oreMesh.js';
import { uploadPropMesh } from './propMeshBuilder.js';
import { createOreFragment } from './shaders/ore.frag.js';
import { ORE_VERTEX } from './shaders/ore.vert.js';

const oreMaterials = {
  copper: { albedo: [0.77, 0.30, 0.16], reflection: [1.0, 0.65, 0.37], roughness: 0.65 },
  tin: { albedo: [0.52, 0.63, 0.73], reflection: [0.78, 0.92, 1.0], roughness: 0.45 },
  gold: { albedo: [0.89, 0.64, 0.16], reflection: [1.0, 0.88, 0.51], roughness: 0.26 },
};

export function createOreRenderer(device, grid, sites) {
  const { gl } = device;
  const { vertices, glintCenters } = createOreMesh();
  const program = device.program(ORE_VERTEX, createOreFragment(glintCenters.length / 2));
  const shader = {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    wallNormal: uniform(gl, program, 'u_wall_normal'),
    albedo: uniform(gl, program, 'u_albedo'),
    reflection: uniform(gl, program, 'u_reflection'),
    roughness: uniform(gl, program, 'u_roughness'),
    glintCenters: uniform(gl, program, 'u_glint_centers[0]'),
    glintTime: uniform(gl, program, 'u_glint_time'),
  };
  const mesh = uploadPropMesh(device, vertices);

  return function drawOre(view, inView, time) {
    const visible = sites.filter((site) => inView(site.x, site.y, 40) && isOreWall(grid, site));
    if (!visible.length) return;
    gl.useProgram(shader.program);
    gl.bindVertexArray(mesh.vao);
    gl.uniform4fv(shader.view, view);
    gl.uniform2fv(shader.glintCenters, glintCenters);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (const { x, y, normalX, normalY, kind } of visible) {
      const { albedo, reflection, roughness } = oreMaterials[kind];
      gl.uniform2f(shader.position, x, y);
      gl.uniform2f(shader.wallNormal, normalX, normalY);
      gl.uniform3fv(shader.albedo, albedo);
      gl.uniform3fv(shader.reflection, reflection);
      gl.uniform1f(shader.roughness, roughness);
      gl.uniform1f(shader.glintTime, time === null ? -1 : time + x * 0.013 + y * 0.017);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.disable(gl.DEPTH_TEST);
  };
}
