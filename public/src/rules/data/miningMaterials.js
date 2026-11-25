const materials = {
  copper_ore: { name: 'Copper Ore', shape: 'rock', color: [0.77, 0.30, 0.16], rarity: 'common' },
  tin_ore: { name: 'Tin Ore', shape: 'rock', color: [0.52, 0.63, 0.73], rarity: 'common' },
  gold_ore: { name: 'Gold Ore', shape: 'rock', color: [0.89, 0.64, 0.16], rarity: 'uncommon' },
  amethyst: { name: 'Amethyst', shape: 'gem', color: [0.72, 0.32, 0.95], rarity: 'rare' },
  emerald: { name: 'Emerald', shape: 'gem', color: [0.15, 0.87, 0.47], rarity: 'rare' },
  ruby: { name: 'Ruby', shape: 'gem', color: [0.98, 0.23, 0.38], rarity: 'rare' },
  sapphire: { name: 'Sapphire', shape: 'gem', color: [0.28, 0.63, 1.0], rarity: 'rare' },
};

export const miningMaterialIds = Object.keys(materials);
export const gemstoneIds = miningMaterialIds.filter((id) => materials[id].shape === 'gem');

export function oreMaterialId(kind) {
  return `${kind}_ore`;
}

export function getMiningMaterial(id) {
  return Object.hasOwn(materials, id) ? materials[id] : null;
}
