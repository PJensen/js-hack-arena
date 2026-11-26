import { createAtlasIcon } from './atlasIcon.js';
import { createConditionIcon } from './conditionIcon.js';
import { ConditionId, conditions as conditionCatalog } from '../../rules/data/conditionCatalog.js';
import { readGearKey } from '../../rules/gear.js';
import { getMiningMaterial } from '../../rules/data/miningMaterials.js';

const POWERUP_ICONS = [
  ['manaRegenSeconds', 'mana_surge', 'Surge'],
  ['hasteSeconds', 'hastened', 'Haste'],
  ['furySeconds', 'battle_fury', 'Fury'],
  ['wardSeconds', 'harmony_ward', 'Ward'],
];
const BADGE_CAPTIONS = new Map([
  [ConditionId.REGENERATION, 'Regen'],
  [ConditionId.HEALTH_POTION, 'Healing'],
  [ConditionId.IMMOBILIZED, 'Immobile'],
]);

export function createHudReadout(root, conditionRow, materialReadout) {
  let shown = '';
  let shownBadges = '';
  let shownMaterials = '';

  return function sync({ dead, gold, materials, powerups, conditions, casts, connection, camp }) {
    if (materialReadout) {
      const text = Object.entries(materials ?? {}).map(([id, count]) =>
        `${(getMiningMaterial(id) ?? readGearKey(id))?.name ?? 'Unknown loot'} ×${count}`).join(' · ');
      if (text !== shownMaterials) {
        materialReadout.textContent = text ? `Carrying ${text}` : '';
        materialReadout.hidden = !text;
        shownMaterials = text;
      }
    }
    if (dead) {
      const message = camp ? 'YOU DIED' : 'YOU DIED · refresh to re-enter';
      if (shown !== message) root.textContent = message;
      shown = message;
      conditionRow.hidden = true;
      return;
    }

    const badges = [];
    for (const [field, iconId, label] of POWERUP_ICONS) {
      const remaining = powerups?.[field];
      if (remaining > 0) badges.push([iconId, label, `${Math.ceil(remaining)}s`]);
    }
    for (const condition of conditions?.active ?? []) {
      const name = condition.name ?? conditionCatalog[condition.id]?.name ?? condition.id;
      badges.push([condition.id, name, `${condition.remaining.toFixed(1)}s`]);
    }

    const badgeKey = JSON.stringify(badges);
    if (badgeKey !== shownBadges) {
      shownBadges = badgeKey;
      conditionRow.replaceChildren(...badges.map(([id, name, time]) => {
        const badge = document.createElement('span');
        badge.className = 'hud-condition-badge';
        badge.title = name;
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', `${name}, ${time} remaining`);
        const caption = document.createElement('span');
        caption.className = 'hud-condition-name';
        caption.textContent = BADGE_CAPTIONS.get(id) ?? name;
        const timer = document.createElement('span');
        timer.className = 'hud-condition-time';
        timer.textContent = time;
        badge.append(createConditionIcon(id), caption, timer);
        return badge;
      }));
    }
    conditionRow.hidden = badges.length === 0;

    const key = JSON.stringify([gold, casts, connection]);
    if (shown === key) return;
    shown = key;
    const content = document.createDocumentFragment();
    content.append(createAtlasIcon('coin_pouch', 'Gold'), ` ${gold}`);
    content.append(` · casts ${casts}`);
    if (connection) content.append(` · ${connection}`);
    root.replaceChildren(content);
  };
}
