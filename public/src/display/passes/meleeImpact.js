import { spells } from '../../rules/data/spellCatalog.js';

const profiles = {
  cleave: { contactTime: 0.084, duration: 0.36, hold: 0.072, chargeHold: 0.042, shake: 5.4, zoom: 0.1, lunge: 9 },
  rend: { contactTime: 0.052, duration: 0.29, hold: 0.05, chargeHold: 0.015, shake: 3.5, zoom: 0.075, lunge: 6 },
};

export function createMeleeImpact({ playerId, reducedMotion = () => false, onContact }) {
  const swings = [];
  let holdRemaining = 0;
  let punch = null;

  function add(event) {
    const profile = profiles[event.spellId];
    if (!profile) return;
    const { range, halfAngle, hits = [] } = event.meleeArc ?? spells[event.spellId].targeting;
    const charge = Math.min(1, Math.max(0, event.charge ?? 0));
    swings.push({
      ...event, ...profile, range, halfAngle, charge,
      hold: profile.hold + profile.chargeHold * charge,
      age: 0, landed: false, rend: event.spellId === 'rend',
      hits,
    });
  }

  function advance(dt) {
    const heldTime = Math.min(holdRemaining, dt);
    holdRemaining -= heldTime;
    let displayDt = dt - heldTime * 0.9;
    if (punch) {
      punch.age += dt;
      if (punch.age >= 0.24) punch = null;
    }

    for (let i = swings.length - 1; i >= 0; i--) {
      const swing = swings[i];
      swing.age += displayDt;
      if (!swing.landed && swing.hits.length && swing.age >= swing.contactTime) {
        swing.landed = true;
        if (swing.playerId === playerId && !reducedMotion()) {
          const strength = 1 + Math.min(0.35, (swing.hits.length - 1) * 0.13) +
            (swing.hits.some((hit) => hit.killed) ? 0.14 : 0);
          swing.age = swing.contactTime;
          holdRemaining = Math.max(holdRemaining, swing.hold * strength);
          punch = { swing, strength, age: 0 };
        }
        onContact(swing);
      }
      if (swing.age >= swing.duration) swings.splice(i, 1);
    }
    if (punch?.age === 0) displayDt = Math.min(displayDt, dt * 0.1);
    return displayDt;
  }

  function cameraResponse() {
    if (!punch) return { x: 0, y: 0, zoom: 1, flash: 0 };
    const { swing, strength, age } = punch;
    const decay = (1 - age / 0.24) ** 2;
    const kick = Math.cos(age * 82) * swing.shake * decay * strength;
    const sidestep = Math.sin(age * 106) * swing.shake * 0.48 * decay * strength;
    return {
      x: Math.cos(swing.angle) * kick - Math.sin(swing.angle) * sidestep,
      y: Math.sin(swing.angle) * kick + Math.cos(swing.angle) * sidestep,
      zoom: 1 + swing.zoom * decay * strength,
      flash: Math.max(0, 1 - age / 0.064) ** 2 * 0.12,
      rend: swing.rend,
      charge: swing.charge,
    };
  }

  function actorPosition(id, position) {
    if (swings.length === 0 || reducedMotion()) return position;
    let x = position.x;
    let y = position.y;
    for (const swing of swings) {
      if (id === swing.playerId) {
        const attack = swing.age / swing.contactTime;
        const lunge = attack < 1
          ? swing.lunge * (attack ** 2 - 0.48 * Math.sin(attack * Math.PI))
          : swing.lunge * Math.max(0, 1 - (swing.age - swing.contactTime) / 0.13) ** 2;
        x += Math.cos(swing.angle) * lunge;
        y += Math.sin(swing.angle) * lunge;
      }
      if (!swing.landed) continue;
      const hit = swing.hits.find((candidate) => candidate.target === id);
      if (!hit) continue;
      const recovery = Math.min(1, (swing.age - swing.contactTime) / 0.16);
      const direction = Math.atan2(hit.y - swing.y, hit.x - swing.x);
      const recoil = (swing.rend ? 6 : 11 + 5 * swing.charge ** 2) * Math.sin(Math.PI * Math.sqrt(recovery));
      x += Math.cos(direction) * recoil;
      y += Math.sin(direction) * recoil;
    }
    return x === position.x && y === position.y ? position : { x, y };
  }

  return { add, advance, cameraResponse, actorPosition, swings };
}
