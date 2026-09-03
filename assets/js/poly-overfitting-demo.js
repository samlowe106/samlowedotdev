// Interactive polynomial-regression demo embedded via
// _includes/linear-regression-2/poly-overfitting-demo.html: fits a degree-d
// polynomial to a noisy training sample drawn from a fixed nonlinear true
// curve, and separately tracks a held-out test sample the fit never sees.
//
// This is poly-regression-demo.js minus the ridge lambda slider -- the
// Bias-Variance Tradeoff section this demo lives in comes well before Ridge
// Regression is introduced later in the article, and a lambda control here
// would dangle a mechanism the reader hasn't been taught yet. The
// generative model and fitting math are imported directly from
// poly-regression-demo.js rather than redefined, so this demo, the
// ridge-enabled demo further down (Ridge Regression section), and the
// bias-variance-demo.js companion panel can never drift apart.
//
// Canvas/tick/axis plumbing is shared via assets/js/demo-core.

import { setupCanvas, readColors, drawAxes, niceTicks, wireRedraw, initDemo } from './demo-core/src/index.js';
import { X_MIN, X_MAX, trueFn, samplePoint, fitPolynomialRidge, evalPoly, NOISE_SIGMA, N_TRAIN } from './poly-regression-demo.js';

function mse(points, theta) {
  return points.reduce((sum, p) => sum + (p.y - evalPoly(theta, p.x)) ** 2, 0) / points.length;
}

const N_TEST = 40;
const CURVE_SAMPLES = 120;

class PolyOverfittingDemo {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('.poly-overfitting-demo-canvas');
    this.regenBtn = root.querySelector('.poly-overfitting-demo-regen');
    this.degreeInput = root.querySelector('.poly-overfitting-demo-degree');
    this.degreeValue = root.querySelector('.poly-overfitting-demo-degree-value');
    this.trainError = root.querySelector('.poly-overfitting-demo-train-error');
    this.testError = root.querySelector('.poly-overfitting-demo-test-error');

    this.regenBtn.addEventListener('click', () => this.generateNew());
    this.degreeInput.addEventListener('input', () => {
      this.degreeValue.textContent = this.degreeInput.value;
      this.draw();
    });

    wireRedraw(this.canvas, () => this.draw());

    this.generateNew();
  }

  generateNew() {
    this.trainPoints = Array.from({ length: N_TRAIN }, () => samplePoint(NOISE_SIGMA));
    this.testPoints = Array.from({ length: N_TEST }, () => samplePoint(NOISE_SIGMA));
    this.draw();
  }

  draw() {
    const setup = setupCanvas(this.canvas);
    if (!setup || !this.trainPoints) return;
    const { ctx, rect } = setup;

    const fontFamily = getComputedStyle(this.root).fontFamily;
    const colors = readColors(this.root, {
      train: '--polyover-train-point',
      test: '--polyover-test-point',
      trueLine: '--polyover-true-line',
      fitLine: '--polyover-fit-line',
      axis: '--polyover-axis',
      grid: '--polyover-grid',
      text: '--polyover-text',
    });

    const degree = Number(this.degreeInput.value);
    const theta = fitPolynomialRidge(this.trainPoints, degree, 0);
    this.trainError.textContent = mse(this.trainPoints, theta).toFixed(2);
    this.testError.textContent = mse(this.testPoints, theta).toFixed(2);

    const margin = { left: 40, right: 14, top: 14, bottom: 30 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const curveXs = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => X_MIN + (i / CURVE_SAMPLES) * (X_MAX - X_MIN));
    const fitYs = curveXs.map((x) => evalPoly(theta, x));
    const trueYs = curveXs.map((x) => trueFn(x));

    const allYs = [...this.trainPoints.map((p) => p.y), ...this.testPoints.map((p) => p.y), ...trueYs];
    // Fitted curves at high degree can still swing outside the data's own
    // range (same reasoning as poly-regression-demo.js's own comment here)
    // -- clamp the y-window so the plot stays readable.
    const dataLo = Math.min(...allYs);
    const dataHi = Math.max(...allYs);
    const dataSpan = dataHi - dataLo || 1;
    const clampLo = dataLo - dataSpan * 1.5;
    const clampHi = dataHi + dataSpan * 1.5;
    const clampedFitYs = fitYs.map((y) => Math.min(Math.max(y, clampLo), clampHi));

    const yLo = Math.min(dataLo, ...clampedFitYs);
    const yHi = Math.max(dataHi, ...clampedFitYs);
    const yTicks = niceTicks(yLo, yHi, 5);
    const yMin = Math.min(yLo, yTicks[0]);
    const yMax = Math.max(yHi, yTicks[yTicks.length - 1]);
    const ySpan = yMax - yMin || 1;
    const xTicks = niceTicks(X_MIN, X_MAX, 6);

    const xPix = (x) => margin.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
    const yPix = (y) => margin.top + plotH - ((y - yMin) / ySpan) * plotH;

    drawAxes(ctx, { margin, plotW, plotH, xTicks, yTicks, xPix, yPix, colors, fontFamily });

    // true curve: dashed, same "the answer key" language as regression-demo.js
    ctx.strokeStyle = colors.trueLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    curveXs.forEach((x, i) => {
      const px = xPix(x);
      const py = yPix(trueYs[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // fitted curve: solid, clamped to the visible window (see clampedFitYs)
    ctx.strokeStyle = colors.fitLine;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    curveXs.forEach((x, i) => {
      const px = xPix(x);
      const py = yPix(clampedFitYs[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // test points: hollow, so they read as "not used to draw this line"
    ctx.strokeStyle = colors.test;
    ctx.lineWidth = 1.5;
    for (const p of this.testPoints) {
      ctx.beginPath();
      ctx.arc(xPix(p.x), yPix(p.y), 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // train points: filled
    ctx.fillStyle = colors.train;
    for (const p of this.trainPoints) {
      ctx.beginPath();
      ctx.arc(xPix(p.x), yPix(p.y), 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

initDemo('.poly-overfitting-demo', PolyOverfittingDemo);
