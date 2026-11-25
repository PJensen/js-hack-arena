export const LOOT_GOBLIN_FLASH_FRAGMENT = `#version 300 es
precision highp float;

uniform float u_age;
uniform float u_strength;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec2 point = (v_uv - 0.5) * 2.0;
  float radius = length(point);
  float decay = exp(-5.6 * u_age) * (1.0 - smoothstep(0.65, 1.0, u_age));
  float softEdge = 1.0 - smoothstep(0.64, 1.0, radius);
  float bloom = exp(-4.8 * radius) * softEdge;
  float core = exp(-91.0 * dot(point, point));

  // Diffraction spreads the brightest part of the flash into feathered streaks.
  vec2 axis = mat2(0.96, 0.28, -0.28, 0.96) * point;
  float vertical = exp(-abs(axis.x) * 55.0 - abs(axis.y) * 5.2);
  float horizontal = exp(-abs(axis.y) * 68.0 - abs(axis.x) * 7.4);
  float diagonal = exp(-abs(axis.x - axis.y) * 82.0 - radius * 10.0);
  vec3 gold = vec3(1.0, 0.62, 0.19);
  vec3 whiteGold = vec3(1.0, 0.96, 0.77);
  vec3 emission = bloom * gold * 0.51 +
    core * whiteGold * 1.5 +
    (vertical + horizontal * 0.66 + diagonal * 0.34) * whiteGold * 0.72 * softEdge;
  out_color = vec4(emission * decay * u_strength, 1.0);
}`;
