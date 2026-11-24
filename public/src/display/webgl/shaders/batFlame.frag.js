export const BAT_FLAME_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;

void main() {
  float rise = 1.0 - v_uv.y;
  float curl = sin(rise * 9.8 - u_time * 7.0) * 0.20 + sin(rise * 18.0 + u_time * 9.0) * 0.07;
  float x = v_uv.x * 2.0 - 1.0 - curl * rise;
  float taper = pow(max(0.0, 1.0 - rise), 0.72);
  float root = smoothstep(0.0, 0.18, rise);
  float tongue = 1.0 - smoothstep(0.38 * taper, 0.78 * taper + 0.012, abs(x));
  float fork = sin(rise * 5.1 - u_time * 3.2) * rise * 0.52;
  float edge = 1.0 - smoothstep(0.05 * taper, 0.30 * taper + 0.015, abs(x - fork));
  edge *= smoothstep(0.18, 0.60, rise);
  float core = (1.0 - smoothstep(0.03, 0.33 * taper + 0.04, abs(x))) * (1.0 - smoothstep(0.17, 0.65, rise));
  float alpha = root * max(tongue * 0.68, edge * 0.59) * u_alpha;
  vec3 color = mix(vec3(1.0, 0.18, 0.035), vec3(1.0, 0.84, 0.37), core);
  out_color = vec4(color, alpha);
}`;
