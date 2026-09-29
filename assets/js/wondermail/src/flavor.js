/* Selects and fills in the in-game mail text (title + body) for a mission.
 *
 * A mission's pass array carries two things that drive this: pass[2] (which
 * "family" of flavor text applies: a matched parent/child pair, a matched
 * friend pair, a matched pair of lovers, or the generic per-mission-type
 * pool) and pass[8] (a 0-255 "variant" that, combined with the dungeon and
 * floor ids, deterministically picks one specific line out of that family's
 * pool via modular arithmetic -- this is the exact mechanism the DS games
 * themselves use, not something invented for this port). Same pass array in,
 * same text out, always: nothing here reads the clock or a random source.
 */

import { POKEMON } from './data/pokemon.js';
import { ITEMS } from './data/items.js';
import * as FT from './data/flavor-text.js';

/** @typedef {import('./codec.js').PassArray} PassArray */
/** [titleTableId, bodyTableId, objectiveCode], see classifyFlavor. */
/** @typedef {[number, number, number]} FlavorClassification */

/** @param {number} clientId @param {number} targetId @returns {number} */
export function findParentChild(clientId, targetId) {
  return FT.PARENT_CHILD.findIndex((row) => row[0] === clientId && row[1] === targetId);
}

/** @param {number} clientId @param {number} targetId @returns {number} */
export function findPairs(clientId, targetId) {
  return FT.PAIRS.findIndex(
    (row) => (row[0] === clientId && row[1] === targetId) || (row[0] === targetId && row[1] === clientId)
  );
}

/** @param {number} clientId @param {number} targetId @returns {number} */
export function findLovers(clientId, targetId) {
  for (let i = 0; i < FT.LOVERS.length; i += 2) {
    if (
      (FT.LOVERS[i] === clientId && FT.LOVERS[i + 1] === targetId) ||
      (FT.LOVERS[i] === targetId && FT.LOVERS[i + 1] === clientId)
    ) {
      return i;
    }
  }
  return -1;
}

/* Mirrors the reference implementation's `missions` remap: the numeric code
   maildata() uses on the Objective: line isn't the same as the mission type
   index (mission types are ordered help/find/escort/finditem/deliveritem;
   objective codes are ordered finditem/deliveritem/escort/help/find). */
const OBJECTIVE_CODE_BY_MISSION_TYPE = [3, 4, 5, 1, 2];

/* Returns [titleTableId, bodyTableId, objectiveCode] identifying which
   flavor text family applies, mirroring the original FlavorText(pass). */
/** @param {PassArray} pass @returns {FlavorClassification} */
function classifyFlavor(pass) {
  let msgFamily = pass[2];
  if (msgFamily > 0) {
    msgFamily--;
    if (msgFamily <= 8) {
      const clientId = pass[12] | (pass[13] << 8);
      const targetId = pass[14] | (pass[15] << 8);
      switch (msgFamily) {
        case 0:
          return [0, 0, 6]; /* Mankey (fixed special mission, decode-only) */
        case 1:
          return [1, 1, 6]; /* Smeargle (fixed special mission, decode-only) */
        case 2:
          return [2, 2, 6]; /* Medicham (fixed special mission, decode-only) */
        case 3:
          /* A fourth fixed special-mission slot, same shape as Mankey/
             Smeargle/Medicham above -- titleTableId/bodyTableId 3 both
             resolve to '' in flavorTitle/flavorBody (no text tables were
             ever wired up for it). Decode-only like the other three: this
             library's own setFlavor() never assigns pass[2] a value that
             reaches this case, so it only shows up decoding an external
             password that used it. */
          return [3, 3, 6];
        case 4:
          /* "Please bring me the item I need to evolve" */
          return pass[1] === 3 ? [11, 4, 1] : [12, 4, 2];
        case 5:
          /* "bring me my favorite food" (TEXT_5). Decode-only */
          return pass[1] === 3 ? [11, 5, 1] : [12, 5, 2];
        case 6:
          /* Parent/child rescue: client and target are a matched pair in FT.PARENT_CHILD */
          return findParentChild(clientId, targetId) >= 0 ? [4, 6, 4] : [9, 6, 4];
        case 7:
          /* Same matched/unmatched shape as case 6, for FT.PAIRS */
          return findPairs(clientId, targetId) >= 0 ? [5, 7, 4] : [9, 7, 4];
        case 8:
          /* "Escort me to my love!" */
          return findLovers(clientId, targetId) >= 0 ? [6, 8, 5] : [10, 8, 5];
        default:
          break;
      }
    }
  }
  /* fallthrough/common case: client/target don't match a parent/child, FT.PAIRS, or lovers pair */
  return [8 + pass[1], 12 + pass[1], OBJECTIVE_CODE_BY_MISSION_TYPE[pass[1]]];
}

/** @param {PassArray} pass @returns {number} */
function mid(pass) {
  return pass[8] | (pass[9] << 8) | (pass[10] << 16);
}

/** @param {PassArray} pass @param {FlavorClassification} classification @returns {string} */
function flavorTitle(pass, classification) {
  const [titleTableId] = classification;
  const dungeonHash = (mid(pass) + pass[4]) & 0xff;
  const targetName = POKEMON[pass[14] | (pass[15] << 8)];
  switch (titleTableId) {
    case 0:
      return 'Punish bad Mankey!';
    case 1:
      return "Smeargle's desperate plea!";
    case 2:
      return 'Medicham: Help me!';
    case 3:
      return '';
    case 4:
      return FT.TITLE_4;
    case 5: {
      const idx = findPairs(pass[12] | (pass[13] << 8), pass[14] | (pass[15] << 8));
      return idx >= 0 ? FT.PAIRS[idx][2] : '';
    }
    case 6:
      return FT.TITLE_6;
    case 7:
      return FT.TITLE_7.replace(/%s/g, ITEMS[pass[16]]);
    case 11:
      return FT.TITLE_11.replace(/%s/g, ITEMS[pass[16]]);
    case 12:
      return FT.TITLE_12.replace(/%s/g, ITEMS[pass[16]]);
    case 8:
      return FT.TITLE_8[dungeonHash % FT.TITLE_8.length].replace(/%s/g, targetName);
    case 9:
      return FT.TITLE_9[dungeonHash % FT.TITLE_9.length].replace(/%s/g, targetName);
    case 10:
      return FT.TITLE_10[dungeonHash % FT.TITLE_10.length].replace(/%s/g, targetName);
    default:
      return '';
  }
}

/* Returns the body as one string; a "<!--break-->" marker (as the original
   data tables use) stands in for a line break, split out centrally below. */
/** @param {PassArray} pass @param {FlavorClassification} classification @returns {string} */
function flavorBody(pass, classification) {
  const [, bodyTableId] = classification;
  const dungeonHash = (mid(pass) + pass[4]) & 0xff;
  const floorHash = (mid(pass) + pass[5]) & 0xff;
  const targetName = POKEMON[pass[14] | (pass[15] << 8)];
  switch (bodyTableId) {
    case 0:
      return 'Please punish bad Mankey’s gang.';
    case 1:
      return "I didn't want to become a grown-up, so I fled, but now I've lost my way! Help!";
    case 2:
      return 'This is Medicham. Rescue me, please! The reward is a secret〜♪ ';
    case 3:
      return '';
    case 4:
      return FT.TEXT_4.replace(/%s/g, ITEMS[pass[18]]);
    case 5:
      return FT.TEXT_5.replace(/%s/g, ITEMS[pass[18]]);
    case 6: {
      const idx = findParentChild(pass[12] | (pass[13] << 8), pass[14] | (pass[15] << 8));
      return idx >= 0 ? FT.PARENT_CHILD[idx][2] : '';
    }
    case 7: {
      const idx = findPairs(pass[12] | (pass[13] << 8), pass[14] | (pass[15] << 8));
      return idx >= 0 ? FT.PAIRS[idx][3].replace(/%s/g, targetName) : '';
    }
    case 8:
      return (
        FT.TEXT_5A[dungeonHash % FT.TEXT_5A.length].replace(/%s/g, targetName) +
        ' <!--break-->' +
        FT.TEXT_5B[floorHash % FT.TEXT_5B.length]
      );
    case 9:
      return FT.TEXT_9;
    case 10:
      return FT.TEXT_10;
    case 11:
      return FT.TEXT_11;
    case 12:
      return FT.TEXT_1A[dungeonHash % FT.TEXT_1A.length] + ' <!--break-->' + FT.TEXT_1B[floorHash % FT.TEXT_1B.length];
    case 13:
      return (
        FT.TEXT_2A[dungeonHash % FT.TEXT_2A.length].replace(/%s/g, targetName) +
        ' <!--break-->' +
        FT.TEXT_2B[floorHash % FT.TEXT_2B.length]
      );
    case 14:
      return (
        FT.TEXT_3A[dungeonHash % FT.TEXT_3A.length].replace(/%s/g, targetName) +
        ' <!--break-->' +
        FT.TEXT_3B[floorHash % FT.TEXT_3B.length].replace(/%s/g, targetName)
      );
    case 15:
    case 16:
      return (
        FT.TEXT_4A[dungeonHash % FT.TEXT_4A.length].replace(/%s/g, ITEMS[pass[16]]) +
        ' <!--break-->' +
        FT.TEXT_4B[floorHash % FT.TEXT_4B.length]
      );
    default:
      return '';
  }
}

/* Builds the mail title + body (body may be one or two lines) for a mission
   pass array, exactly as it would appear in-game. */
/** @param {PassArray} pass @returns {{ title: string, body: string[], objectiveCode: number }} */
export function describeFlavor(pass) {
  const classification = classifyFlavor(pass);
  const title = flavorTitle(pass, classification);
  const body = flavorBody(pass, classification)
    .split('<!--break-->')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return {
    title,
    body,
    objectiveCode: classification[2]
  };
}

/* Fills in pass[2] (flavor family) and pass[8..10] (variant) for a new
   mission, auto-detecting a parent/child, friend-pair, or lovers match
   between the client and target before falling back to the generic
   per-mission-type text pool. `variant` (0-255) is the only thing that
   changes which specific line gets picked within a family; it defaults to
   0 so the same mission always produces the same mail, but callers can pass
   a different value to see another valid variant. */
/** @param {PassArray} pass @param {{ variant?: number }} [options] @returns {void} */
export function setFlavor(pass, { variant = 0 } = {}) {
  const clientId = pass[12] | (pass[13] << 8);
  const targetId = pass[14] | (pass[15] << 8);
  if (findParentChild(clientId, targetId) >= 0) {
    pass[2] = 7;
  } else if (findPairs(clientId, targetId) >= 0) {
    pass[2] = 8;
  } else if (pass[1] === 2 && findLovers(clientId, targetId) >= 0) {
    pass[2] = 9;
  } else {
    pass[2] = 0;
  }
  pass[8] = variant & 0xff;
  pass[9] = 0;
  pass[10] = 0xff;
}
