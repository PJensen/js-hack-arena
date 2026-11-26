import { miningMaterialIds } from '../public/src/rules/data/miningMaterials.js';

import { enqueueCraft, reconcileCrafting } from '../public/src/rules/crafting.js';

const CHARACTER_KEY = 'character';

// The account owns this record. Room checkpoints make cumulative credits
// idempotent without keeping a row for every pickup.
export class CharacterProgress {
  constructor(storage) {
    this.storage = storage;
  }

  readRaw() {
    return this.storage.kv.get(CHARACTER_KEY) ?? null;
  }

  read(now = Date.now()) {
    const character = this.readRaw();
    if (!character || !(character.craftingJobs ?? []).some(job => job.completedAt == null && job.completesAt <= now)) return character;
    return this.storage.transactionSync(() => {
      const current = this.readRaw();
      const updated = reconcileCrafting(current, now);
      if (updated !== current) this.storage.kv.put(CHARACTER_KEY, updated);
      return updated;
    });
  }

  enqueueCraft({ recipeId, requestId, quantity = 1 }, now = Date.now()) {
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: 'Invalid request ID' };
    return this.storage.transactionSync(() => {
      const current = this.readRaw();
      if (!current) return { error: 'Character not initialized' };
      const key = 'craft-request:' + requestId;
      const previous = this.storage.kv.get(key);
      if (previous !== undefined) {
        const matches = typeof previous === 'string'
          ? previous === recipeId && quantity === 1
          : previous.recipeId === recipeId && previous.quantity === quantity;
        if (!matches) return { error: 'Request ID already used for a different craft' };
        const updated = reconcileCrafting(current, now);
        if (updated !== current) this.storage.kv.put(CHARACTER_KEY, updated);
        return { character: updated };
      }
      const result = enqueueCraft(current, { recipeId, requestId, quantity }, now);
      if (result.error) return result;
      this.storage.kv.put(CHARACTER_KEY, result.character);
      this.storage.kv.put(key, { recipeId, quantity });
      return result;
    });
  }

  initialize(legacyGold) {
    return this.storage.transactionSync(() => {
      const existing = this.readRaw();
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
      const character = this.readRaw();
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

  creditMaterials(roomId, earned) {
    const key = `materials-checkpoint:${roomId}`;
    return this.storage.transactionSync(() => {
      const character = this.readRaw();
      if (!character) throw new Error('Character must be initialized before banking materials');
      const credited = this.storage.kv.get(key) ?? {};
      const materials = { ...character.materials };
      let changed = false;
      for (const id of miningMaterialIds) {
        const count = earned[id] ?? 0;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid cumulative material credit');
        const delta = count - (credited[id] ?? 0);
        if (delta <= 0) continue;
        const balance = (materials[id] ?? 0) + delta;
        if (!Number.isSafeInteger(balance)) throw new Error('Material balance exceeds the safe integer limit');
        materials[id] = balance;
        credited[id] = count;
        changed = true;
      }
      if (changed) {
        this.storage.kv.put(CHARACTER_KEY, { ...character, materials });
        this.storage.kv.put(key, credited);
      }
      return materials;
    });
  }
}
