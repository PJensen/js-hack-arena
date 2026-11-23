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

  // A tapered ice shard: the point faces +X and the wake trails behind it.
  float taper = 0.13 + 0.28 * smoothstep(-0.72, 0.42, x);
  taper *= 1.0 - 0.30 * smoothstep(0.40, 1.0, x);
  float facetWave = 0.035 * sin(x * 17.0 - u_time * 3.0);
  float crystal = 1.0 - smoothstep(taper - 0.035, taper + 0.035, abs(y + facetWave));
  float tip = 1.0 - smoothstep(0.86, 1.0, x);

  // Soft wake, concentrated behind the crystal rather than around its edge.
  float wakeWidth = 0.12 + 0.20 * smoothstep(-1.0, -0.12, -x);
  float wake = (1.0 - smoothstep(wakeWidth, wakeWidth + 0.16, abs(y)))
             * (1.0 - smoothstep(-0.95, 0.55, x));
  float shimmer = 0.5 + 0.5 * sin(x * 12.0 + y * 8.0 - u_time * 4.0);
  float alpha = (crystal * 0.92 + wake * (0.25 + shimmer * 0.18) + tip * 0.18) * u_alpha;
  vec3 ice = mix(vec3(0.24, 0.70, 1.0), vec3(0.90, 1.0, 1.0), crystal * 0.72 + shimmer * 0.18);
  out_color = vec4(ice, alpha);
}`;
