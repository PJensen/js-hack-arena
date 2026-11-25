function gemstone(name, color, polish, reflection) {
  return { name, shape: 'gem', color, rarity: 'rare', polish, reflection };
}

const materials = {
  copper_ore: { name: 'Copper Ore', shape: 'rock', color: [0.77, 0.30, 0.16], rarity: 'common' },
  tin_ore: { name: 'Tin Ore', shape: 'rock', color: [0.52, 0.63, 0.73], rarity: 'common' },
  gold_ore: { name: 'Gold Ore', shape: 'rock', color: [0.89, 0.64, 0.16], rarity: 'uncommon' },
  amethyst: gemstone('Amethyst', [0.72, 0.32, 0.95], 0.65, [0.90, 0.75, 1.0]),
  emerald: gemstone('Emerald', [0.15, 0.87, 0.40], 0.80, [0.74, 1.0, 0.72]),
  ruby: gemstone('Ruby', [0.98, 0.19, 0.30], 0.86, [1.0, 0.74, 0.82]),
  sapphire: gemstone('Sapphire', [0.20, 0.43, 1.0], 0.87, [0.65, 0.82, 1.0]),
  aquamarine: gemstone('Aquamarine', [0.26, 0.91, 0.98], 0.74, [0.76, 1.0, 0.97]),
  black_opal: gemstone('Black Opal', [0.24, 0.16, 0.38], 0.60, [0.27, 1.0, 0.67]),
  citrine: gemstone('Citrine', [1.0, 0.83, 0.22], 0.65, [1.0, 0.95, 0.68]),
  diamond: gemstone('Diamond', [0.76, 0.87, 0.98], 1.0, [1.0, 1.0, 1.0]),
  garnet: gemstone('Garnet', [0.62, 0.10, 0.25], 0.73, [1.0, 0.53, 0.61]),
  jade: gemstone('Jade', [0.36, 0.67, 0.50], 0.27, [0.73, 0.87, 0.70]),
  obsidian: gemstone('Obsidian', [0.13, 0.14, 0.22], 0.91, [0.65, 0.73, 0.88]),
  topaz: gemstone('Topaz', [1.0, 0.46, 0.13], 0.78, [1.0, 0.83, 0.54]),
};

export const miningMaterialIds = Object.keys(materials);
export const gemstoneIds = miningMaterialIds.filter((id) => materials[id].shape === 'gem');

export function oreMaterialId(kind) {
  return `${kind}_ore`;
}

export function getMiningMaterial(id) {
  return Object.hasOwn(materials, id) ? materials[id] : null;
}
