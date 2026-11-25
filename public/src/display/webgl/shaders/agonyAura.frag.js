export const AGONY_AURA_FRAGMENT = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_progress;
uniform float u_opacity;
in vec2 v_uv;
out vec4 out_color;

void main() {
  float height = 1.0 - v_uv.y;
  float x = v_uv.x * 2.0 - 1.0;
  float sidePhase = x < 0.0 ? 0.0 : 1.7;
  float flow = height * 10.0 + u_time * 3.8 + sidePhase;
  float curl = sin(flow) * 0.065 + sin(flow * 1.9) * 0.028;
  float spine = 0.56 + height * 0.11 + curl;
  float split = smoothstep(0.32, 0.78, height);
  float fork = spine + split * (0.08 + 0.09 * u_progress);

  float d = abs(abs(x) - spine);
  float forkDistance = abs(abs(x) - fork);
  float edge = max(fwidth(x), 0.012);
  float thread = 1.0 - smoothstep(0.018, 0.018 + edge, d);
  float branch = (1.0 - smoothstep(0.014, 0.014 + edge, forkDistance)) * split;
  float haze = exp(-d * 16.0) * 0.38 + exp(-forkDistance * 19.0) * split * 0.22;

  // Stagger the bright motes so they climb each side at different times.
  float moteHeight = fract(u_time * 1.55 + sidePhase * 0.24 + 0.18);
  float mote = exp(-abs(height - moteHeight) * 30.0 - d * 36.0);
  float taper = smoothstep(0.10, 0.27, height) * (1.0 - smoothstep(0.76, 0.97, height));
  float surge = exp(-fract(u_time + 0.4) * 7.0) * smoothstep(0.35, 0.92, u_progress);
  float emission = haze + thread * 0.45 + branch * 0.42 + mote * 0.65;
  vec3 color = mix(vec3(0.69, 0.09, 0.96), vec3(1.0, 0.53, 0.87), clamp(thread + mote * 0.7, 0.0, 1.0));
  float opacity = min(0.84, emission * taper * (0.57 + u_progress * 0.51 + surge * 0.22));
  out_color = vec4(color, opacity * u_opacity);
}`;
