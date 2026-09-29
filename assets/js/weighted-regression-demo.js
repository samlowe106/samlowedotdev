// Interactive OLS-vs-WLS demo embedded via
// _includes/linear-regression-2/weighted-regression-demo.html: draws a
// heteroskedastic sample (noise spread grows with x) around a true line,
// fits it with plain OLS, and lets you toggle on the WLS fit that weights
// each point by its known 1/sigma^2. Same canvas-redraws-live approach as
// assets/js/regression-demo.js (see that file's own top comment); colors
// read from CSS custom properties on .weighted-regression-demo via
// getComputedStyle() so this themes correctly across light/dark/OLED with
// no JS changes.
//
// Point opacity is scaled by each point's own weight -- low-noise points
// near x=0 render solid, high-noise points near x=10 fade out -- so the
// "some points deserve less trust than others" idea this whole demo is
// about is visible before you even read a single number.

import { gaussianNoise, fitLine, fitWeightedLine, weightedMSE, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

const X_MIN = 0;
const X_MAX = 10;
const TRUE_SLOPE = 1.1;
const TRUE_INTERCEPT = 2;
const X_MID = (X_MIN + X_MAX) / 2;
// Noise forms a valley -- low in the middle, high at both edges -- rather
// than a monotonic increase or a bell peaking at the middle (both tried and
// measured in scratch first). This puts the noisiest points at the
// high-leverage ends of the x range, same mechanism as the static
// heteroskedasticity figures above (compounding OLS's usual sensitivity to
// those points), which is why this shape produces a more visible WLS-vs-OLS
// gap on a typical single draw than a noisy-middle bell does: noise
// concentrated in the low-leverage center barely moves the slope estimate,
// so downweighting it doesn't correct much.
const SIGMA_MIN = 0.1;
const SIGMA_MAX = 5.0;
const BELL_WIDTH = 1.6;
const N = 45;
// Verified via Monte Carlo in scratch, comparing this shape against a
// noisy-middle bell and both shapes at lower contrast: at these settings
// OLS's slope estimate has ~2x the variance of WLS's across repeated
// samples (both unbiased on average -- WLS isn't "more correct" on any
// single draw, just more reliable across draws), and the median visible gap
// between the two fit lines across many single draws is close to 1 full
// y-unit (the true line spans roughly 11 y-units over this x range) --
// meaningfully more visible than the noisy-middle version's ~0.36.

function sigmaAt(x) {
  const bump = Math.exp(-((x - X_MID) ** 2) / (2 * BELL_WIDTH ** 2));
  return SIGMA_MAX - (SIGMA_MAX - SIGMA_MIN) * bump;
}

function samplePoint() {
  const x = X_MIN + Math.random() * (X_MAX - X_MIN);
  const sigma = sigmaAt(x);
  const y = TRUE_SLOPE * x + TRUE_INTERCEPT + gaussianNoise() * sigma;
  return { x, y, sigma };
}

function fmtLine(fit) {
  const sign = fit.intercept >= 0 ? '+' : '−';
  return `y = ${fit.slope.toFixed(2)}x ${sign} ${Math.abs(fit.intercept).toFixed(2)}`;
}

class WeightedRegressionDemo {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('.weighted-regression-demo-canvas');
    this.regenBtn = root.querySelector('.weighted-regression-demo-regen');
    this.wlsToggle = root.querySelector('.weighted-regression-demo-wls-toggle');
    this.trueEq = root.querySelector('.weighted-regression-demo-true-eq');
    this.olsEq = root.querySelector('.weighted-regression-demo-ols-eq');
    this.olsError = root.querySelector('.weighted-regression-demo-ols-error');
    this.wlsStats = root.querySelector('.weighted-regression-demo-wls-stats');
    this.wlsEq = root.querySelector('.weighted-regression-demo-wls-eq');
    this.wlsError = root.querySelector('.weighted-regression-demo-wls-error');

    this.regenBtn.addEventListener('click', () => this.generateNew());
    this.wlsToggle.addEventListener('change', () => this.draw());

    wireRedraw(this.canvas, () => this.draw());

    this.generateNew();
  }

  generateNew() {
    this.points = Array.from({ length: N }, () => samplePoint());
    this.draw();
  }

  draw() {
    const setup = setupCanvas(this.canvas);
    if (!setup || !this.points) return;
    const { ctx, rect } = setup;

    const fontFamily = getComputedStyle(this.root).fontFamily;
    const colors = readColors(this.root, {
      point: '--wreg-point',
      trueLine: '--wreg-true-line',
      olsLine: '--wreg-ols-line',
      wlsLine: '--wreg-wls-line',
      axis: '--wreg-axis',
      grid: '--wreg-grid',
      text: '--wreg-text',
    });

    const points = this.points;
    const weights = points.map((p) => 1 / (p.sigma * p.sigma));
    const maxWeight = Math.max(...weights);

    const olsFit = fitLine(points);
    this.trueEq.textContent = fmtLine({ slope: TRUE_SLOPE, intercept: TRUE_INTERCEPT });
    this.olsEq.textContent = fmtLine(olsFit);
    this.olsError.textContent = weightedMSE(points, olsFit, weights).toFixed(2);

    const showWls = this.wlsToggle.checked;
    this.wlsStats.hidden = !showWls;
    let wlsFit = null;
    if (showWls) {
      wlsFit = fitWeightedLine(points, weights);
      this.wlsEq.textContent = fmtLine(wlsFit);
      this.wlsError.textContent = weightedMSE(points, wlsFit, weights).toFixed(2);
    }

    const margin = { left: 40, right: 14, top: 14, bottom: 30 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const trueYAtXMin = TRUE_SLOPE * X_MIN + TRUE_INTERCEPT;
    const trueYAtXMax = TRUE_SLOPE * X_MAX + TRUE_INTERCEPT;
    const ys = points.map((p) => p.y);
    const yLo = Math.min(...ys, trueYAtXMin, trueYAtXMax);
    const yHi = Math.max(...ys, trueYAtXMin, trueYAtXMax);
    const yRange = yHi - yLo || 1;
    const yPad = yRange * 0.08;
    const yMin = yLo - yPad;
    const yMax = yHi + yPad;
    const ySpan = yMax - yMin || 1;
    const yTicks = niceTicks(yMin, yMax, 5).filter((t) => t >= yMin && t <= yMax);
    const xTicks = niceTicks(X_MIN, X_MAX, 6);

    const xPix = (x) => margin.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
    const yPix = (y) => margin.top + plotH - ((y - yMin) / ySpan) * plotH;

    drawAxes(ctx, { margin, plotW, plotH, xTicks, yTicks, xPix, yPix, colors, fontFamily });

    // true line: dashed, the answer key
    ctx.strokeStyle = colors.trueLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xPix(X_MIN), yPix(trueYAtXMin));
    ctx.lineTo(xPix(X_MAX), yPix(trueYAtXMax));
    ctx.stroke();
    ctx.setLineDash([]);

    // OLS fit: solid, the site's own "you're interacting with this" accent
    ctx.strokeStyle = colors.olsLine;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xPix(X_MIN), yPix(olsFit.slope * X_MIN + olsFit.intercept));
    ctx.lineTo(xPix(X_MAX), yPix(olsFit.slope * X_MAX + olsFit.intercept));
    ctx.stroke();

    // WLS fit: solid, second color, only when toggled on
    if (showWls) {
      ctx.strokeStyle = colors.wlsLine;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xPix(X_MIN), yPix(wlsFit.slope * X_MIN + wlsFit.intercept));
      ctx.lineTo(xPix(X_MAX), yPix(wlsFit.slope * X_MAX + wlsFit.intercept));
      ctx.stroke();
    }

    // points: opacity scaled by weight, so the least-trustworthy (noisiest)
    // points visibly fade out instead of reading as equally solid evidence
    ctx.fillStyle = colors.point;
    points.forEach((p, i) => {
      ctx.globalAlpha = 0.25 + 0.65 * (weights[i] / maxWeight);
      ctx.beginPath();
      ctx.arc(xPix(p.x), yPix(p.y), 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

initDemo('.weighted-regression-demo', WeightedRegressionDemo);
