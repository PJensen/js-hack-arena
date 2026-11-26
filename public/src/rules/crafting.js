import { getRecipe } from './data/craftingRecipes.js';

// Pure state transition. Host supplies authoritative time and atomic storage.
export function reconcileCrafting(character, now) {
  const jobs = character.craftingJobs ?? [];
  if (!jobs.some(job => job.completedAt == null && job.completesAt <= now)) return character;
  const materials = { ...character.materials };
  const craftingJobs = jobs.map(job => {
    if (job.completedAt != null || job.completesAt > now) return job;
    for (const [id, count] of Object.entries(job.outputs)) {
      const balance = (materials[id] ?? 0) + count;
      if (!Number.isSafeInteger(balance)) throw new Error('Crafted material balance overflow');
      materials[id] = balance;
    }
    return { ...job, completedAt: job.completesAt };
  });
  return { ...character, materials, craftingJobs };
}

export function enqueueCraft(character, { recipeId, requestId }, now) {
  const recipe = getRecipe(recipeId);
  if (!recipe) return { error: 'Unknown recipe' };
  const current = reconcileCrafting(character, now);
  const jobs = current.craftingJobs ?? [];
  if (jobs.some(job => job.completedAt == null)) return { error: 'A crafting job is already active' };
  if (current.gold < recipe.goldCost) return { error: 'Not enough gold' };
  const materials = { ...current.materials };
  for (const [id, count] of Object.entries(recipe.inputs)) {
    if ((materials[id] ?? 0) < count) return { error: 'Not enough materials' };
  }
  for (const [id, count] of Object.entries(recipe.inputs)) materials[id] -= count;

  // Work and output are frozen at admission. Future rate changes can reconcile
  // elapsed work before changing the remaining duration without changing inputs.
  const job = {
    id: requestId, recipeId, profession: recipe.profession, quantity: 1,
    requiredWorkMs: recipe.workMs, workRate: 1,
    startsAt: now, completesAt: now + recipe.workMs,
    outputs: { ...recipe.outputs },
  };
  return { character: {
    ...current, gold: current.gold - recipe.goldCost, materials,
    craftingJobs: [...jobs.slice(-31), job],
  } };
}
