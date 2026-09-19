/* Small, dependency-free statistics helpers shared across canvas demos. */

/** A single (x, y) sample. */
/** @typedef {{ x: number, y: number }} Point */

/**
 * One standard-normal sample via the Box-Muller transform.
 * @returns {number}
 */
export function gaussianNoise() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Arithmetic mean of a list of numbers.
 * @param {number[]} xs
 * @returns {number}
 */
export function mean(xs) {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Population standard deviation of a list of numbers.
 * @param {number[]} xs
 * @returns {number}
 */
export function std(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}
