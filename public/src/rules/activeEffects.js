import { AuraMemberships, Conditions } from './components/index.js';

export function forEachActiveEffect(world, actorId, visit) {
  const conditions = world.get(actorId, Conditions);
  for (const condition of conditions?.active ?? []) {
    if (condition.remaining <= 0) continue;
    const stacks = Math.max(1, condition.stacks || 1);
    for (const effect of condition.effects ?? []) visit(effect, stacks);
  }
  const memberships = world.get(actorId, AuraMemberships);
  for (const membership of memberships?.active ?? []) {
    const stacks = Math.max(1, membership.stacks || 1);
    for (const effect of membership.effects ?? []) visit(effect, stacks);
  }
}
