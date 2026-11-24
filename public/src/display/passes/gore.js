import { createDeterministicRng } from '../../runtime/rng.js';

export const GORE_LIMITS = Object.freeze({ stains: 224, drops: 112, fragments: 48 });

const flesh = { drop: [0.72, 0.055, 0.10], stain: [0.43, 0.036, 0.075], fragment: [0.65, 0.11, 0.15] };
const slime = { drop: [0.22, 0.88, 0.57], stain: [0.14, 0.53, 0.36], fragment: [0.22, 0.81, 0.57], gel: true };
const ichor = { drop: [0.68, 0.66, 0.24], stain: [0.42, 0.37, 0.11], fragment: [0.43, 0.32, 0.22] };
const eyeIchor = { drop: [0.85, 0.30, 0.98], stain: [0.63, 0.16, 0.68], fragment: [0.76, 0.37, 0.84], gel: true };
const spectral = { drop: [0.68, 0.38, 0.97], spectral: true };
const charred = { drop: [1, 0.39, 0.075], stain: [0.23, 0.12, 0.075], fragment: [0.40, 0.17, 0.085] };

export function createGorePass({ grid, seed, reducedMotion = () => false }) {
  const stains = [];
  const drops = [];
  const fragments = [];
  const rng = createDeterministicRng(seed ^ 0x174c6d21);

  function add({ x, y, amount, killed, targetTheme, impactAngle, spellId }) {
    if (!(amount > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const material = targetTheme === 'frost' || targetTheme === 'gas_spore' ? slime : targetTheme === 'shadow' ? spectral :
      targetTheme === 'spider' ? ichor : targetTheme === 'floating_eye' ? eyeIchor :
      targetTheme === 'flaming_bat' ? charred : flesh;
    const strength = Math.min(1.7, 0.7 + amount / 22);
    const direction = Number.isFinite(impactAngle) ? impactAngle : rng.float(0, 2 * Math.PI);
    const fan = killed ? 1.6 : spellId === 'rend' || spellId === 'arrow' ? 0.43 : 1.05;
    const still = reducedMotion();
    if (killed && material.stain) {
      addStain({ x, y, angle: direction, size: material.gel ? 13 : 10, material }, 1);
    }

    const count = killed ? 19 : Math.round(5 + strength * 5);
    for (let i = 0; i < count; i++) {
      const angle = direction + (i % 7 === 0 ? Math.PI : 0) + rng.float(-fan, fan);
      const speed = rng.float(23, 87) * strength * (material.spectral ? 0.63 : 1);
      const drop = launch(x, y, angle, speed, rng.float(13, 60), material);
      drop.size = rng.float(1.15, material.gel ? 4 : 3) * Math.sqrt(strength);
      drop.leavesStain = i % 2 === 0;
      if (!still) {
        append(drops, drop, GORE_LIMITS.drops);
      } else if (drop.leavesStain && material.stain) {
        move(drop, drop.vx * 0.22, drop.vy * 0.22);
        addStain(drop, 0.76);
      }
    }
    if (!killed || material.spectral) return;
    for (let i = 0; i < (material.gel ? 6 : 8); i++) {
      const angle = direction + rng.float(-2.1, 2.1);
      const fragment = launch(x, y, angle, rng.float(21, 67), rng.float(43, 89), material);
      fragment.size = rng.float(3.4, material.gel ? 7 : 5.8);
      fragment.color = material === flesh && i % 4 === 0 ? [0.82, 0.56, 0.43] : material.fragment;
      fragment.pitch = rng.float(-1.3, 1.3);
      fragment.spin = rng.float(-14, 14);
      fragment.shape = rng.float(0, 1);
      if (still) {
        const distance = rng.float(5, 22);
        move(fragment, Math.cos(angle) * distance, Math.sin(angle) * distance);
        fragment.height = 0;
        fragment.settled = true;
      }
      append(fragments, fragment, GORE_LIMITS.fragments);
    }
  }

  function launch(x, y, angle, speed, lift, material) {
    return {
      x, y, angle, height: 4, lift, material, age: 0,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      seed: rng.float(0, 12), life: rng.float(0.47, 0.84),
    };
  }

  function addStain(chip, opacity) {
    const { x, y, size, material, angle } = chip;
    const open = grid.distanceMove(x, y);
    if (open < 2.5) return;
    append(stains, {
      x, y, angle, size: Math.min(size * 1.65, open), seed: rng.float(0, 12),
      color: material.stain, opacity, age: 0,
    }, GORE_LIMITS.stains);
  }

  function move(particle, dx, dy) {
    const x = particle.x + dx;
    const y = particle.y + dy;
    if (grid.distanceMove(x, y) >= 2) {
      particle.x = x;
      particle.y = y;
    } else {
      particle.vx *= -0.25;
      particle.vy *= -0.25;
    }
  }

  function flight(particle, dt) {
    move(particle, particle.vx * dt, particle.vy * dt);
    particle.height += particle.lift * dt;
    particle.lift -= 225 * dt;
    particle.age += dt;
  }

  function step(dt) {
    for (const stain of stains) stain.age += dt;
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      if (drop.material.spectral) {
        move(drop, drop.vx * dt, drop.vy * dt);
        drop.height += 32 * dt;
        drop.age += dt;
        if (drop.age >= drop.life) drops.splice(i, 1);
        continue;
      }
      flight(drop, dt);
      if (drop.height <= 0) {
        if (drop.leavesStain) addStain(drop, 0.88);
        drops.splice(i, 1);
      }
    }
    for (const fragment of fragments) {
      if (fragment.settled) continue;
      flight(fragment, dt);
      fragment.angle += fragment.spin * dt;
      fragment.pitch += fragment.spin * 0.57 * dt;
      if (fragment.height > 0) continue;
      fragment.height = 0;
      if (!fragment.bounced) {
        addStain(fragment, 0.9);
        fragment.lift = 27;
        fragment.vx *= 0.45;
        fragment.vy *= 0.45;
        fragment.spin *= 0.45;
        fragment.bounced = true;
      } else {
        fragment.settled = true;
      }
    }
  }

  return { add, step, stains, drops, fragments };
}

function append(array, value, limit) {
  if (array.length >= limit) array.shift();
  array.push(value);
}
