const CHARACTER_KEY = 'character';

// The account owns this record. Room checkpoints make cumulative credits
// idempotent without keeping a row for every pickup.
export class CharacterProgress {
  constructor(storage) {
    this.storage = storage;
  }

  read() {
    return this.storage.kv.get(CHARACTER_KEY) ?? null;
  }

  initialize(legacyGold) {
    return this.storage.transactionSync(() => {
      const existing = this.read();
      if (existing) return existing;
      const character = { gold: Number.isSafeInteger(legacyGold) && legacyGold >= 0 ? legacyGold : 0 };
      this.storage.kv.put(CHARACTER_KEY, character);
      return character;
    });
  }

  creditGold(roomId, earned) {
    if (!Number.isSafeInteger(earned) || earned <= 0) throw new Error('Invalid cumulative gold credit');
    const key = `gold-checkpoint:${roomId}`;
    return this.storage.transactionSync(() => {
      const character = this.read();
      if (!character) throw new Error('Character must be initialized before crediting gold');
      const credited = this.storage.kv.get(key) ?? 0;
      if (earned <= credited) return character.gold;
      const gold = character.gold + (earned - credited);
      if (!Number.isSafeInteger(gold)) throw new Error('Gold balance exceeds the safe integer limit');
      this.storage.kv.put(CHARACTER_KEY, { ...character, gold });
      this.storage.kv.put(key, earned);
      return gold;
    });
  }
}
