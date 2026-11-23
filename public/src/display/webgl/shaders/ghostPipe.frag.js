export const GHOST_PIPE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_glow;
uniform float u_intensity;
in vec2 v_uv;
out vec4 out_color;

float ellipse(vec2 p, vec2 radii) {
  return 1.0 - smoothstep(0.87, 1.0, length(p / radii));
}

vec4 over(vec4 back, vec3 color, float alpha) {
  return vec4(color * alpha, alpha) + back * (1.0 - alpha);
}

vec4 stalk(vec2 p, float exposure) {
  float stemCenter = 0.09 * p.y * p.y - 0.037;
  float shaft = 1.0 - smoothstep(0.041, 0.066, abs(p.x - stemCenter));
  shaft *= smoothstep(-0.43, -0.39, p.y) * (1.0 - smoothstep(0.52, 0.61, p.y));
  vec2 hook = (p - vec2(0.137, -0.41)) / vec2(0.17, 0.186);
  float neck = (1.0 - smoothstep(0.20, 0.34, abs(length(hook) - 1.0))) * (1.0 - smoothstep(-0.04, 0.16, hook.y));

  float scales = max(ellipse(vec2(p.x + (p.y + 0.10) * 0.44 + 0.055, p.y + 0.10), vec2(0.031, 0.11)),
    max(ellipse(vec2(p.x - (p.y - 0.12) * 0.39 - 0.023, p.y - 0.12), vec2(0.035, 0.10)),
      ellipse(vec2(p.x + (p.y - 0.34) * 0.43 + 0.065, p.y - 0.34), vec2(0.030, 0.08))));
  vec3 ivory = vec3(0.55, 0.55, 0.60) + u_glow * (0.18 * u_intensity);
  vec4 plant = over(vec4(0.0), ivory * exposure, max(shaft, neck) * 0.92);
  plant = over(plant, ivory * (exposure + 0.08), scales * 0.86);

  // The terminal flower hangs from the far end of the neck.
  vec2 bell = p - vec2(0.323, -0.305);
  bell.x -= 0.22 * bell.y;
  float body = ellipse(bell, vec2(0.128, 0.184));
  float petals = max(ellipse(bell - vec2(-0.063, 0.067), vec2(0.061, 0.142)),
    max(ellipse(bell - vec2(0.014, 0.084), vec2(0.063, 0.146)),
      ellipse(bell - vec2(0.083, 0.055), vec2(0.053, 0.123))));
  vec3 petal = vec3(0.66, 0.65, 0.70) + u_glow * (0.32 * u_intensity);
  plant = over(plant, petal * exposure, max(body, petals) * 0.96);

  float seams = max(ellipse(bell - vec2(-0.018, 0.095), vec2(0.013, 0.104)),
    ellipse(bell - vec2(0.056, 0.083), vec2(0.011, 0.095)));
  plant = over(plant, ivory * 0.63 * exposure, seams * 0.54);
  float sheen = ellipse(bell - vec2(-0.057, -0.014), vec2(0.026, 0.106));
  return over(plant, vec3(0.89, 0.87, 0.91) * exposure, sheen * 0.51);
}

void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float shadow = ellipse(p - vec2(-0.04, 0.53), vec2(0.55, 0.15));
  vec4 color = over(vec4(0.0), vec3(0.035, 0.034, 0.042), shadow * 0.35);
  vec4 left = stalk((p - vec2(0.39, 0.12)) * vec2(-1.0, 1.0) / 0.68, 0.73);
  vec4 right = stalk((p - vec2(-0.48, 0.21)) / 0.53, 0.85);
  vec4 center = stalk((p - vec2(-0.14, -0.09)) / 1.04, 1.0);
  color = left + color * (1.0 - left.a);
  color = right + color * (1.0 - right.a);
  color = center + color * (1.0 - center.a);
  out_color = vec4(color.rgb / max(color.a, 0.001), color.a);
}`;
