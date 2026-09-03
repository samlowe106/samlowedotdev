/* Nice-tick generation: ~count evenly-spaced, human-readable tick values
   (step rounded to 1/2/2.5/5x a power of ten) between lo and hi. Same
   approach as fetch-recession-data.py's own _nice_ticks() on the site this
   ships with, reimplemented in JS since that one renders a static
   build-time SVG and this draws to a live canvas. */

/**
 * @param {number} lo
 * @param {number} hi
 * @param {number} count
 * @returns {number[]}
 */
export function niceTicks(lo, hi, count) {
  if (hi <= lo) return [lo];
  const rawStep = (hi - lo) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  let step = 10 * magnitude;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * magnitude >= rawStep) {
      step = m * magnitude;
      break;
    }
  }
  const ticks = [];
  let v = Math.floor(lo / step) * step;
  while (v <= hi + step * 0.5) {
    ticks.push(Math.round(v * 1e6) / 1e6);
    v += step;
  }
  return ticks;
}
