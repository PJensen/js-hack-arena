export const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform sampler2D u_water;
uniform sampler2D u_stone;
uniform sampler2D u_lava;
uniform ivec2 u_grid_size;
uniform float u_terrain_time;
in vec2 v_uv;
in vec2 v_world;
out vec4 out_color;
float field_sample(vec2 uv) {
  vec2 point = clamp(uv, 0.0, 1.0) * vec2(u_grid_size - 1);
  ivec2 base = ivec2(floor(point));
  ivec2 next = min(base + 1, u_grid_size - 1);
  vec2 blend = fract(point);
  float a = texelFetch(u_field, base, 0).r;
  float b = texelFetch(u_field, ivec2(next.x, base.y), 0).r;
  float c = texelFetch(u_field, ivec2(base.x, next.y), 0).r;
  float d = texelFetch(u_field, next, 0).r;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), f.x),
    f.y
  );
}

vec3 embeddedStones(vec3 soil, vec2 p, float scale, float pixelSize, float dirt) {
  vec2 tile = p / scale;
  vec2 cell = floor(tile);
  float size = hash(cell + 23.7);
  float shade = hash(cell + 17.3);
  if (size < 0.28 + dirt * 0.24) return soil;
  vec2 offset = vec2(hash(cell + 8.2), hash(cell - 31.6)) - 0.5;
  vec2 local = fract(tile) - 0.5 - offset * 0.43;
  float turn = shade * 6.28318;
  vec2 q = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * local;
  q.y *= mix(1.12, 1.8, shade);
  // Clip the rounded profile along an oblique face for a chipped silhouette.
  float radius = mix(0.10, 0.24, size);
  float profile = max(length(q), abs(q.x + q.y * 0.28) * 1.16);
  float aa = max(pixelSize / scale, 0.007);
  float mask = 1.0 - smoothstep(radius - aa, radius + aa, profile);
  float bevel = 1.0 - smoothstep(radius - 0.042, radius, profile);
  float litFace = smoothstep(-0.19, 0.17, -local.x - local.y);
  float shadow = 1.0 - smoothstep(radius, radius + aa + 0.023, profile);
  vec3 stone = mix(vec3(0.27, 0.25, 0.22), vec3(0.42, 0.41, 0.36), shade);
  stone *= mix(0.73 + litFace * 0.42, 1.0, bevel);
  return mix(soil * (1.0 - 0.23 * shadow), stone, mask * 0.78);
}

vec3 dirtyFloor(vec2 p, float pixelSize) {
  float soil = noise(p * 0.011) * 0.72 + noise(p * 0.038 + 47.0) * 0.28;
  float patches = smoothstep(0.26, 0.76, soil);
  vec3 color = mix(vec3(0.265, 0.222, 0.176), vec3(0.373, 0.351, 0.308), patches);
  float roughness = noise(p * 0.12 + 14.0) - 0.5;
  float grit = (noise(p * 0.44) - 0.5) * (1.0 - smoothstep(0.9, 3.0, pixelSize));
  color += roughness * 0.072 + grit * 0.043;

  float seam = abs(noise(p * 0.031 + vec2(91.0, 34.0)) - 0.5 + roughness * 0.11 + grit * 0.034);
  float cracks = (1.0 - smoothstep(0.008, 0.030, seam)) * smoothstep(0.34, 0.64, soil);
  color *= 1.0 - cracks * smoothstep(-0.17, 0.09, roughness) * 0.24;
  color = embeddedStones(color, p, 36.0, pixelSize, 1.0 - patches);
  color = embeddedStones(color, p + vec2(6.1, 14.7), 13.0, pixelSize, 1.0 - patches);
  return color;
}

vec3 shallowWater(vec3 floorColor, vec2 p, float depth) {
  float drift = noise(p * 0.026 + vec2(-u_terrain_time * 0.07, 12.0));
  float wave = sin(dot(p, vec2(0.088, 0.036)) + drift * 3.1 - u_terrain_time * 1.3);
  float crossWave = sin(dot(p, vec2(-0.034, 0.091)) + drift * 2.2 + u_terrain_time * 0.9);
  float caustic = (1.0 - smoothstep(0.0, 0.09, abs(wave * 0.6 + crossWave * 0.4)))
    * smoothstep(0.30, 0.72, drift);
  vec3 color = floorColor * mix(vec3(0.63, 0.89, 0.99), vec3(0.36, 0.71, 0.82), depth)
    + vec3(0.014, 0.073, 0.095) * depth;
  color += vec3(0.045, 0.11, 0.13) * caustic;
  return color;
}

float floorPaint(sampler2D material) {
  vec2 size = vec2(textureSize(material, 0));
  if (size.x <= 1.0) return 0.0;
  vec2 uv = (clamp(v_uv, 0.0, 1.0) * (size - 1.0) + 0.5) / size;
  return texture(material, uv).r;
}

vec3 cryptFloor(vec2 p, float pixelSize) {
  vec2 tile = p / vec2(44.0, 36.0);
  tile.x += mod(floor(tile.y), 2.0) * 0.5;
  vec2 cell = floor(tile);
  vec2 local = fract(tile) * vec2(44.0, 36.0);
  vec2 farEdge = vec2(44.0, 36.0) - local;
  vec2 edgeDistance = min(local, farEdge);
  float corner = (edgeDistance.x + edgeDistance.y) * 0.67;
  float edge = min(min(edgeDistance.x, edgeDistance.y), corner);
  float face = smoothstep(0.75, 0.75 + pixelSize, edge);
  float variation = hash(cell + 56.1);
  vec3 stone = mix(vec3(0.28, 0.29, 0.30), vec3(0.46, 0.45, 0.41), variation);
  stone += (noise(p * 0.20) - 0.5) * 0.031;
  float bevel = 1.0 - smoothstep(1.2, 3.0 + pixelSize, edge);
  vec3 bevelColor = min(local.x, local.y) < min(farEdge.x, farEdge.y) ? vec3(0.09) : vec3(-0.10);
  return mix(vec3(0.115, 0.108, 0.099), stone + bevelColor * bevel, face);
}

vec3 moltenLava(vec2 p, float pixelSize) {
  float heat = noise(p * 0.061) * 0.74 + noise(p * 0.16) * 0.26;
  vec3 color = mix(vec3(0.78, 0.105, 0.015), vec3(1.0, 0.54, 0.075), smoothstep(0.23, 0.81, heat));
  float crust = (1.0 - smoothstep(0.12, 0.32, heat));
  color = mix(color, vec3(0.30, 0.044, 0.019), crust * 0.75);

  // Local domes swell, catch a highlight, then collapse into the pool.
  vec2 tile = p / 24.0;
  vec2 cell = floor(tile);
  float seed = hash(cell + 13.7);
  vec2 center = mix(vec2(0.27), vec2(0.73), vec2(hash(cell - 7.1), hash(cell + 2.9)));
  float phase = fract(u_terrain_time / mix(1.8, 3.7, seed) + seed);
  float swell = smoothstep(0.0, 0.34, phase) * (1.0 - smoothstep(0.40, 0.55, phase));
  vec2 local = (fract(tile) - center) * vec2(1.0, 1.15);
  float radius = mix(0.09, 0.21, seed) * swell;
  float aa = max(pixelSize / 24.0, 0.01);
  float dome = (1.0 - smoothstep(radius - aa, radius + aa, length(local))) * swell;
  float shine = 1.0 - smoothstep(radius * 0.2, radius * 0.7 + aa, length(local + radius * 0.35));
  vec3 bubble = mix(vec3(0.58, 0.09, 0.012), vec3(1.0, 0.83, 0.28), shine);
  return mix(color, bubble, dome);
}

void main() {
  float clearance = field_sample(v_uv);
  float pixelSize = max(fwidth(v_world.x), fwidth(v_world.y));
  // Unlit material colors. The world lighting pass shades the terrain and props together.
  vec3 wall = vec3(0.10, 0.075, 0.058);
  vec3 edge = vec3(0.21, 0.16, 0.12);
  vec3 floorColor = vec3(0.34, 0.33, 0.31);
  vec3 color = clearance > 10.0 ? edge : wall;
  if (clearance > 18.0) {
    color = mix(floorColor, dirtyFloor(v_world, pixelSize), smoothstep(18.0, 26.0, clearance) * 0.88);
    float edgeFade = smoothstep(18.0, 24.0, clearance);
    float stone = floorPaint(u_stone);
    if (stone > 0.0) {
      color = mix(color, cryptFloor(v_world, pixelSize), smoothstep(0.25, 0.72, stone) * edgeFade);
    }
    float water = floorPaint(u_water);
    if (water > 0.0) {
      color = mix(color, shallowWater(color, v_world, water), smoothstep(0.25, 0.72, water) * edgeFade);
    }
    float lava = floorPaint(u_lava);
    if (lava > 0.0) {
      color = mix(color, moltenLava(v_world, pixelSize), smoothstep(0.25, 0.72, lava) * edgeFade);
    }
  }
  out_color = vec4(color, 1.0);
}`;
