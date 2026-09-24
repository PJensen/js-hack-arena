// Arena adapter for the JS-Hack audio engine.
//
// The simulation owns the facts; this client-only layer turns replicated
// presentation events into local Web Audio playback. It must never run in the
// Worker or influence gameplay state.

import { play, preload, startLoopSequence, stopLoopSequence, unlock } from './audioEngine.js';

const AUDIO_ROOT = './assets/audio/';
const SOUND = Object.freeze({
  frostCast: `${AUDIO_ROOT}spell_frost.mp3`,
  frostImpact: `${AUDIO_ROOT}impact_ice.mp3`,
  lightningCast: `${AUDIO_ROOT}weather_lightning_strike.mp3`,
  buffCast: `${AUDIO_ROOT}spell_buff.mp3`,
  poisonCast: `${AUDIO_ROOT}spell_acid_spit.mp3`,
  poisonImpact: `${AUDIO_ROOT}status_slimed.mp3`,
  shadowImpact: `${AUDIO_ROOT}spell_agony.mp3`,
  meleeHit: `${AUDIO_ROOT}melee_hit.mp3`,
  rangedShot: `${AUDIO_ROOT}ranged_shot.mp3`,
  pickupGeneric: `${AUDIO_ROOT}pickup_generic.mp3`,
  pickupWeapon: `${AUDIO_ROOT}pickup_weapon.mp3`,
  pickupPotion: `${AUDIO_ROOT}pickup_potion.mp3`,
  spellLearned: `${AUDIO_ROOT}magic_unlock.mp3`,
  healing: `${AUDIO_ROOT}healing_magic_1.mp3`,
  chestOpen: `${AUDIO_ROOT}chest_open.mp3`,
  death: `${AUDIO_ROOT}death.mp3`,
  playerDeath: `${AUDIO_ROOT}player_death.mp3`,
});

const PRELOAD = Object.freeze(Object.values(SOUND));
const DUNGEON_AMBIENCE = Object.freeze([
  `${AUDIO_ROOT}ambient_dungeon_1.mp3`,
  `${AUDIO_ROOT}ambient_dungeon_2.mp3`,
]);
const AMBIENCE_KEY = 'arena:dungeon';
const MAX_HEAR_DISTANCE = 760;
const FULL_VOLUME_DISTANCE = 42;

export function unlockArenaAudio() {
  return unlock();
}

/**
 * Install audio listeners on a browser simulation world.
 *
 * Events are delivered both by local authority simulation and by
 * applySnapshot() on network replicas, which gives offline and multiplayer
 * play the same audio path.
 */
export function createArenaAudio({ world, getPlayerPosition }) {
  if (!world || typeof world.on !== 'function') return { dispose() {} };

  // Audio is intentionally warmed after the entry gesture. A failed preload
  // is harmless; play() will retry through its normal lazy-load path.
  preload(PRELOAD).catch(() => {});
  preload(DUNGEON_AMBIENCE).then(() => {
    startLoopSequence(AMBIENCE_KEY, DUNGEON_AMBIENCE, {
      bus: 'ambient', volume: 0.2, fadeIn: 0.8, crossfade: 1.2,
    });
  }).catch(() => {});

  const disposers = [];
  listen('spell.cast', (event) => {
    const sound = spellCastSound(event?.spellId);
    if (sound) playAt(sound, event, { volume: event.spellId === 'lightning' ? 0.62 : 0.75 });
  });

  listen('projectile.hit', (event) => {
    const sound = projectileImpactSound(event?.style);
    if (sound) playAt(sound, event, { volume: 0.72, maxVoices: 4 });
  });
  listen('projectile.wall', (event) => {
    const sound = projectileImpactSound(event?.style);
    if (sound) playAt(sound, event, { volume: 0.5, maxVoices: 4 });
  });
  listen('melee.hit', (event) => {
    playAt(SOUND.meleeHit, event, { volume: 0.72, maxVoices: 5, randomPitch: 35 });
  });
  listen('spell.cast', (event) => {
    if (event?.spellId === 'arrow') playAt(SOUND.rangedShot, event, { volume: 0.8, maxVoices: 4, randomPitch: 25 });
  });
  listen('entity.died', (event) => {
    const sound = event?.kind === 'player' ? SOUND.playerDeath : SOUND.death;
    playAt(sound, event, { volume: event?.kind === 'player' ? 0.95 : 0.62, maxVoices: 3 });
  });
  listen('damage.dealt', (event) => {
    if (Number(event?.amount) < 0) playAt(SOUND.healing, event, { volume: 0.7, maxVoices: 2 });
  });
  listen('item.pickup', (event) => {
    playAt(pickupSound(event), event, { volume: 0.72, maxVoices: 4, randomPitch: 18 });
  });
  listen('chest.opened', (event) => {
    playAt(SOUND.chestOpen, event, { volume: 0.78, maxVoices: 2, randomPitch: 12 });
  });

  return {
    dispose() {
      for (const dispose of disposers.splice(0)) dispose?.();
      stopLoopSequence(AMBIENCE_KEY, { fadeOut: 0.35 });
    },
  };

  function listen(type, handler) {
    const dispose = world.on(type, handler);
    if (typeof dispose === 'function') disposers.push(dispose);
  }

  function playAt(url, event, options = {}) {
    const source = finitePosition(event?.x, event?.y);
    const listener = getPlayerPosition?.();
    const spatial = spatialize(source, listener);
    if (!spatial) return;
    play(url, {
      bus: 'spells',
      pan: spatial.pan,
      volume: spatial.volume * Number(options.volume ?? 1),
      maxVoices: options.maxVoices ?? 3,
      randomPitch: options.randomPitch ?? 12,
    });
  }

  function pickupSound(event) {
    if (event?.spellId) return SOUND.spellLearned;
    if (event?.healed) return SOUND.healing;
    const item = String(event?.item || '').toLowerCase();
    if (item.includes('potion')) return SOUND.pickupPotion;
    if (event?.slot === 'melee' || event?.slot === 'ranged' || item.includes('sword') || item.includes('bow')) {
      return SOUND.pickupWeapon;
    }
    return SOUND.pickupGeneric;
  }

  function spellCastSound(spellId) {
    return {
      frost_bolt: SOUND.frostCast,
      lightning: SOUND.lightningCast,
      poison_orb: SOUND.poisonCast,
      ice_armor: SOUND.buffCast,
      regeneration: SOUND.healing,
      blizzard: SOUND.frostCast,
      arrow: SOUND.rangedShot,
    }[spellId] || null;
  }

  function projectileImpactSound(style) {
    return {
      frost: SOUND.frostImpact,
      poison: SOUND.poisonImpact,
      shadow: SOUND.shadowImpact,
      arrow: SOUND.meleeHit,
    }[style] || null;
  }
}

function finitePosition(x, y) {
  return Number.isFinite(Number(x)) && Number.isFinite(Number(y))
    ? { x: Number(x), y: Number(y) }
    : null;
}

function spatialize(source, listener) {
  if (!source || !listener) return { pan: 0, volume: 1 };
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.hypot(dx, dy);
  if (distance > MAX_HEAR_DISTANCE) return null;
  const volume = distance <= FULL_VOLUME_DISTANCE
    ? 1
    : Math.max(0.12, 1 - (distance - FULL_VOLUME_DISTANCE) / MAX_HEAR_DISTANCE);
  return {
    pan: Math.max(-1, Math.min(1, dx / 360)),
    volume,
  };
}

export { SOUND as ARENA_SOUND_FILES };
