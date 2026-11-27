export const DUNGEON_LIGHT_GLSL = `
const vec3 AMBIENT_LIGHT = vec3(0.14, 0.15, 0.18);

vec3 mapDungeonLight(vec3 illumination) {
  return illumination / (vec3(0.55) + illumination);
}
`;
