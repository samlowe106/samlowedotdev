/* Not every entry in the raw data tables is something a Wonder Mail can
 * legally reference: some dungeon/item/Pokémon ids are unused engine slots,
 * placeholders, or alternate formes that collapse to a base species. These
 * helpers mirror the reference tool's exclusion lists so menus only ever
 * offer choices that produce a mission the game accepts.
 */

import { BAD_ITEMS, BAD_DUNGEONS, BAD_POKEMON } from './data/tables.js';

const MAX_DUNGEON_ID = 0x3f;

/** @param {number} dungeonId @returns {boolean} */
export function isBadDungeon(dungeonId) {
  return dungeonId > MAX_DUNGEON_ID || BAD_DUNGEONS.includes(dungeonId);
}

/** @param {number} itemId @returns {boolean} */
export function isBadItem(itemId) {
  if (itemId >= 0xf0) return false;
  return BAD_ITEMS.includes(itemId);
}

/* Alternate formes (Deoxys, Unown, Castform, ...) report the base species'
   id here so isBadPokemon can reject anything that isn't a canonical form. */
/** @param {number} pokemonId @returns {number} */
export function getBaseSpecies(pokemonId) {
  if (pokemonId === 0x179 || pokemonId === 0x17a || pokemonId === 0x17b) return 0x178;
  if ((pokemonId >= 0xca && pokemonId <= 0xe2) || pokemonId === 0x19f || pokemonId === 0x1a0) return 201;
  if (pokemonId === 0x1a1 || pokemonId === 0x1a2 || pokemonId === 0x1a3) return 0x19e;
  if (pokemonId === 0x1a7) return 0x19c;
  return pokemonId;
}

/** @param {number} pokemonId @returns {boolean} */
export function isBadPokemon(pokemonId) {
  if (getBaseSpecies(pokemonId) !== pokemonId) return true;
  return BAD_POKEMON.includes(pokemonId);
}
