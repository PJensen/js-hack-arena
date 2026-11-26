import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { CharacterProgress } from '../worker/characterProgress.js';
import { getRecipe } from '../public/src/rules/data/craftingRecipes.js';

function fixture() {
  const records = new Map();
  const storage = {
    transactionSync: action => action(),
    kv: {
      get: key => structuredClone(records.get(key)),
      put: (key, value) => records.set(key, structuredClone(value)),
    },
  };
  const character = new CharacterProgress(storage);
  character.initialize(5);
  character.creditMaterials('quarry', { copper_ore: 6 });
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
  assertEquals(character.enqueueCraft(other, start + 1).error, 'A crafting job is already active');
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
