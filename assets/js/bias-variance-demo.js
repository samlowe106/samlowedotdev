// Companion panel for the polynomial-regression demo above it
// (_includes/linear-regression-2/poly-regression-demo.html): for each
// degree, Bias^2 and Variance are real Monte Carlo estimates (many refits
// on fresh noisy samples from that demo's own generative model), not an
// illustrative sketch -- see poly-regression-demo.js's exports, which this
// imports directly so the two panels can never drift apart.
//
// This panel has no controls of its own. It reads the degree slider that
// already exists in the poly-overfitting-demo above it directly off the DOM
// (there's only ever one of each per page, so this doesn't try to be a
// general "N independent instances" component the way every other
// demo-core-based demo is) -- deliberately NOT poly-regression-demo's own
// degree slider, since that demo (with its ridge control) lives further
// down in the Ridge Regression section, not directly above this panel.
//
// data-max-degree and data-scale on the root element pick which degree
// range and axis scale to render -- see the root element's own comment in
// bias-variance-demo.html for why both variants exist right now.

import { setupCanvas, readColors, drawAxes, wireRedraw, initDemo, niceTicks } from './demo-core/src/index.js';
import { X_MIN, X_MAX, trueFn, samplePoint, fitPolynomialRidge, evalPoly, NOISE_SIGMA, N_TRAIN } from './poly-regression-demo.js';

const MC_REPS = 300;
const TEST_GRID_N = 30;
const SIGMA2 = NOISE_SIGMA * NOISE_SIGMA;

// A tiny positive floor, not a real assumption about the data -- Bias^2 can
// come out of the Monte Carlo estimate arbitrarily close to (but never
// exactly) zero, and a literal 0 would break the log-scale variant's
// Math.log10 below.
const EPS = 1e-6;

function computeBiasVarianceCurve(maxDegree) {
  const testXs = Array.from({ length: TEST_GRID_N }, (_, i) => X_MIN + (i / (TEST_GRID_N - 1)) * (X_MAX - X_MIN));
  const trueYs = testXs.map(trueFn);

  const degrees = Array.from({ length: maxDegree }, (_, i) => i + 1);
  return degrees.map((degree) => {
    // predictions[m][j]: the m-th refit's prediction at testXs[j]
    const predictions = [];
    for (let m = 0; m < MC_REPS; m++) {
      const trainSample = Array.from({ length: N_TRAIN }, () => samplePoint(NOISE_SIGMA));
      const theta = fitPolynomialRidge(trainSample, degree, 0);
      predictions.push(testXs.map((x) => evalPoly(theta, x)));
    }

    let biasSq = 0;
    let variance = 0;
    for (let j = 0; j < testXs.length; j++) {
      let meanPred = 0;
      for (let m = 0; m < MC_REPS; m++) meanPred += predictions[m][j];
      meanPred /= MC_REPS;
      biasSq += (trueYs[j] - meanPred) ** 2;
      let v = 0;
      for (let m = 0; m < MC_REPS; m++) v += (predictions[m][j] - meanPred) ** 2;
      variance += v / MC_REPS;
    }
    biasSq = Math.max(biasSq / testXs.length, EPS);
    variance = Math.max(variance / testXs.length, EPS);

    return { degree, biasSq, variance, total: biasSq + variance + SIGMA2 };
  });
}

const SUPERSCRIPT_DIGITS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function formatPowerOfTen(exp) {
  const digits = String(exp)
    .split('')
    .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
    .join('');
  return exp === 0 ? '1' : `10${digits}`;
}

class BiasVarianceDemo {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('.bias-variance-demo-canvas');
    this.degreeInput = document.querySelector('.poly-overfitting-demo-degree');
    this.maxDegree = Number(root.dataset.maxDegree || 12);
    this.logScale = root.dataset.scale !== 'linear';
    this.curve = computeBiasVarianceCurve(this.maxDegree);

    if (this.degreeInput) {
      this.degreeInput.addEventListener('input', () => this.draw());
    }
    wireRedraw(this.canvas, () => this.draw());
    this.draw();
  }

  currentDegree() {
    const raw = this.degreeInput ? Number(this.degreeInput.value) : this.curve[Math.floor(this.curve.length / 2)].degree;
    return Math.min(Math.max(raw, 1), this.maxDegree);
  }

  draw() {
    const setup = setupCanvas(this.canvas);
    if (!setup) return;
    const { ctx, rect } = setup;

    const fontFamily = getComputedStyle(this.root).fontFamily;
    const colors = readColors(this.root, {
      bias: '--bv-bias',
      variance: '--bv-variance',
      total: '--bv-total',
      axis: '--bv-axis',
      grid: '--bv-grid',
      text: '--bv-text',
    });

    const margin = { left: 46, right: 14, top: 14, bottom: 32 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const allYs = this.curve.flatMap((d) => [d.biasSq, d.variance, d.total]);
    const yLo = Math.min(...allYs);
    const yHi = Math.max(...allYs);

    let yTicks;
    let yPix;
    let yFormat;
    if (this.logScale) {
      const loExp = Math.floor(Math.log10(yLo));
      const hiExp = Math.ceil(Math.log10(yHi));
      yTicks = [];
      for (let e = loExp; e <= hiExp; e++) yTicks.push(10 ** e);
      yPix = (y) => margin.top + plotH - ((Math.log10(y) - loExp) / (hiExp - loExp || 1)) * plotH;
      yFormat = (t) => formatPowerOfTen(Math.round(Math.log10(t)));
    } else {
      yTicks = niceTicks(0, yHi, 5);
      const yMax = yTicks[yTicks.length - 1];
      yPix = (y) => margin.top + plotH - (y / yMax) * plotH;
      yFormat = (t) => (t >= 100 ? t.toFixed(0) : t.toFixed(1));
    }

    const xPix = (d) => margin.left + ((d - 1) / (this.maxDegree - 1 || 1)) * plotW;
    const xTickStep = this.maxDegree <= 6 ? 1 : 2;
    const xTicks = [];
    for (let d = 1; d <= this.maxDegree; d += xTickStep) xTicks.push(d);
    if (xTicks[xTicks.length - 1] !== this.maxDegree) xTicks.push(this.maxDegree);

    drawAxes(ctx, {
      margin,
      plotW,
      plotH,
      xTicks,
      yTicks,
      xPix,
      yPix,
      colors,
      fontFamily,
      xFormat: (t) => String(t),
      yFormat,
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = colors.text;
    ctx.fillText('model complexity (polynomial degree)', margin.left + plotW / 2, margin.top + plotH + 28);

    const drawCurve = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.curve.forEach((d, i) => {
        const px = xPix(d.degree);
        const py = yPix(d[key]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    drawCurve('biasSq', colors.bias);
    drawCurve('variance', colors.variance);
    drawCurve('total', colors.total);

    // Dashed guide line + one dot per curve at whatever degree the
    // polynomial demo's own slider is currently set to.
    const degree = this.currentDegree();
    const point = this.curve.find((d) => d.degree === degree) || this.curve[0];
    const px = xPix(point.degree);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const [key, color] of [
      ['biasSq', colors.bias],
      ['variance', colors.variance],
      ['total', colors.total],
    ]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, yPix(point[key]), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

initDemo('.bias-variance-demo', BiasVarianceDemo);
