// Canonical crafting definitions. Durations are base work at rate 1.
export const recipes = Object.freeze({
  smelt_copper: Object.freeze({
    id: 'smelt_copper',
    profession: 'smelting',
    name: 'Copper Ingot',
    inputs: Object.freeze({ copper_ore: 2 }),
    outputs: Object.freeze({ copper_ingot: 1 }),
    goldCost: 1,
    workMs: 60_000,
  }),
});

export function getRecipe(id) {
  return Object.hasOwn(recipes, id) ? recipes[id] : null;
}
