// Responsive, client-owned local-player presentation. It never writes to the
// authoritative replica world; snapshots only reconcile this render position.
import { Collider, Position, Speed } from '../rules/components/index.js';
import { moveWithSlide } from '../rules/geometry/sweep.js';

export function createLocalPlayerPrediction({ world, playerId, grid }) {
  const initial = world.get(playerId, Position);
  let x = initial.x;
  let y = initial.y;
  let correctionX = 0;
  let correctionY = 0;

  function reconcile() {
    const authoritative = world.get(playerId, Position);
    const errorX = authoritative.x - x;
    const errorY = authoritative.y - y;
    if (Math.hypot(errorX, errorY) > 96) {
      x = authoritative.x;
      y = authoritative.y;
      correctionX = 0;
      correctionY = 0;
      return;
    }
    correctionX = errorX;
    correctionY = errorY;
  }

  function step(sample, dt) {
    const speed = world.get(playerId, Speed)?.max ?? 0;
    const radius = world.get(playerId, Collider)?.radius ?? 0;
    const moveX = finiteUnit(sample.intent?.moveX);
    const moveY = finiteUnit(sample.intent?.moveY);
    const moved = moveWithSlide(grid, x, y, moveX * speed * dt, moveY * speed * dt, radius);
    x = moved.x + correctionX * 0.15;
    y = moved.y + correctionY * 0.15;
    correctionX *= 0.85;
    correctionY *= 0.85;
  }

  return {
    position: () => ({ x, y }),
    reconcile,
    step,
  };
}

function finiteUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}
