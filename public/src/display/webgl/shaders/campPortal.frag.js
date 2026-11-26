export const CAMP_PORTAL_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec2 point = (v_uv - 0.5) * 2.0;
  float radius = length(point);
  float angle = atan(point.y, point.x + 0.00001);
  float aa = max(fwidth(radius), 0.008);
  float rim = 0.72 + 0.017 * sin(angle * 7.0 - u_time * 2.3);
  float edge = 1.0 - smoothstep(0.018, 0.018 + aa, abs(radius - rim));
  float glow = exp(-abs(radius - rim) * 13.0);
  float opening = 1.0 - smoothstep(rim - aa, rim + aa, radius);
  float spokes = sin(angle * 3.0 + radius * 17.0 - u_time * 2.0);
  float veils = smoothstep(0.0, 0.88, spokes) * smoothstep(0.0, 0.3, radius);
  float stone = smoothstep(0.74 - aa, 0.74 + aa, radius) *
                (1.0 - smoothstep(0.88 - aa, 0.88 + aa, radius));
  float joints = smoothstep(0.84, 0.98, cos(angle * 12.0));
  vec3 color = mix(vec3(0.036, 0.13, 0.27), vec3(0.15, 0.72, 0.91), veils);
  color = mix(color, vec3(0.13, 0.24, 0.31), stone * (1.0 - joints * 0.75));
  color += vec3(0.14, 0.62, 0.86) * glow + vec3(0.34, 0.39, 0.43) * edge;
  float alpha = max(max(opening * 0.94, stone), glow * 0.8);
  out_color = vec4(color, alpha * (1.0 - smoothstep(0.93, 1.0, radius)));
}`;
