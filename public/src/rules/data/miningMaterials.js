import { rollTable } from './weightedTable.js';

function gemstone(name, miningWeight, color, polish, reflection) {
  return { name, shape: 'gem', color, rarity: 'rare', polish, reflection, miningWeight };
}

const materials = {
  copper_ore: { name: 'Copper Ore', shape: 'rock', color: [0.77, 0.30, 0.16], rarity: 'common' },
  tin_ore: { name: 'Tin Ore', shape: 'rock', color: [0.52, 0.63, 0.73], rarity: 'common' },
  gold_ore: { name: 'Gold Ore', shape: 'rock', color: [0.89, 0.64, 0.16], rarity: 'uncommon' },
  amethyst: gemstone('Amethyst', 9, [0.72, 0.32, 0.95], 0.65, [0.90, 0.75, 1.0]),
  citrine: gemstone('Citrine', 18, [1.0, 0.83, 0.22], 0.65, [1.0, 0.95, 0.68]),
  obsidian: gemstone('Obsidian', 14, [0.13, 0.14, 0.22], 0.91, [0.65, 0.73, 0.88]),
  black_opal: gemstone('Black Opal', 3, [0.24, 0.16, 0.38], 0.60, [0.27, 1.0, 0.67]),
  aquamarine: gemstone('Aquamarine', 10, [0.26, 0.91, 0.98], 0.74, [0.76, 1.0, 0.97]),
  garnet: gemstone('Garnet', 10, [0.62, 0.10, 0.25], 0.73, [1.0, 0.53, 0.61]),
  jade: gemstone('Jade', 12, [0.36, 0.67, 0.50], 0.27, [0.73, 0.87, 0.70]),
  topaz: gemstone('Topaz', 7, [1.0, 0.46, 0.13], 0.78, [1.0, 0.83, 0.54]),
  emerald: gemstone('Emerald', 6, [0.15, 0.87, 0.40], 0.80, [0.74, 1.0, 0.72]),
  sapphire: gemstone('Sapphire', 5, [0.20, 0.43, 1.0], 0.87, [0.65, 0.82, 1.0]),
  ruby: gemstone('Ruby', 4, [0.98, 0.19, 0.30], 0.86, [1.0, 0.74, 0.82]),
  diamond: gemstone('Diamond', 2, [0.76, 0.87, 0.98], 1.0, [1.0, 1.0, 1.0]),
};

export const miningMaterialIds = Object.keys(materials);
const gemstoneTable = Object.entries(materials).flatMap(([id, { miningWeight }]) =>
  miningWeight > 0 ? [{ id, weight: miningWeight }] : []);
const gemstoneTotalWeight = gemstoneTable.reduce((total, { weight }) => total + weight, 0);

export function rollMiningGemstone(random) {
  return rollTable(gemstoneTable, gemstoneTotalWeight, random).id;
}

export function oreMaterialId(kind) {
  return `${kind}_ore`;
}

export function getMiningMaterial(id) {
  return Object.hasOwn(materials, id) ? materials[id] : null;
}
