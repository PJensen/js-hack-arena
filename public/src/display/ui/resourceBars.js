// Small DOM resource bars for the canonical arena HUD.

export function createResourceBar(root, { key = 'resource', label, color, gradient, boostedClass = '' } = {}) {
  if (!root) throw new Error('createResourceBar(root): root is required');
  root.classList.add('hud-resource');
  root.dataset.resource = key;
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-label', label || 'Resource');

  const fill = document.createElement('div');
  fill.className = 'hud-resource-fill';
  fill.style.background = gradient || color;
  fill.style.boxShadow = `0 0 10px ${color}99, inset 0 1px 0 rgba(255,255,255,.45)`;
  const recent = document.createElement('div');
  recent.className = 'hud-resource-recent';
  const value = document.createElement('span');
  value.className = 'hud-resource-value';
  value.textContent = `${label || ''} —/—`;
  root.replaceChildren(fill, recent, value);
  let previousRatio = 0;
  let previousAmount = null;
  let animationId = 0;
  let drainTimer = 0;

  function set(current, maximum, options = {}) {
    const max = Math.max(1, Number(maximum) || 1);
    const amount = Math.max(0, Math.min(max, Number(current) || 0));
    const ratio = amount / max;
    const width = `${(ratio * 100).toFixed(2)}%`;
    value.textContent = `${label || ''} ${Math.ceil(amount)}/${Math.ceil(max)}`;
    fill.style.width = width;
    root.dataset.state = ratio <= 0 ? 'empty' : ratio <= 0.2 ? 'critical' : ratio >= 1 ? 'full' : 'partial';
    root.classList.toggle(boostedClass, Boolean(options.boosted));
    if (ratio < previousRatio && previousAmount != null) {
      cancelAnimationFrame(animationId);
      clearTimeout(drainTimer);
      recent.style.transition = 'none';
      recent.style.left = width;
      recent.style.width = `${((previousRatio - ratio) * 100).toFixed(2)}%`;
      recent.style.opacity = '1';
      root.classList.add('resource-draining');
      animationId = requestAnimationFrame(() => {
        recent.style.transition = 'width 560ms cubic-bezier(.22,1,.36,1), opacity 160ms ease-out 560ms';
        recent.style.width = '0%';
        recent.style.opacity = '0';
        animationId = 0;
      });
      drainTimer = setTimeout(() => {
        root.classList.remove('resource-draining');
        drainTimer = 0;
      }, 720);
    } else if (ratio > previousRatio) {
      cancelAnimationFrame(animationId);
      clearTimeout(drainTimer);
      recent.style.opacity = '0';
      recent.style.width = '0%';
      root.classList.remove('resource-draining');
      drainTimer = 0;
    }
    previousRatio = ratio;
    previousAmount = amount;
    root.setAttribute('aria-valuenow', String(Math.ceil(amount)));
    root.setAttribute('aria-valuemax', String(Math.ceil(max)));
    root.setAttribute('aria-valuetext', `${Math.ceil(amount)} of ${Math.ceil(max)}`);
  }
  return Object.freeze({ set });
}
