import { Actor, Health, Position } from '../../rules/components/index.js';
import { TargetingType } from '../../rules/data/spellCatalog.js';
import { getSelectedUnitPosition, isSelectedUnitCandidate } from '../../rules/systems/playerCombatSystem.js';

export function createUnitTargeting({ root, controls, world, grid, playerId, getActorNetworkId, onCast }) {
  const [status, cast, clear] = controls.children;
  const buttons = new Map();
  const visible = new Set();
  const nameplateBounds = [];
  let selected = null;
  let spell = null;

  // These buttons belong to the unit selector, so a tap never claims a joystick.
  for (const element of [root, controls]) {
    element.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  }
  cast.addEventListener('click', onCast);
  clear.addEventListener('click', () => { selected = null; });

  function beginFrame(activeSpell) {
    visible.clear();
    nameplateBounds.length = 0;
    if (selected != null) {
      const health = world.get(selected, Health);
      if (!health || health.dead || health.hp <= 0) selected = null;
    }
    spell = activeSpell?.targeting.type === TargetingType.SELECTED_UNIT && !world.get(playerId, Health)?.dead
      ? activeSpell
      : null;
    controls.hidden = !spell;
    if (!spell) return;

    const target = selected ?? (spell.targeting.defaultSelf ? playerId : null);
    const ready = Boolean(getSelectedUnitPosition(world, grid, world.get(playerId, Position), spell, target));
    const name = target === playerId ? 'Self' : world.get(target, Actor)?.name;
    const message = name
      ? (ready ? name : `${name} unavailable`)
      : 'Tap an enemy to target';
    if (status.textContent !== message) status.textContent = message;
    if (cast.textContent !== `Cast ${spell.name}`) cast.textContent = `Cast ${spell.name}`;
    cast.disabled = !ready;
    clear.hidden = selected == null;
  }

  function showNameplate(id, label, x, y, labelWidth) {
    if (!spell || !isSelectedUnitCandidate(world, spell, id)) return null;
    let button = buttons.get(id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'unit-nameplate';
      button.textContent = label;
      button.addEventListener('click', () => { selected = id; });
      root.append(button);
      buttons.set(id, button);
    }
    visible.add(id);
    // Keep both nameplates tappable when actors share the same screen space.
    const halfWidth = labelWidth / 2 + 9;
    const direction = y > window.innerHeight / 2 ? -1 : 1;
    while (nameplateBounds.some((other) => Math.abs(other.y - y) < 38 && Math.abs(other.x - x) < other.halfWidth + halfWidth)) {
      y += direction * 38;
    }
    nameplateBounds.push({ x, y, halfWidth });
    button.style.transform = `translate(${x}px, ${y}px) translate(-50%, -25%)`;
    button.setAttribute('aria-pressed', String(id === selected));
    return y;
  }

  function endFrame() {
    for (const [id, button] of buttons) {
      if (visible.has(id)) continue;
      button.remove();
      buttons.delete(id);
    }
  }

  return {
    beginFrame, showNameplate, endFrame,
    isActive: () => Boolean(spell),
    getSelected: () => selected,
    getTargetId: () => selected == null ? null : getActorNetworkId(selected),
  };
}
