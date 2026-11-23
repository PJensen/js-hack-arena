export const GHOST_PIPE_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_emission;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec3 u_glow;
uniform float u_intensity;
out vec3 v_color;
void main() {
  vec3 model = a_position;
  // Match the campfire's tilted orthographic view of floor props.
  vec2 ground = u_position + vec2(model.x, model.y * 0.78 - model.z * 0.63);
  vec2 clip = (ground - u_view.xy) * 2.0 / u_view.zw;
  float depth = -(model.y * 0.63 + model.z * 0.78) / 80.0;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_color = a_color + a_emission * u_glow * (0.26 * u_intensity);
}`;
