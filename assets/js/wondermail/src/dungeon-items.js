import { DUNGEON_ITEMS } from './data/dungeon-items.js';

/**
 * Whether `itemId` can legally be the objective of a "find item" mission in `dungeonId`.
 * @param {number} itemId
 * @param {number} dungeonId
 * @returns {boolean}
 */
export function isItemInDungeon(itemId, dungeonId) {
  if (itemId <= 0 || dungeonId >= DUNGEON_ITEMS.length) return false;
  return DUNGEON_ITEMS[dungeonId].includes(itemId);
}
