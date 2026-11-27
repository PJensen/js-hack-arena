// World-space samples shared by the darkness pass and visibility checks for UI.
const RAY_COUNT = 320;
const TURN = Math.PI * 2;
const WALL_CLEARANCE = 3;
const AWARENESS_DISTANCE = 68;
const AWARENESS_FEATHER = 24;
const RANGE_FEATHER = 34;
const WALL_FEATHER = 11;
const rayX = Float64Array.from({ length: RAY_COUNT }, (_, i) => Math.cos(i * TURN / RAY_COUNT));
const rayY = Float64Array.from({ length: RAY_COUNT }, (_, i) => Math.sin(i * TURN / RAY_COUNT));

function smoothstep(start, end, value) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function createPlayerSight(grid) {
  const distances = new Float32Array(RAY_COUNT);
  // Position and facing direction in world space.
  const eye = new Float32Array(4);
  const cone = new Float32Array(2);
  const ranges = new Float32Array([AWARENESS_DISTANCE, AWARENESS_FEATHER, RANGE_FEATHER, WALL_FEATHER]);
  const step = Math.min(grid.cellSize * 0.5, 4);
  let originX, originY, rayRange, forwardDistance;
  let dirty = true;

  function update({ x, y }, facing, { distance, angle }) {
    eye[0] = x;
    eye[1] = y;
    eye[2] = Math.cos(facing);
    eye[3] = Math.sin(facing);
    const halfAngle = angle * 0.5;
    cone[0] = Math.cos(halfAngle);
    cone[1] = Math.sin(halfAngle);
    forwardDistance = distance;
    const limit = Math.max(distance, AWARENESS_DISTANCE);
    if (!dirty && originX === eye[0] && originY === eye[1] && rayRange === limit) return false;

    dirty = false;
    originX = eye[0];
    originY = eye[1];
    rayRange = limit;
    const clearance = grid.distanceMove(originX, originY);
    for (let i = 0; i < RAY_COUNT; i++) {
      let previous = clearance;
      let blockedAt = limit;
      for (let lastTravel = 0; lastTravel < limit;) {
        const travel = Math.min(lastTravel + step, limit);
        const current = grid.distanceMove(originX + rayX[i] * travel, originY + rayY[i] * travel);
        if (current <= WALL_CLEARANCE) {
          const fraction = Math.max(0, (previous - WALL_CLEARANCE) / (previous - current));
          blockedAt = lastTravel + (Number.isFinite(fraction) ? fraction * (travel - lastTravel) : 0);
          break;
        }
        previous = current;
        lastTravel = travel;
      }
      distances[i] = blockedAt;
    }
    return true;
  }

  function contains(x, y) {
    // UI and entity centers use the same falloffs as the rendered mask.
    const dx = x - eye[0], dy = y - eye[1];
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return true;
    if (distance >= rayRange) return false;

    const ahead = dx * eye[2] + dy * eye[3];
    const side = Math.abs(dy * eye[2] - dx * eye[3]);
    const cosHalfAngle = cone[0], sinHalfAngle = cone[1];
    // Use the round boundary behind the tangent points and the sloped sides ahead.
    const edgeDistance = ahead * cosHalfAngle + side * sinHalfAngle >= 0
      ? AWARENESS_DISTANCE + ahead * sinHalfAngle - side * cosHalfAngle
      : AWARENESS_DISTANCE - distance;
    const forward = smoothstep(0, AWARENESS_FEATHER, edgeDistance) *
      (1 - smoothstep(Math.max(0, forwardDistance - RANGE_FEATHER), forwardDistance, distance));
    const nearby = 1 - smoothstep(AWARENESS_DISTANCE - AWARENESS_FEATHER, AWARENESS_DISTANCE, distance);
    const falloff = Math.max(forward, nearby);
    if (falloff <= 0.25) return false;

    const ray = ((Math.atan2(dy, dx) / TURN + 1) % 1) * RAY_COUNT;
    const index = Math.floor(ray);
    const left = wallVisibility(distance, distances[index]);
    const right = wallVisibility(distance, distances[(index + 1) % RAY_COUNT]);
    return falloff * (left + (right - left) * (ray - index)) > 0.25;
  }

  function invalidate() {
    dirty = true;
  }

  return { distances, eye, cone, ranges, update, contains, invalidate };
}

function wallVisibility(distance, stop) {
  return 1 - smoothstep(stop, stop + WALL_FEATHER, distance);
}
