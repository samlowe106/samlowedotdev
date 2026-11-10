import { DIFFICULTIES, ABOVE_GROUND } from './data/difficulty.js';
import { FLOORS_PER_DUNGEON } from './data/tables.js';

/* Star rating (0-6) the game assigns a mission, driven by how deep the floor
   is in the dungeon; escort missions (missionType 2) get bumped up two
   notches since escorting an NPC through a whole dungeon is harder. */
/**
 * @param {number} missionType
 * @param {number} dungeonId
 * @param {number} floor
 * @returns {number}
 */
export function getDifficulty(missionType, dungeonId, floor) {
  if (floor <= 0 || dungeonId >= DIFFICULTIES.length) return 0;
  const floorRatings = DIFFICULTIES[dungeonId];
  const index = floor - 1;
  if (index >= floorRatings.length) return 0;
  let rating = floorRatings[index];
  if (missionType === 2) rating += 2;
  rating = Math.min(rating, 15);
  rating = Math.floor(rating / 2);
  return Math.min(rating, 6);
}

/* The in-game letter grade for each of getDifficulty's 0-6 outputs. */
export const DIFFICULTY_LETTERS = ['E', 'D', 'C', 'B', 'A', 'S', '*'];

/** @param {number} difficulty @returns {string} */
export function getDifficultyLetter(difficulty) {
  return DIFFICULTY_LETTERS[difficulty] ?? DIFFICULTY_LETTERS[DIFFICULTY_LETTERS.length - 1];
}

/** @param {number} dungeonId @returns {boolean} */
export function isAboveGround(dungeonId) {
  if (dungeonId >= ABOVE_GROUND.length) return true;
  return Boolean(ABOVE_GROUND[dungeonId]);
}

/** @param {number} dungeonId @returns {number} */
export function floorCount(dungeonId) {
  return FLOORS_PER_DUNGEON[dungeonId] || 0;
}

/* The lowest and highest difficulty a mission can land on across every
   floor of a dungeon, for the given mission type (escort missions run two
   notches harder throughout, so the range shifts with it). Useful for
   showing e.g. "Tiny Woods (E)" or "Fantasy Strait (B-A)" in a dungeon list. */
/**
 * @param {number} missionType
 * @param {number} dungeonId
 * @returns {{ min: number, max: number, minLetter: string, maxLetter: string, label: string }}
 */
export function getDungeonDifficultyRange(missionType, dungeonId) {
  const floors = floorCount(dungeonId);
  let min = Infinity;
  let max = -Infinity;
  for (let floor = 1; floor < floors; floor++) {
    const difficulty = getDifficulty(missionType, dungeonId, floor);
    if (difficulty < min) min = difficulty;
    if (difficulty > max) max = difficulty;
  }
  if (min > max) min = max = 0;
  return {
    min,
    max,
    minLetter: getDifficultyLetter(min),
    maxLetter: getDifficultyLetter(max),
    label: min === max ? getDifficultyLetter(min) : `${getDifficultyLetter(min)}-${getDifficultyLetter(max)}`
  };
}
