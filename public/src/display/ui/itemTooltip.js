// DOM item tooltip surface. The renderer supplies semantic item data and an
// anchor point; this module owns the presentation and future UI expansion.

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

function makeRow(row) {
  const element = document.createElement('div');
  element.className = 'arena-item-tooltip-row';

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

  const header = document.createElement('div');
  header.className = 'arena-item-tooltip-header';
  const glyph = document.createElement('span');
  glyph.className = 'arena-item-tooltip-glyph';
  const title = document.createElement('div');
  title.className = 'arena-item-tooltip-title';
  const name = document.createElement('div');
  const rarity = document.createElement('div');
  rarity.className = 'arena-item-tooltip-rarity';
  title.append(name, rarity);
  header.append(glyph, title);

  const rows = document.createElement('div');
  rows.className = 'arena-item-tooltip-rows';
  const action = document.createElement('button');
  action.className = 'arena-item-tooltip-action';
  action.type = 'button';
  action.textContent = 'CLICK / TAP TO EQUIP';
  action.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (tip._target) onActivate?.(tip._target);
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

    const nextKey = JSON.stringify([model.info?.name, model.info?.glyph, model.info?.rarity, model.rows]);
    if (nextKey !== contentKey) {
      const color = rarityColor(model.info?.rarity);
      name.textContent = model.info?.name || 'Unknown item';
      name.style.color = color;
      rarity.textContent = String(model.info?.rarity || 'common').toUpperCase();
      rarity.style.color = color;
      glyph.textContent = model.info?.glyph || '?';
      glyph.style.color = color;
      rows.replaceChildren(...(model.rows || []).map(makeRow));
      action.textContent = model.actionLabel || 'CLICK / TAP TO EQUIP';
      contentKey = nextKey;
    }
    tip._target = model.target || null;

    const edge = model.anchorX > window.innerWidth * 0.62 ? 'left' : 'right';
    tip.dataset.side = edge;
    tip.style.left = `${Math.round(model.anchorX)}px`;
    tip.style.top = `${Math.round(model.anchorY)}px`;
    tip.hidden = false;
  }

  return Object.freeze({ update, hide: () => update(null), element: tip });
}
