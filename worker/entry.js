import { DurableObject } from 'cloudflare:workers';
import { CharacterProgress } from './characterProgress.js';
import { GameRoom as Room } from './index.js';

export { default } from './index.js';

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = new Room(ctx, env);
  }

  fetch(request) { return this.room.fetch(request); }
  alarm() { return this.room.alarm(); }
  legacyGold(userId) { return this.room.legacyGold(userId); }
  readCharacterProgress(userId) { return this.room.readCharacterProgress(userId); }
}

export class Character extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.progress = new CharacterProgress(ctx.storage);
  }

  read() { return this.progress.read(); }
  initialize(legacyGold) { return this.progress.initialize(legacyGold); }
  enqueueCraft(request) { return this.progress.enqueueCraft(request); }
  creditGold(roomId, earned) { return this.progress.creditGold(roomId, earned); }
  creditMaterials(roomId, earned) { return this.progress.creditMaterials(roomId, earned); }
}
