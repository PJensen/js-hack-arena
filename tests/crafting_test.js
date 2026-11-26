import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { CharacterProgress } from '../worker/characterProgress.js';
import { getRecipe } from '../public/src/rules/data/craftingRecipes.js';

function fixture(gold = 5, ore = 6) {
  const records = new Map();
  const storage = {
    transactionSync: action => action(),
    kv: {
      get: key => structuredClone(records.get(key)),
      put: (key, value) => records.set(key, structuredClone(value)),
    },
  };
  const character = new CharacterProgress(storage);
  character.initialize(gold);
  character.creditMaterials('quarry', { copper_ore: ore });
  return { character, storage };
}
const request = { recipeId: 'smelt_copper', requestId: '00000000-0000-4000-8000-000000000001' };
const other = { ...request, requestId: '00000000-0000-4000-8000-000000000002' };
const start = 1000;
const finish = start + getRecipe(request.recipeId).workMs;

Deno.test('copper smelting spends once and completes once after offline time', () => {
  const { character, storage } = fixture();
  const queued = character.enqueueCraft(request, start).character;
  assertEquals(queued.gold, 4);
  assertEquals(queued.materials, { copper_ore: 4 });
  assertEquals(character.enqueueCraft(request, start + 1).character, queued);
  assertEquals(character.read(finish - 1), queued);
  const restarted = new CharacterProgress(storage);
  const completed = restarted.read(finish + 86400000);
  assertEquals(completed.materials, { copper_ore: 4, copper_ingot: 1 });
  assertEquals(completed.craftingJobs[0].completedAt, finish);
  assertEquals(restarted.read(finish + 86400001), completed);
  assertEquals(restarted.enqueueCraft(request, finish + 86400002).character, completed);
});

Deno.test('mining credits preserve crafted materials and do not restore spent ore', () => {
  const { character } = fixture();
  character.enqueueCraft(request, start);
  character.read(finish);
  character.creditMaterials('quarry', { copper_ore: 6 });
  assertEquals(character.read(finish).materials, { copper_ore: 4, copper_ingot: 1 });
  character.creditMaterials('quarry', { copper_ore: 9 });
  assertEquals(character.read(finish).materials, { copper_ore: 7, copper_ingot: 1 });
});

Deno.test('invalid recipe and insufficient funds leave character unchanged', () => {
  const { character } = fixture();
  const before = character.read(start);
  assertEquals(character.enqueueCraft({ ...request, recipeId: 'forged' }, start).error, 'Unknown recipe');
  assertEquals(character.read(start), before);
  const empty = new CharacterProgress({
    transactionSync: action => action(),
    kv: { get: key => key === 'character' ? { gold: 0, materials: { copper_ore: 6 } } : undefined,
      put: () => { throw new Error('Unexpected write'); } },
  });
  assertEquals(empty.enqueueCraft(request, start).error, 'Not enough gold');
});

Deno.test('batch reserves all inputs and completes each ingot independently without a timer', () => {
  const { character, storage } = fixture();
  const batch = { ...request, quantity: 3 };
  const queued = character.enqueueCraft(batch, start).character;
  const duration = finish - start;
  assertEquals(queued.gold, 2);
  assertEquals(queued.materials, { copper_ore: 0 });
  assertEquals(queued.craftingJobs.map(job => [job.startsAt, job.completesAt]), [
    [start, finish], [finish, finish + duration], [finish + duration, finish + 2 * duration],
  ]);
  assertEquals(character.enqueueCraft(batch, start + 1).character, queued);
  assertEquals(character.enqueueCraft({ ...batch, quantity: 2 }, start + 1).error,
    'Request ID already used for a different craft');
  const restarted = new CharacterProgress(storage);
  assertEquals(restarted.read(finish).materials.copper_ingot, 1);
  assertEquals(restarted.read(finish + duration).materials.copper_ingot, 2);
  assertEquals(restarted.read(finish + 2 * duration).materials.copper_ingot, 3);
  assertEquals(restarted.read(finish + 86400000).materials.copper_ingot, 3);
});

Deno.test('queue capacity is six outstanding units per profession and freed by completion', () => {
  const { character } = fixture(20, 40);
  const queued = character.enqueueCraft({ ...request, quantity: 6 }, start).character;
  assertEquals(queued.craftingJobs.length, 6);
  assertEquals(character.enqueueCraft(other, start + 1).error, 'Profession queue is full');
  const next = character.enqueueCraft(other, finish).character;
  assertEquals(next.craftingJobs.filter(job => job.completedAt == null).length, 6);
  assertEquals(next.craftingJobs.at(-1).startsAt, start + 6 * (finish - start));
  assertEquals(next.materials.copper_ingot, 1);
});

Deno.test('insufficient batch inputs and invalid quantities never partially debit', () => {
  const { character } = fixture();
  const before = character.read(start);
  assertEquals(character.enqueueCraft({ ...request, quantity: 4 }, start).error, 'Not enough materials');
  for (const quantity of [0, -1, 1.5, null, '2']) {
    assertEquals(character.enqueueCraft({ ...request, quantity }, start).error, 'Invalid quantity');
  }
  assertEquals(character.read(start), before);
});

Deno.test('a different profession does not block smelting and its outstanding jobs are preserved', () => {
  const { character, storage } = fixture();
  const prior = character.read(start);
  const otherProfession = {
    id: 'alchemy-job', profession: 'alchemy', recipeId: 'test_potion',
    quantity: 1, startsAt: start, completesAt: finish, outputs: { test_potion: 1 },
  };
  storage.kv.put('character', { ...prior, craftingJobs: [otherProfession] });
  const next = character.enqueueCraft(request, start + 1).character;
  assertEquals(next.craftingJobs[0], otherProfession);
  assertEquals(next.craftingJobs[1].startsAt, start + 1);
  assertEquals(character.read(finish).materials.test_potion, 1);
  assertEquals(character.read(finish + 1).materials.copper_ingot, 1);
});

Deno.test('all queued units reconcile on the first read after a long absence', () => {
  const { character, storage } = fixture();
  character.enqueueCraft({ ...request, quantity: 3 }, start);
  const restarted = new CharacterProgress(storage);
  const after = restarted.read(start + 86400000);
  assertEquals(after.materials, { copper_ore: 0, copper_ingot: 3 });
  assertEquals(after.craftingJobs.map(job => job.completedAt), [finish, start + 1200000, start + 1800000]);
  assertEquals(restarted.read(start + 86400001), after);
});
