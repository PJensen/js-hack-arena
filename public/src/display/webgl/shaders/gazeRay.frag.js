export const GAZE_RAY_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_charge;
uniform float u_time;
in vec2 v_ray;
out vec4 out_color;

void main() {
  float along = v_ray.x;
  float across = v_ray.y;
  float envelope = sin(3.14159 * along);
  float pulse = 0.75 + 0.25 * sin(along * 28.0 - u_time * 9.0);
  float helix = sin(along * 27.0 - u_time * 5.0) * (0.22 + 0.22 * envelope);
  float filaments = exp(-abs(across - helix) * 31.0) + exp(-abs(across + helix) * 31.0);
  float core = exp(-abs(across) * mix(22.0, 12.0, u_charge));
  float halo = exp(-abs(across) * 5.5);
  float flash = step(1.0, u_charge);
  vec3 color = vec3(0.56, 0.12, 1.0) * (0.48 * halo + 0.44 * filaments * pulse);
  color += mix(vec3(0.76, 0.34, 1.0), vec3(1.0, 0.94, 1.0), u_charge) * core;
  out_color = vec4(color, min(1.0, 0.28 + 0.53 * u_charge + 0.19 * flash));
}`;
