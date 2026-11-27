import manifest from '../../../assets/conditions/manifest.js';
import { ConditionId } from '../../rules/data/conditionCatalog.js';

export const conditionSheetUrl = new URL('../../../assets/conditions/sheet.webp', import.meta.url).href;
export const conditionCellSize = manifest.size;
const columns = Math.max(...manifest.entries.map(({ x }) => x)) + 1;
const rows = Math.max(...manifest.entries.map(({ y }) => y)) + 1;
const frames = new Map(manifest.entries.map((entry) => [entry.id, entry]));
const aliases = new Map([
  [ConditionId.IMMOBILIZED, 'rooted'],
  [ConditionId.ICE_ARMOR, 'shield_guard'],
  [ConditionId.REGENERATION, 'regen'],
  [ConditionId.HEALTH_POTION, 'renewal'],
  [ConditionId.SHADOWBURN, 'cursed'],
]);

export function getConditionFrame(id) {
  return frames.get(aliases.get(id) ?? id) ?? frames.get('unknown');
}

export function createConditionIcon(id) {
  const { x, y } = getConditionFrame(id);
  const icon = document.createElement('span');
  icon.className = 'arena-condition-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.backgroundImage = `url("${conditionSheetUrl}")`;
  icon.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  icon.style.backgroundPosition = `${x / (columns - 1) * 100}% ${y / (rows - 1) * 100}%`;
  return icon;
}
