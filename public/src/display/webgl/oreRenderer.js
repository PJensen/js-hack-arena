import { getMiningMaterial, oreMaterialId } from '../../rules/data/miningMaterials.js';
import { uniform } from './device.js';
import { createOreMesh } from './oreMesh.js';
import { uploadPropMesh } from './propMeshBuilder.js';
import { createOreFragment } from './shaders/ore.frag.js';
import { ORE_VERTEX } from './shaders/ore.vert.js';

const oreFinishes = {
  copper: { reflection: [1.0, 0.65, 0.37], roughness: 0.65 },
  tin: { reflection: [0.78, 0.92, 1.0], roughness: 0.45 },
  gold: { reflection: [1.0, 0.88, 0.51], roughness: 0.26 },
};

export function createOreRenderer(device) {
  const { gl } = device;
  const { vertices, glintCenters } = createOreMesh();
  const program = device.program(ORE_VERTEX, createOreFragment(glintCenters.length / 3));
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

  return function drawOre(view, inView, sites, time) {
    const visible = sites.filter((site) => inView(site.x, site.y, 40));
    if (!visible.length) return;
    gl.useProgram(shader.program);
    gl.bindVertexArray(mesh.vao);
    gl.uniform4fv(shader.view, view);
    gl.uniform3fv(shader.glintCenters, glintCenters);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (const { x, y, normalX, normalY, kind } of visible) {
      const { color } = getMiningMaterial(oreMaterialId(kind));
      const { reflection, roughness } = oreFinishes[kind];
      gl.uniform2f(shader.position, x, y);
      gl.uniform2f(shader.wallNormal, normalX, normalY);
      gl.uniform3fv(shader.albedo, color);
      gl.uniform3fv(shader.reflection, reflection);
      gl.uniform1f(shader.roughness, roughness);
      gl.uniform1f(shader.glintTime, time === null ? -1 : time + x * 0.013 + y * 0.017);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.disable(gl.DEPTH_TEST);
  };
}
