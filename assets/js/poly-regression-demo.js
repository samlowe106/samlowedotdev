// Interactive polynomial-regression / ridge demo embedded via
// _includes/poly-regression-demo.html: fits a degree-d polynomial (optional
// ridge penalty) to a noisy training sample drawn from a fixed nonlinear
// true curve, and separately tracks a held-out test sample the fit never
// sees. Same canvas-redraws-live approach as assets/js/regression-demo.js
// (see that file's own top comment); colors read from CSS custom
// properties on .poly-regression-demo via getComputedStyle() so this
// themes correctly across light/dark/OLED with no JS changes.
//
// Unlike regression-demo.js, the true curve here is NOT randomized by
// "Generate new" -- the whole point of this demo is watching degree and
// ridge strength fight over approximating one fixed, known nonlinear
// shape, so only the noisy train/test samples reroll.
//
// The ridge-regularized polynomial fit is this demo's own math; canvas/
// tick/axis plumbing is shared via assets/js/demo-core.

import { gaussianNoise, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

// X_MIN/X_MAX/trueFn/samplePoint/fitPolynomialRidge/evalPoly/NOISE_SIGMA/
// N_TRAIN are exported so assets/js/bias-variance-demo.js can Monte Carlo
// over the *exact* same generative model and fitting method this demo
// itself uses -- that correspondence (same model, same fit) is the whole
// point of that companion panel, not an approximation of it.
export const X_MIN = 0;
export const X_MAX = 10;
const X_MID = (X_MIN + X_MAX) / 2;
const X_HALF = (X_MAX - X_MIN) / 2;
export const NOISE_SIGMA = 0.6;
// 40, not a smaller "just enough to fit" count: at N_TRAIN=16 the monomial
// basis is already ill-conditioned enough that variance overtakes bias by
// degree 5 and explodes at degree 6 (see bias-variance-demo.js), pulling the
// sweet spot down to degree 3 -- short of where bias actually bottoms out.
// 40 keeps variance small enough through degree 5 that the sweet spot lands
// on the same degree the noiseless fit needs, not an earlier compromise --
// verified via Monte Carlo in scratch before picking this number, not
// guessed.
export const N_TRAIN = 40;

// A single sine, not two: bias vanishes by degree 5 (noiseless RMSE ~0.09,
// vs ~0.35 at degree 4), and that same degree 5 is also where the real,
// noisy Monte Carlo bias-variance total is minimized at N_TRAIN=40 -- the
// two numbers the article talks about (the degree needed for a good fit,
// and the bias-variance sweet spot) are the same number here, not two
// different ones that need reconciling. 0.75 rad/unit (not 0.6) is what
// makes degree 4 alone genuinely insufficient (RMSE 0.35, a visible wobble)
// so "degree 4 or 5" reads as "5 is the one that actually gets there."
// Verified via Monte Carlo in scratch before picking this frequency, not
// guessed.
export function trueFn(x) {
  return 3 * Math.sin(0.75 * x) + 5;
}

export function samplePoint(sigma) {
  const x = X_MIN + Math.random() * (X_MAX - X_MIN);
  return { x, y: trueFn(x) + gaussianNoise() * sigma };
}

// x is normalized to [-1, 1] before building powers of it -- raw x in
// [0, 10] raised to a degree-12 power spans many orders of magnitude,
// which makes the normal-equations matrix below badly conditioned. This
// is purely a numerical stability trick; it doesn't change what the fit
// means, only how safely it can be computed.
function normX(x) {
  return (x - X_MID) / X_HALF;
}

function vandermonde(xs, degree) {
  return xs.map((x) => {
    const u = normX(x);
    const row = [];
    let p = 1;
    for (let k = 0; k <= degree; k++) {
      row.push(p);
      p *= u;
    }
    return row;
  });
}

function transpose(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function matMul(A, B) {
  return A.map((rowA) => B[0].map((_, j) => rowA.reduce((sum, a, k) => sum + a * B[k][j], 0)));
}

function matVec(A, v) {
  return A.map((row) => row.reduce((sum, a, k) => sum + a * v[k], 0));
}

// Gaussian elimination with partial pivoting on an augmented [A | b] matrix.
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-10 ? 0 : row[n] / row[i]));
}

// Ridge regression in the normalized-x polynomial basis: theta minimizes
// ||Xθ - y||^2 + λ||θ'||^2, where θ' excludes the intercept (index 0) --
// penalizing the intercept would just bias every fit toward y=0 for no
// statistical reason, so the ridge diagonal skips it.
export function fitPolynomialRidge(points, degree, lambda) {
  const X = vandermonde(points.map((p) => p.x), degree);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  for (let i = 1; i <= degree; i++) XtX[i][i] += lambda;
  const Xty = matVec(
    Xt,
    points.map((p) => p.y)
  );
  return solveLinearSystem(XtX, Xty);
}

export function evalPoly(theta, x) {
  const u = normX(x);
  let result = 0;
  let p = 1;
  for (let k = 0; k < theta.length; k++) {
    result += theta[k] * p;
    p *= u;
  }
  return result;
}

function mse(points, theta) {
  return points.reduce((sum, p) => sum + (p.y - evalPoly(theta, p.x)) ** 2, 0) / points.length;
}

const N_TEST = 40;
const CURVE_SAMPLES = 120;

class PolyRegressionDemo {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('.poly-regression-demo-canvas');
    this.regenBtn = root.querySelector('.poly-regression-demo-regen');
    this.degreeInput = root.querySelector('.poly-regression-demo-degree');
    this.degreeValue = root.querySelector('.poly-regression-demo-degree-value');
    this.lambdaInput = root.querySelector('.poly-regression-demo-lambda');
    this.lambdaValue = root.querySelector('.poly-regression-demo-lambda-value');
    this.trainError = root.querySelector('.poly-regression-demo-train-error');
    this.testError = root.querySelector('.poly-regression-demo-test-error');

    this.regenBtn.addEventListener('click', () => this.generateNew());
    this.degreeInput.addEventListener('input', () => {
      this.degreeValue.textContent = this.degreeInput.value;
      this.draw();
    });
    this.lambdaInput.addEventListener('input', () => {
      this.lambdaValue.textContent = Number(this.lambdaInput.value).toFixed(2);
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
      train: '--polyreg-train-point',
      test: '--polyreg-test-point',
      trueLine: '--polyreg-true-line',
      fitLine: '--polyreg-fit-line',
      axis: '--polyreg-axis',
      grid: '--polyreg-grid',
      text: '--polyreg-text',
    });

    const degree = Number(this.degreeInput.value);
    const lambda = Number(this.lambdaInput.value);
    const theta = fitPolynomialRidge(this.trainPoints, degree, lambda);
    this.trainError.textContent = mse(this.trainPoints, theta).toFixed(2);
    this.testError.textContent = mse(this.testPoints, theta).toFixed(2);

    const margin = { left: 40, right: 14, top: 14, bottom: 30 };
    const plotW = rect.width - margin.left - margin.right;
    const plotH = rect.height - margin.top - margin.bottom;

    const curveXs = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => X_MIN + (i / CURVE_SAMPLES) * (X_MAX - X_MIN));
    const fitYs = curveXs.map((x) => evalPoly(theta, x));
    const trueYs = curveXs.map((x) => trueFn(x));

    const allYs = [...this.trainPoints.map((p) => p.y), ...this.testPoints.map((p) => p.y), ...trueYs];
    // Fitted curves at high degree/low ridge can swing far outside the
    // data's own range (that swinging IS the overfitting this demo is
    // showing) -- clamp the y-window to a generous multiple of the data's
    // spread so the plot stays readable instead of collapsing to a sliver
    // around one wild spike.
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

initDemo('.poly-regression-demo', PolyRegressionDemo);
