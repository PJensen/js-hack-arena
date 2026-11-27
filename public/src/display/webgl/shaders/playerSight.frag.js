import { CAVE_SURFACE_GLSL } from './caveSurface.glsl.js';

export const PLAYER_SIGHT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_distances;
uniform sampler2D u_memory;
uniform vec2 u_terrain_size;
uniform float u_memory_cell_size;
uniform vec4 u_eye;
uniform vec2 u_cone;
uniform vec4 u_ranges;
uniform float u_distance;
in vec2 v_world;
out vec4 out_color;

${CAVE_SURFACE_GLSL}

float wallVisibility(float distanceFromEye, int ray) {
  float stop = texelFetch(u_distances, ivec2(ray, 0), 0).r;
  return 1.0 - smoothstep(stop, stop + u_ranges.w, distanceFromEye);
}

void main() {
  float pixelSize = max(fwidth(v_world.x), fwidth(v_world.y));
  vec2 offset = v_world - u_eye.xy;
  float distanceFromEye = length(offset);
  float visibility = 0.0;
  if (distanceFromEye < max(u_ranges.x, u_distance)) {
    float ahead = dot(offset, u_eye.zw) / max(distanceFromEye, 0.001);
    float forward = smoothstep(u_cone.x, u_cone.y, ahead) *
      (1.0 - smoothstep(max(0.0, u_distance - u_ranges.z), u_distance, distanceFromEye));
    float nearby = 1.0 - smoothstep(u_ranges.x - u_ranges.y, u_ranges.x, distanceFromEye);
    visibility = max(forward, nearby);
    if (visibility > 0.0 && distanceFromEye > 0.001) {
      int count = textureSize(u_distances, 0).x;
      float heading = offset.x == 0.0 ? sign(offset.y) * 1.57079632679 : atan(offset.y, offset.x);
      float ray = fract(heading / 6.28318530718 + 1.0) * float(count);
      int index = int(floor(ray)) % count;
      visibility *= mix(wallVisibility(distanceFromEye, index),
        wallVisibility(distanceFromEye, (index + 1) % count), fract(ray));
    }
  }
  vec3 darkness = vec3(0.032, 0.044, 0.052);
  if (visibility < 1.0 && all(greaterThanEqual(v_world, vec2(0.0))) &&
      all(lessThan(v_world, u_terrain_size))) {
    vec2 memorySize = vec2(textureSize(u_memory, 0)) * u_memory_cell_size;
    vec2 memory = texture(u_memory, v_world / memorySize).rg;
    if (memory.r > 0.0) {
      float clearance = (memory.g / memory.r) * (255.0 / 4.0);
      vec3 terrain = caveSurface(clearance, v_world / u_terrain_size, v_world, pixelSize, 0.0);
      float luma = dot(terrain, vec3(0.2126, 0.7152, 0.0722));
      vec3 remembered = mix(vec3(luma), terrain, 0.25) * vec3(0.32, 0.35, 0.40);
      darkness = mix(darkness, remembered, smoothstep(0.05, 0.95, memory.r));
    }
  }
  out_color = vec4(darkness, 1.0 - visibility);
}`;
