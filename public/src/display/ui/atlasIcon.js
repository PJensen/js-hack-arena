import { atlas, icons } from '../../../assets/icons/manifest.js';

const imageUrl = new URL(`../../../assets/icons/${atlas.image}`, import.meta.url).href;

export function createAtlasIcon(id, label) {
  if (!Object.hasOwn(icons, id)) return null;
  const { column, row } = icons[id];
  const icon = document.createElement('span');
  icon.className = 'arena-atlas-icon';
  if (label) {
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', label);
  } else {
    icon.setAttribute('aria-hidden', 'true');
  }
  icon.style.backgroundImage = `url("${imageUrl}")`;
  icon.style.backgroundSize = `${atlas.columns * 100}% ${atlas.rows * 100}%`;
  icon.style.backgroundPosition = `${column / (atlas.columns - 1) * 100}% ${row / (atlas.rows - 1) * 100}%`;
  return icon;
}
