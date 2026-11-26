import { getRecipe } from './data/craftingRecipes.js';

// One running unit per profession; capacity is a policy seam for specialization.
export const BASE_PENDING_CAPACITY = 5;

export function pendingCapacity(character, profession) {
  return BASE_PENDING_CAPACITY;
}

export function availableCraftSlots(character, profession) {
  const outstanding = (character.craftingJobs ?? []).filter(job =>
    job.profession === profession && job.completedAt == null).length;
  return Math.max(0, 1 + pendingCapacity(character, profession) - outstanding);
}

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

export function enqueueCraft(character, { recipeId, requestId, quantity = 1 }, now) {
  const recipe = getRecipe(recipeId);
  if (!recipe) return { error: 'Unknown recipe' };
  const current = reconcileCrafting(character, now);
  const jobs = current.craftingJobs ?? [];
  if (!Number.isSafeInteger(quantity) || quantity < 1) return { error: 'Invalid quantity' };
  if (quantity > availableCraftSlots(current, recipe.profession)) return { error: 'Profession queue is full' };
  if (current.gold < recipe.goldCost * quantity) return { error: 'Not enough gold' };
  const materials = { ...current.materials };
  for (const [id, count] of Object.entries(recipe.inputs)) {
    if ((materials[id] ?? 0) < count * quantity) return { error: 'Not enough materials' };
  }
  for (const [id, count] of Object.entries(recipe.inputs)) materials[id] -= count * quantity;

  // Work and output are frozen at admission. Future rate changes can reconcile
  // elapsed work before changing the remaining duration without changing inputs.
  let startsAt = jobs.reduce((tail, job) =>
    job.profession === recipe.profession && job.completedAt == null
      ? Math.max(tail, job.completesAt) : tail, now);
  const scheduled = Array.from({ length: quantity }, (_, index) => {
    const job = {
      id: index === 0 ? requestId : requestId + ':' + index,
      recipeId, profession: recipe.profession, quantity: 1,
      requiredWorkMs: recipe.workMs, workRate: 1,
      startsAt, completesAt: startsAt + recipe.workMs,
      outputs: { ...recipe.outputs },
    };
    startsAt = job.completesAt;
    return job;
  });
  // Never trim outstanding jobs, including other professions.
  const history = jobs.filter(job => job.completedAt != null).slice(-32);
  const outstanding = jobs.filter(job => job.completedAt == null);
  return { character: {
    ...current, gold: current.gold - recipe.goldCost * quantity, materials,
    craftingJobs: [...history, ...outstanding, ...scheduled],
  } };
}
