// DOM item tooltip surface. The renderer supplies semantic item data and an
// anchor point; this module owns the presentation and future UI expansion.

import { createAtlasIcon } from './atlasIcon.js';
import { ItemSlot } from '../../rules/components/ItemInfo.js';
import { conditions } from '../../rules/data/conditionCatalog.js';
import { EffectStat } from '../../rules/data/effectCatalog.js';
import { getModifierMultiplier } from '../../rules/stats.js';

const RARITY_COLORS = Object.freeze({
  common: '#e8f1fa',
  uncommon: '#70ef8d',
  magic: '#72adff',
  rare: '#ffd65a',
  epic: '#d08cff',
  legendary: '#ff9b52',
});

function rarityColor(rarity) {
  return RARITY_COLORS[String(rarity || 'common').toLowerCase()] || RARITY_COLORS.common;
}

export function weaponTooltipName(info) {
  const name = info?.name?.trim();
  if (name && name.toLowerCase() !== 'item') return name;
  if (info?.slot === ItemSlot.MELEE) return 'Sword';
  if (info?.slot === ItemSlot.RANGED) return 'Bow';
  if (info?.slot === ItemSlot.RING) return 'Ring';
  return 'Unknown weapon';
}

export function itemTooltipIconId(info) {
  if (info?.slot === ItemSlot.RING) return 'ring';
  const rarity = info?.rarity?.toLowerCase();
  if (info?.slot === ItemSlot.RANGED) {
    if (rarity === 'epic' || rarity === 'legendary') return `${rarity}_bow`;
    return 'bow';
  }
  if (info?.slot !== ItemSlot.MELEE) return null;
  switch (rarity) {
    case 'legendary': return 'legendary_sword';
    case 'epic': return 'epic_sword';
    case 'rare': return 'sword_tier_2';
    case 'uncommon': return 'sword_tier_1';
    default: return 'sword_tier_0';
  }
}

export function compareDirection(next, current) {
  return next > current ? 'up' : next < current ? 'down' : '';
}

const formatPercent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 });

export function ringTooltipRows(ring, equipped) {
  const rows = [];
  if (ring.haste > 0) {
    rows.push({
      kind: 'equip', label: 'Equip: ', value: `${formatPercent.format(ring.haste)} haste`,
      change: compareDirection(ring.haste, equipped?.haste ?? 0),
    });
  }
  const stat = EffectStat.CONDITION_DURATION_DEALT;
  const conditionIds = new Set(ring.modifiers.filter((modifier) => modifier.stat === stat).map(({ conditionId }) => conditionId));
  for (const conditionId of conditionIds) {
    const multiplier = getModifierMultiplier(ring.modifiers, stat, { conditionId });
    const current = getModifierMultiplier(equipped?.modifiers, stat, { conditionId });
    const subject = conditionId ? `${conditions[conditionId].name} you inflict lasts` : 'Conditions you inflict last';
    rows.push({
      kind: 'equip', label: 'Equip: ',
      value: `${subject} ${formatPercent.format(Math.abs(multiplier - 1))} ${multiplier >= 1 ? 'longer' : 'shorter'}`,
      change: compareDirection(multiplier, current),
    });
  }
  return rows;
}

function makeRow(row) {
  const element = document.createElement('div');
  element.className = 'arena-item-tooltip-row';
  if (row.kind === 'equip') element.classList.add('arena-item-tooltip-effect');

  const label = document.createElement('span');
  label.textContent = row.label;
  element.appendChild(label);

  const value = document.createElement('strong');
  value.textContent = String(row.value);
  element.appendChild(value);

  if (row.change) {
    const change = document.createElement('span');
    change.className = `arena-item-tooltip-change ${row.change}`;
    change.textContent = row.change === 'up' ? '↑' : '↓';
    change.setAttribute('aria-label', row.change === 'up' ? 'upgrade' : 'downgrade');
    element.appendChild(change);
  }
  return element;
}

export function createItemTooltip({ root, onActivate } = {}) {
  const tip = document.createElement('section');
  tip.className = 'arena-item-tooltip';
  tip.setAttribute('aria-label', 'Nearby item');
  tip.hidden = true;

  // Keep the joystick's document handlers from canceling native button taps.
  const keepTooltipTouch = (event) => event.stopPropagation();
  tip.addEventListener('touchstart', keepTooltipTouch, { passive: true });
  tip.addEventListener('touchmove', keepTooltipTouch, { passive: true });

  const header = document.createElement('div');
  header.className = 'arena-item-tooltip-header';
  const icon = document.createElement('span');
  icon.className = 'arena-item-tooltip-icon';
  const title = document.createElement('div');
  title.className = 'arena-item-tooltip-title';
  const name = document.createElement('div');
  const rarity = document.createElement('div');
  rarity.className = 'arena-item-tooltip-rarity';
  title.append(name, rarity);
  header.append(icon, title);

  const rows = document.createElement('div');
  rows.className = 'arena-item-tooltip-rows';
  const action = document.createElement('button');
  action.className = 'arena-item-tooltip-action';
  action.type = 'button';
  action.textContent = 'CLICK / TAP TO EQUIP';
  function activate() {
    if (!tip.hidden && tip._target) onActivate?.(tip._target);
  }
  action.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    activate();
  });
  tip.append(header, rows, action);
  (root || document.body).appendChild(tip);
  let contentKey = '';

  function update(model) {
    if (!model) {
      tip.hidden = true;
      tip._target = null;
      contentKey = '';
      return;
    }

    const titleText = weaponTooltipName(model.info);
    const iconId = itemTooltipIconId(model.info);
    const nextKey = JSON.stringify([titleText, iconId, model.info?.rarity, model.rows, model.actionLabel]);
    if (nextKey !== contentKey) {
      const color = rarityColor(model.info?.rarity);
      name.textContent = titleText;
      name.style.color = color;
      rarity.textContent = String(model.info?.rarity || 'common').toUpperCase();
      rarity.style.color = color;
      const image = createAtlasIcon(iconId);
      icon.replaceChildren(...(image ? [image] : []));
      icon.hidden = !image;
      rows.replaceChildren(...(model.rows || []).map(makeRow));
      action.textContent = model.actionLabel || 'CLICK / TAP TO EQUIP';
      contentKey = nextKey;
    }
    tip._target = model.target || null;

    const mining = model.target?.mine === true;
    tip.toggleAttribute('data-mining', mining);
    const edge = model.anchorX > window.innerWidth * (mining ? 0.5 : 0.62) ? 'left' : 'right';
    tip.dataset.side = edge;
    tip.style.setProperty('--tooltip-anchor-x', `${Math.round(model.anchorX)}px`);
    tip.style.top = `${Math.round(model.anchorY)}px`;
    tip.hidden = false;
  }

  return Object.freeze({ update, hide: () => update(null), activate, element: tip });
}
