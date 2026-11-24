export const WEB_SNARE_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_release;
uniform float u_variant;
in vec2 v_uv;
out vec4 out_color;

const vec2 anchors[7] = vec2[7](
  vec2(0.92, 0.14), vec2(0.51, 0.82), vec2(-0.17, 0.70), vec2(-0.91, 0.48),
  vec2(-0.80, -0.27), vec2(-0.28, -0.88), vec2(0.58, -0.73)
);

float distanceToThread(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_variant;
  float strand = 1.0;
  for (int i = 0; i < 7; i++) {
    vec2 a = anchors[i];
    vec2 b = anchors[(i + 1) % 7];
    float release = clamp(u_release * 1.45 - mod(float(i) * 0.37, 0.45), 0.0, 1.0);
    float retract = release * release;
    strand = min(strand, distanceToThread(p, a * mix(0.38, 0.94, retract), a));
    for (int course = 0; course < 3; course++) {
      float ring = 0.46 + float(course) * 0.15;
      float uneven = 0.031 * sin(float(i + course) * 3.1);
      vec2 start = a * (ring + uneven);
      vec2 end = b * (ring - uneven);
      vec2 sag = (start + end) * 0.46;
      // Tension releases strand by strand, pulling each loose end toward its anchor.
      vec2 looseEnd = mix(sag, start, retract * 0.88);
      strand = min(strand, distanceToThread(p, start, looseEnd));
      strand = min(strand, distanceToThread(p, mix(sag, end, retract * 0.88), end));
    }
  }
  float shadow = 1.0 - smoothstep(0.027, 0.064, strand);
  float silk = 1.0 - smoothstep(0.009, 0.035, strand);
  vec3 color = mix(vec3(0.09, 0.1, 0.13), vec3(0.86, 0.91, 0.96), silk);
  out_color = vec4(color, max(shadow * 0.24, silk * 0.86) * (1.0 - u_release));
}`;
