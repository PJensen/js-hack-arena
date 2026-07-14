// Translate a browser InputRouter sample into a canonical simulation command.
// This module owns no gameplay and is never imported by the server.
export function samplePlayerCommand(sample = {}, seq = null) {
  return {
    seq,
    moveX: sample.intent?.moveX,
    moveY: sample.intent?.moveY,
    aimX: sample.intent?.aimX,
    aimY: sample.intent?.aimY,
    fire: sample.intent?.fire,
    spellSlot: sample.spellSlot,
  };
}
