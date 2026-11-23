export const CAMPFIRE_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_heat;
uniform vec4 u_view;
uniform vec2 u_position;
uniform float u_time;
uniform float u_intensity;
out vec3 v_color;
void main() {
  vec3 model = a_position;
  float sway = sin(u_time * 5.7 + model.x * 0.24 + model.z * 0.13);
  model.x += a_heat * (4.7 * sway + sin(u_time * 9.0) * 1.4);
  model.z += a_heat * (5.8 * sin(u_time * 7.0 + model.x * 0.27) + 12.0 * (u_intensity - 0.87));
  // Tilt the camera to reveal the sides of the firewood and stone rim.
  vec2 ground = u_position + vec2(model.x, model.y * 0.78 - model.z * 0.63);
  vec2 clip = (ground - u_view.xy) * 2.0 / u_view.zw;
  float depth = -(model.y * 0.63 + model.z * 0.78) / 80.0;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_color = a_color * (1.0 + a_heat * (0.11 * sway + 0.35 * (u_intensity - 0.87)));
}`;
