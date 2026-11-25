import { statusAtlas, statusIcons } from '../../../assets/status/manifest.js';

const imageUrl = new URL(`../../../assets/status/${statusAtlas.image}`, import.meta.url).href;

export function createStatusIcon(id, label) {
  if (!Object.hasOwn(statusIcons, id)) return null;
  const { column, row } = statusIcons[id];
  const icon = document.createElement('span');
  icon.className = 'arena-atlas-icon arena-status-icon';
  if (label) {
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', label);
  } else {
    icon.setAttribute('aria-hidden', 'true');
  }
  icon.style.backgroundImage = `url("${imageUrl}")`;
  icon.style.backgroundSize = `${statusAtlas.columns * 100}% ${statusAtlas.rows * 100}%`;
  icon.style.backgroundPosition = `${column / (statusAtlas.columns - 1) * 100}% ${row / (statusAtlas.rows - 1) * 100}%`;
  return icon;
}
