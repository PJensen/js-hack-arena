export const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform sampler2D u_water;
uniform ivec2 u_grid_size;
uniform float u_water_time;
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
  float drift = noise(p * 0.026 + vec2(-u_water_time * 0.07, 12.0));
  float wave = sin(dot(p, vec2(0.088, 0.036)) + drift * 3.1 - u_water_time * 1.3);
  float crossWave = sin(dot(p, vec2(-0.034, 0.091)) + drift * 2.2 + u_water_time * 0.9);
  float caustic = (1.0 - smoothstep(0.0, 0.09, abs(wave * 0.6 + crossWave * 0.4)))
    * smoothstep(0.30, 0.72, drift);
  vec3 color = floorColor * mix(vec3(0.63, 0.89, 0.99), vec3(0.36, 0.71, 0.82), depth)
    + vec3(0.014, 0.073, 0.095) * depth;
  color += vec3(0.045, 0.11, 0.13) * caustic;
  return color;
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
    vec2 waterSize = vec2(textureSize(u_water, 0));
    if (waterSize.x > 1.0) {
      vec2 waterUV = (clamp(v_uv, 0.0, 1.0) * (waterSize - 1.0) + 0.5) / waterSize;
      float water = texture(u_water, waterUV).r;
      if (water > 0.0) {
        float coverage = smoothstep(0.25, 0.72, water) * smoothstep(18.0, 24.0, clearance);
        color = mix(color, shallowWater(color, v_world, water), coverage);
      }
    }
  }
  out_color = vec4(color, 1.0);
}`;
