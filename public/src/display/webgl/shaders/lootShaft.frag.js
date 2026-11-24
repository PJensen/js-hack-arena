export const LOOT_SHAFT_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform vec3 u_color;
uniform float u_time;
in vec2 v_offset;
out vec4 out_color;
void main() {
  float x = v_offset.x / u_size.x;
  float y = -v_offset.y / u_size.y;
  float pulse = 0.93 + 0.07 * sin(u_time * 2.4);
  float taper = mix(1.0, 0.40, smoothstep(0.0, 1.0, y));
  float crossSection = abs(x) / taper;
  // A chord through the circular cross section softens the edge of the volume.
  float chord = sqrt(max(0.0, 1.0 - crossSection * crossSection));
  float envelope = smoothstep(-0.07, 0.08, y) * (1.0 - smoothstep(0.18, 1.0, y));
  float halo = chord * exp(-4.0 * crossSection * crossSection) * 0.36;
  float core = 1.0 - smoothstep(0.018, max(0.11, fwidth(crossSection)), crossSection);
  float shimmer = 0.94 + 0.06 * cos(32.0 * y - u_time * 4.0);

  vec2 floorOffset = vec2(x, v_offset.y / (u_size.x * 0.55));
  float floorFalloff = 1.0 - smoothstep(0.0, 1.0, length(floorOffset));
  vec3 beam = u_color * halo + mix(u_color, vec3(1.0), 0.78) * core * shimmer * 0.62;
  vec3 floorGlow = u_color * floorFalloff * floorFalloff * 0.55;
  // Emission is already weighted by the profiles above; add it at full alpha.
  out_color = vec4((beam * envelope + floorGlow) * pulse, 1.0);
}`;
