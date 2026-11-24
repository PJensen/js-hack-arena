export const WEB_SHOT_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  float strands = 0.0;
  for (int i = 0; i < 5; i++) {
    float index = float(i);
    float tip = 0.44 + index * 0.075;
    float tail = -0.93 + index * 0.13;
    float t = clamp((p.x - tail) / (tip - tail), 0.0, 1.0);
    float loose = (index - 2.0) * 0.33 * (1.0 - t);
    float twist = sin(p.x * (6.1 + index * 0.62) + index * 2.2 - u_time * 23.0);
    float wave = twist * (0.11 + 0.18 * sin(t * 3.14));
    float thread = 1.0 - smoothstep(0.025, 0.15, abs(p.y - loose - wave));
    float taper = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.85, 1.0, t));
    strands = max(strands, thread * taper * (0.73 + index * 0.06));
  }
  out_color = vec4(0.92, 0.96, 1.0, strands * u_alpha);
}`;
