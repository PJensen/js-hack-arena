# Rendering guidance

## WebGL shaders

- Keep GLSL source out of renderer orchestration files. Store each shader in its own module under `public/src/display/webgl/shaders/`, using a descriptive filename such as `frostBolt.frag.js` or `projectile.vert.js`.
- A shader module exports GLSL source only, except for intentionally parameterized sources such as the dynamic-light shader. Do not duplicate shader strings in `arenaRenderer.js`.
- Keep WebGL resource setup strict and explicit. When `device.program()` returns a raw `WebGLProgram`, retain that value and pass it directly to `uniform(gl, program, name)` before wrapping it in an object with named locations:

  ```js
  const program = device.program(VERTEX_SOURCE, FRAGMENT_SOURCE);
  const shader = {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
  };
  ```

- Do not call `uniform()` with `shader.program` until `shader` is actually the wrapper object. Do not use a raw `WebGLProgram` as though it already has a `.program` property.
- Do not wrap shader initialization in `try/catch` fallbacks. A shader compile, link, or uniform-layout failure must fail loudly during renderer initialization so the defect is fixed rather than hidden behind a degraded frame.
- Before handing off a shader change, run `deno check` on the renderer and shader modules plus `deno test tests/webgl_foundation_test.js`.
- For new directional effects, use a dedicated vertex shader with explicit orientation uniforms rather than stretching a circular `drawDisc()` or generic orb. Keep the visual primitive and its shader semantics aligned.
