/* High-level mission builder: turns a set of choices (mission type, dungeon,
 * floor, client, target/item, reward) into an encoded Wonder Mail password
 * plus a human-readable preview, and back again.
 */

import { encodePassword, decodePassword, formatPasswordForDisplay } from './codec.js';
import { setFlavor, describeFlavor } from './flavor.js';
import { getDifficulty, isAboveGround } from './difficulty.js';
import { isItemInDungeon } from './dungeon-items.js';
import { POKEMON } from './data/pokemon.js';
import { ITEMS, DUNGEONS } from './data/items.js';
import { FRIEND_AREAS } from './data/friend-areas.js';

export const MISSION_TYPES = [
  { id: 0, name: 'Help me', needsTarget: false, needsItem: false },
  { id: 1, name: 'Find someone', needsTarget: true, needsItem: false },
  { id: 2, name: 'Escort', needsTarget: true, needsItem: false },
  { id: 3, name: 'Find item', needsTarget: false, needsItem: true },
  { id: 4, name: 'Deliver item', needsTarget: false, needsItem: true }
];

/** Reward kinds, mirroring pass[17] values the reference tool actually produces. */
export const REWARD_KINDS = {
  MONEY_ONLY: 'money-only',
  MONEY_PLUS_ITEM: 'money-plus-item',
  ITEM_PLUS_MYSTERY: 'item-plus-mystery',
  FRIEND_AREA: 'friend-area'
};

export class WonderMailError extends Error {}

/** @typedef {import('./codec.js').PassArray} PassArray */

/**
 * @typedef {object} Mission
 * @property {string} password
 * @property {[string, string]} passwordDisplay
 * @property {{ id: number, name: string, needsTarget: boolean, needsItem: boolean }} missionType
 * @property {{ id: number, name: string }} client
 * @property {{ id: number, name: string }} target
 * @property {{ id: number, name: string }} item
 * @property {{ id: number, name: string }} dungeon
 * @property {number} floor
 * @property {string} floorLabel
 * @property {number} difficulty
 * @property {string} difficultyStars
 * @property {string} reward
 * @property {string} objective
 * @property {string} mailTitle
 * @property {string[]} mailBody
 * @property {PassArray} passArray
 */

/**
 * @param {object} input
 * @param {number} input.missionType - index into MISSION_TYPES
 * @param {number} input.dungeon - dungeon id
 * @param {number} input.floor - floor number (1-based)
 * @param {number} input.client - client Pokémon id
 * @param {number} [input.target] - target/escort Pokémon id (find someone / escort)
 * @param {number} [input.item] - item id to find/deliver (find item / deliver item)
 * @param {{kind: string, item?: number, friendArea?: number}} [input.reward] - defaults to money-only
 * @param {number} [input.variant] - 0-255, picks which valid flavor-text line is used; same inputs + same variant always produce the same password
 * @returns {Mission}
 */
export function buildMission(input) {
  const missionType = MISSION_TYPES[input.missionType];
  if (!missionType) throw new WonderMailError('Unknown mission type.');
  if (!input.client) throw new WonderMailError('Choose a client Pokémon.');
  if (missionType.needsTarget && !input.target) {
    throw new WonderMailError('Choose a target Pokémon.');
  }
  if (missionType.needsItem && !input.item) {
    throw new WonderMailError('Choose an item to find or deliver.');
  }
  if (missionType.id === 3 && input.item && !isItemInDungeon(input.item, input.dungeon)) {
    throw new WonderMailError(`${ITEMS[input.item]} can't be found in ${DUNGEONS[input.dungeon]}.`);
  }

  const pass = new Array(20).fill(0);
  pass[0] = 5;
  pass[1] = missionType.id;
  pass[4] = input.dungeon;
  pass[5] = input.floor;
  pass[12] = input.client & 0xff;
  pass[13] = (input.client >> 8) & 0xff;
  const targetId = (missionType.needsTarget ? input.target : input.client) ?? input.client;
  pass[14] = targetId & 0xff;
  pass[15] = (targetId >> 8) & 0xff;
  pass[16] = missionType.needsItem ? input.item : 9;

  const reward = input.reward || { kind: REWARD_KINDS.MONEY_ONLY };
  const difficulty = getDifficulty(pass[1], pass[4], pass[5]);
  if (reward.kind === REWARD_KINDS.FRIEND_AREA) {
    if (difficulty === 0) {
      throw new WonderMailError('This mission needs at least D difficulty to give a Friend Area reward.');
    }
    pass[17] = 9;
    pass[18] = 9;
    pass[19] = reward.friendArea;
  } else if (reward.kind === REWARD_KINDS.MONEY_PLUS_ITEM) {
    pass[17] = 6;
    pass[18] = reward.item;
  } else if (reward.kind === REWARD_KINDS.ITEM_PLUS_MYSTERY) {
    pass[17] = 8;
    pass[18] = reward.item;
  } else {
    pass[17] = 5;
    pass[18] = 9;
  }

  setFlavor(pass, { variant: input.variant ?? 0 });

  return describeMission(pass);
}

/** Decodes a Wonder Mail password string into the same preview shape buildMission returns. */
/** @param {string} password @returns {Mission} */
export function readMission(password) {
  const pass = decodePassword(password);
  if (!pass || pass[0] !== 5 || pass[1] > 4) {
    throw new WonderMailError('That password is invalid.');
  }
  return describeMission(pass);
}

/** @param {PassArray} pass @param {number} difficulty @returns {string} */
function rewardDescription(pass, difficulty) {
  const baseMoney = (difficulty + 1) * 100;
  switch (pass[17]) {
    case 5:
      return `${baseMoney * 2} Poké`;
    case 6:
      return `${baseMoney * 2} Poké + ? [${ITEMS[pass[18]]}]`;
    case 8:
      return `${ITEMS[pass[18]]} + ?`;
    case 9:
      return `Friend Area [${FRIEND_AREAS[pass[19]]}]`;
    default:
      return `${baseMoney} Poké`;
  }
}

/**
 * @param {PassArray} pass
 * @param {number} objectiveCode
 * @param {string} clientName
 * @param {string} targetName
 * @param {string} itemName
 * @returns {string}
 */
function objectiveDescription(pass, objectiveCode, clientName, targetName, itemName) {
  switch (objectiveCode) {
    case 0:
      return 'Friend Rescue';
    case 1:
      return `Find ${itemName}.`;
    case 2:
      return `Deliver ${itemName}.`;
    case 3:
      return 'Help me.';
    case 4:
      return `Find ${targetName}.`;
    case 5:
      return `Escort to ${targetName}.`;
    case 6:
      return 'Special mission';
    default:
      return '';
  }
}

/** @param {PassArray} pass @returns {Mission} */
function describeMission(pass) {
  const password = encodePassword(pass);
  const flavor = describeFlavor(pass);
  const difficulty = getDifficulty(pass[1], pass[4], pass[5]);
  const clientId = pass[12] | (pass[13] << 8);
  const targetId = pass[14] | (pass[15] << 8);
  const clientName = POKEMON[clientId];
  const targetName = POKEMON[targetId];
  const itemName = ITEMS[pass[16]];
  const floorLabel = isAboveGround(pass[4]) ? `${pass[5]}F` : `B${pass[5]}F`;

  return {
    password,
    passwordDisplay: formatPasswordForDisplay(password),
    missionType: MISSION_TYPES[pass[1]],
    client: { id: clientId, name: clientName },
    target: { id: targetId, name: targetName },
    item: { id: pass[16], name: itemName },
    dungeon: { id: pass[4], name: DUNGEONS[pass[4]] },
    floor: pass[5],
    floorLabel,
    difficulty,
    difficultyStars: '★'.repeat(difficulty) + '☆'.repeat(6 - difficulty),
    reward: rewardDescription(pass, difficulty),
    objective: objectiveDescription(pass, flavor.objectiveCode, clientName, targetName, itemName),
    mailTitle: flavor.title,
    mailBody: flavor.body,
    passArray: pass
  };
}
