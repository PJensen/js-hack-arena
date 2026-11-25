export function spellCastProgress(book, spell) {
  const { charge, castPhase, channelRemaining } = book;
  const cast = spell?.cast;
  const progress = castPhase === 'channeling' ? 1 - channelRemaining / (cast?.channelDuration || 1)
    : charge / ((castPhase === 'casting' ? cast?.castTime : cast?.maxCharge) || 1);
  return Math.max(0, Math.min(1, progress));
}
