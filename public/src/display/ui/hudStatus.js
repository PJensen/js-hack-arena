import { createAtlasIcon } from './atlasIcon.js';
import { conditions as conditionCatalog } from '../../rules/data/conditionCatalog.js';
import { getMiningMaterial } from '../../rules/data/miningMaterials.js';

const POWERUP_ICONS = [
  ['manaRegenSeconds', 'mana_surge', 'SURGE'],
  ['hasteSeconds', 'haste_rune', 'HASTE'],
  ['furySeconds', 'fury_rune', 'FURY'],
  ['wardSeconds', 'ward_rune', 'WARD'],
];

export function createHudStatus(root, materialReadout) {
  let shown = '';
  let shownMaterials = '';

  return function sync({ dead, gold, materials, powerups, conditions, casts, connection }) {
    if (materialReadout) {
      const text = Object.entries(materials ?? {}).map(([id, count]) =>
        `${getMiningMaterial(id).name} ×${count}`).join(' · ');
      if (text !== shownMaterials) {
        materialReadout.textContent = text;
        materialReadout.hidden = !text;
        shownMaterials = text;
      }
    }
    if (dead) {
      const message = 'YOU DIED · refresh to re-enter';
      if (shown !== message) root.textContent = message;
      shown = message;
      return;
    }

    const statuses = [];
    for (const [field, iconId, label] of POWERUP_ICONS) {
      const remaining = powerups?.[field];
      if (remaining > 0) statuses.push([iconId, `${label} ${Math.ceil(remaining)}s`]);
    }
    for (const condition of conditions?.active ?? []) {
      const name = condition.name ?? conditionCatalog[condition.id]?.name ?? condition.id;
      statuses.push([condition.id, `${name.toUpperCase()} ${condition.remaining.toFixed(1)}s`]);
    }

    const key = JSON.stringify([gold, statuses, casts, connection]);
    if (shown === key) return;
    shown = key;
    const content = document.createDocumentFragment();
    content.append(createAtlasIcon('coin_pouch', 'Gold'), ` ${gold}`);
    for (const [iconId, label] of statuses) {
      content.append(' · ');
      const icon = createAtlasIcon(iconId);
      if (icon) content.append(icon, ' ');
      content.append(label);
    }
    content.append(` · casts ${casts}`);
    if (connection) content.append(` · ${connection}`);
    root.replaceChildren(content);
  };
}
