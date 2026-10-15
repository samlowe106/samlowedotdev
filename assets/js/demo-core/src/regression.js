/* Ordinary least squares, closed form -- no matrix library needed for one
   predictor. Shared verbatim by every demo that fits a plain (not ridge,
   not polynomial) line through a sample: those variants have real, different
   generative models and stay in their own demo files, but the fit itself
   is the same formula everywhere it appears. */

/** @typedef {import('./stats.js').Point} Point */

/** @typedef {{ slope: number, intercept: number }} LineFit */

/**
 * @param {Point[]} points
 * @returns {LineFit}
 */
export function fitLine(points) {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

/**
 * Coefficient of determination of a fit against the points it was (or
 * wasn't) fit on.
 * @param {Point[]} points
 * @param {LineFit} fit
 * @returns {number}
 */
export function rSquared(points, fit) {
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = fit.slope * p.x + fit.intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

/**
 * Weighted least squares for a single predictor -- minimizes
 * sum(w_i * (y_i - slope*x_i - intercept)^2) in closed form via weighted
 * means, the same derivation as fitLine() with every mean replaced by its
 * weighted version. Reduces exactly to fitLine() when every weight is equal.
 * @param {Point[]} points
 * @param {number[]} weights
 * @returns {LineFit}
 */
export function fitWeightedLine(points, weights) {
  const sumW = weights.reduce((s, w) => s + w, 0);
  const meanX = points.reduce((s, p, i) => s + weights[i] * p.x, 0) / sumW;
  const meanY = points.reduce((s, p, i) => s + weights[i] * p.y, 0) / sumW;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += weights[i] * (p.x - meanX) * (p.y - meanY);
    den += weights[i] * (p.x - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

/**
 * Weighted MSE of a fit against points under the given per-point weights --
 * the objective WLS actually minimizes, as opposed to the plain MSE that
 * OLS minimizes. Comparing two fits by *this* metric (not plain MSE, which
 * structurally favors whichever fit was built to minimize it) is the fair
 * way to judge them when the weights reflect real per-point noise.
 * @param {Point[]} points
 * @param {LineFit} fit
 * @param {number[]} weights
 * @returns {number}
 */
export function weightedMSE(points, fit, weights) {
  let sumW = 0;
  let sumWSqErr = 0;
  points.forEach((p, i) => {
    const predicted = fit.slope * p.x + fit.intercept;
    sumWSqErr += weights[i] * (p.y - predicted) ** 2;
    sumW += weights[i];
  });
  return sumWSqErr / sumW;
}
