/** Pick a weighted entry using the caller's seeded random stream. */
export function rollTable(table, totalWeight, random) {
  if (typeof random !== 'function') throw new Error('rollTable requires an authoritative RNG');
  let roll = random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}
