// rules/inventory.js
// Inventory facade — helpers for adding/removing/querying items.
// Items are child entities of the owner via ecs-js hierarchy.

import { attach, detach, children, childrenWith, childCount } from '../lib/ecs-js/index.js';
import { ItemInfo } from './components/index.js';
import { Inventory } from './components/Inventory.js';

/**
 * Add an item entity to an owner's inventory.
 * Returns true if added, false if at capacity.
 */
export function addToInventory(world, ownerId, itemId) {
  const inv = world.get(ownerId, Inventory);
  if (!inv) return false;
  if (childCount(world, ownerId) >= inv.capacity) return false;
  attach(world, itemId, ownerId);
  return true;
}

/**
 * Remove an item from its owner's inventory.
 * Does NOT destroy the entity — caller decides (drop on ground, destroy, etc).
 */
export function removeFromInventory(world, itemId) {
  detach(world, itemId);
}

/**
 * Iterate all item entities in an owner's inventory.
 * @returns {Iterable<number>} entity IDs
 */
export function inventoryItems(world, ownerId) {
  return children(world, ownerId);
}

/**
 * Iterate inventory items that have specific components.
 * e.g., inventoryItemsWith(world, ownerId, PointLight) → items with lights
 */
export function inventoryItemsWith(world, ownerId, ...comps) {
  return childrenWith(world, ownerId, ...comps);
}

/**
 * Check if inventory has room.
 */
export function hasCapacity(world, ownerId) {
  const inv = world.get(ownerId, Inventory);
  if (!inv) return false;
  return childCount(world, ownerId) < inv.capacity;
}

/**
 * Count items in inventory.
 */
export function itemCount(world, ownerId) {
  return childCount(world, ownerId);
}
