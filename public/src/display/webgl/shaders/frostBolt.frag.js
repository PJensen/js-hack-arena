export const FROST_BOLT_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float x = p.x;
  float y = p.y;

  // A short faceted ice spear: narrow tail, angular shoulders, sharp tip.
  float bodyWidth = mix(0.055, 0.24, smoothstep(-0.82, 0.02, x));
  bodyWidth *= 1.0 - 0.92 * smoothstep(0.38, 1.0, x);
  float facet = 0.028 * sin(x * 15.0 - u_time * 2.5);
  float crystal = 1.0 - smoothstep(bodyWidth - 0.025, bodyWidth + 0.025, abs(y + facet));
  float tip = 1.0 - smoothstep(0.52, 0.98, x);

  // Soft wake, concentrated behind the crystal rather than around its edge.
  float wakeWidth = 0.06 + 0.14 * smoothstep(-1.0, -0.12, -x);
  float wake = (1.0 - smoothstep(wakeWidth, wakeWidth + 0.16, abs(y)))
             * (1.0 - smoothstep(-0.95, 0.55, x));
  float shimmer = 0.5 + 0.5 * sin(x * 12.0 + y * 8.0 - u_time * 4.0);
  float alpha = (crystal * 0.92 + wake * (0.25 + shimmer * 0.18) + tip * 0.18) * u_alpha;
  vec3 ice = mix(vec3(0.24, 0.70, 1.0), vec3(0.90, 1.0, 1.0), crystal * 0.72 + shimmer * 0.18);
  out_color = vec4(ice, alpha);
}`;
