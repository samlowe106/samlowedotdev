// Click-to-replay convergence demo embedded via
// _includes/convergence-demo.html: on "Play", draws a fresh random true
// line and animates the sample size n from 1 to 100, redrawing the OLS fit
// at each step so the fitted line visibly converges onto the true line. A
// second panel graphs the L2 distance ||theta_hat - theta*|| -- how far the
// fitted (slope, intercept) pair sits from the *true* (slope, intercept) --
// against n as it plays.
//
// This is deliberately not RSS/mean RSS against n: those measure how well
// the fit explains the *sample*, and both climb (raw RSS) or plateau well
// above zero (mean RSS -> sigma^2) as n grows, since with only 2 parameters
// a tiny sample is trivially easy to fit almost exactly -- neither one
// actually shows the fit getting closer to the ground truth, which is the
// question this whole demo is about. Distance in parameter space is a
// direct answer to that question, and (unlike training RSS) does trend to
// zero as n grows, since OLS is a consistent estimator: Var(theta_hat)
// shrinks like O(1/n). It's still a single noisy sample path, not an
// average over many runs, so expect visible wobble, not a perfectly smooth
// descent.
//
// The scatter panel is chromeless by design (no axes/ticks/grid) -- a
// direct replacement for the article's old animated-webp thumbnail, framed
// the same tight way that capture was. The error panel is a normal axed
// line chart, closer in spirit to residual-demo.js's histogram panel.
//
// The sampling model and the error-vs-n tracking are this demo's own thing;
// the canvas/tick/axis/OLS plumbing around them is shared via
// assets/js/demo-core.

import { gaussianNoise, fitLine, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  const X_MIN = 0;
  const X_MAX = 10;
  const SIGMA = 2;
  const N_MAX = 100;
  const STEP_MS = 35; // ~3.5s for the full 1->100 sweep

  function samplePoint(slope, intercept, sigma) {
    const x = X_MIN + Math.random() * (X_MAX - X_MIN);
    const y = slope * x + intercept + gaussianNoise() * sigma;
    return { x, y };
  }

  function randomSlope() {
    const magnitude = Math.round((0.5 + Math.random() * 2.5) * 10) / 10;
    return Math.random() < 0.5 ? -magnitude : magnitude;
  }

  function randomIntercept() {
    return Math.round((Math.random() * 10 - 2) * 10) / 10;
  }

  // Euclidean (L2) distance from the fitted (slope, intercept) to the true
  // one -- the L1 norm (sum of absolute differences) was the other option,
  // but L2 keeps this consistent with the rest of the article: OLS itself
  // is defined by minimizing an L2 loss (RSS), so "distance to the truth"
  // is measured the same way "distance to the sample" was.
  function paramDistance(fit, trueSlope, trueIntercept) {
    return Math.sqrt((fit.slope - trueSlope) ** 2 + (fit.intercept - trueIntercept) ** 2);
  }

  class ConvergenceDemo {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('.convergence-demo-canvas');
      this.errorCanvas = root.querySelector('.convergence-demo-error-canvas');
      this.playBtn = root.querySelector('.convergence-demo-play');
      this.nValue = root.querySelector('.convergence-demo-n-value');

      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.timer = null;
      this.n = 1;
      this.newSample();

      this.playBtn.addEventListener('click', () => this.play());
      wireRedraw([this.canvas, this.errorCanvas], () => this.draw());

      this.draw();
    }

    // Fresh random true line + full sample pool, plus the fitted-to-true
    // parameter distance for every n=2..N_MAX precomputed up front -- lets
    // the error panel's y-axis be fixed for the whole sweep (same reasoning
    // as regression-demo.js's y-domain: recomputing per-frame off just the
    // visible prefix would drag the axis around every tick) and is cheap
    // (~100^2 operations) to do once per sample rather than every frame.
    newSample() {
      this.slope = randomSlope();
      this.intercept = randomIntercept();
      this.allPoints = Array.from({ length: N_MAX }, () => samplePoint(this.slope, this.intercept, SIGMA));

      this.errorByN = new Array(N_MAX + 1).fill(null);
      let maxError = 0;
      for (let nn = 2; nn <= N_MAX; nn++) {
        const pts = this.allPoints.slice(0, nn);
        const value = paramDistance(fitLine(pts), this.slope, this.intercept);
        this.errorByN[nn] = value;
        if (value > maxError) maxError = value;
      }
      this.errorMax = maxError || 1;
    }

    play() {
      clearInterval(this.timer);
      this.playBtn.disabled = true;
      this.playBtn.textContent = 'Playing...';
      this.newSample();

      if (this.reduceMotion) {
        this.n = N_MAX;
        this.draw();
        this.finish();
        return;
      }

      this.n = 1;
      this.draw();
      this.timer = setInterval(() => {
        this.n += 1;
        this.draw();
        if (this.n >= N_MAX) this.finish();
      }, STEP_MS);
    }

    finish() {
      clearInterval(this.timer);
      this.timer = null;
      this.playBtn.disabled = false;
      this.playBtn.textContent = 'Replay';
    }

    colors() {
      const rootStyle = getComputedStyle(this.root);
      return {
        ...readColors(this.root, {
          point: '--convergence-point',
          trueLine: '--convergence-true-line',
          fitLine: '--convergence-fit-line',
          axis: '--convergence-axis',
          grid: '--convergence-grid',
          text: '--convergence-text',
        }),
        fontFamily: rootStyle.fontFamily,
        pointRadius: parseFloat(rootStyle.getPropertyValue('--convergence-point-radius')) || 3,
        fitLineWidth: parseFloat(rootStyle.getPropertyValue('--convergence-fit-line-width')) || 3,
      };
    }

    draw() {
      this.nValue.textContent = this.n;
      this.drawScatter();
      this.drawError();
    }

    drawScatter() {
      const setup = setupCanvas(this.canvas);
      if (!setup) return;
      const { ctx, rect } = setup;
      const colors = this.colors();
      const points = this.allPoints.slice(0, this.n);

      // Y-range from the full pool + true line, fixed across the whole
      // sweep -- keeps the framing stable as n grows instead of jumping
      // around every frame (the fit's own endpoints are excluded, same
      // reasoning as regression-demo.js: a 2-3 point fit can extrapolate
      // wildly and would drag this around).
      const ys = this.allPoints.map((p) => p.y);
      const trueYAtXMin = this.slope * X_MIN + this.intercept;
      const trueYAtXMax = this.slope * X_MAX + this.intercept;
      const yLo = Math.min(...ys, trueYAtXMin, trueYAtXMax);
      const yHi = Math.max(...ys, trueYAtXMin, trueYAtXMax);
      const yRange = yHi - yLo || 1;
      const yPad = yRange * 0.08;
      const yMin = yLo - yPad;
      const yMax = yHi + yPad;
      const ySpan = yMax - yMin || 1;

      const xPad = (X_MAX - X_MIN) * 0.04;
      const xPix = (x) => ((x - (X_MIN - xPad)) / (X_MAX - X_MIN + 2 * xPad)) * rect.width;
      const yPix = (y) => rect.height - ((y - yMin) / ySpan) * rect.height;

      ctx.strokeStyle = colors.trueLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xPix(X_MIN), yPix(trueYAtXMin));
      ctx.lineTo(xPix(X_MAX), yPix(trueYAtXMax));
      ctx.stroke();
      ctx.setLineDash([]);

      if (points.length >= 2) {
        const fit = fitLine(points);
        const fitYAtXMin = fit.slope * X_MIN + fit.intercept;
        const fitYAtXMax = fit.slope * X_MAX + fit.intercept;
        ctx.strokeStyle = colors.fitLine;
        ctx.lineWidth = colors.fitLineWidth;
        ctx.beginPath();
        ctx.moveTo(xPix(X_MIN), yPix(fitYAtXMin));
        ctx.lineTo(xPix(X_MAX), yPix(fitYAtXMax));
        ctx.stroke();
      }

      ctx.fillStyle = colors.point;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(xPix(p.x), yPix(p.y), colors.pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawError() {
      const setup = setupCanvas(this.errorCanvas);
      if (!setup) return;
      const { ctx, rect } = setup;
      const colors = this.colors();

      const margin = { left: 34, right: 12, top: 10, bottom: 22 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;

      const xTicks = niceTicks(0, N_MAX, 4);
      const yTicks = niceTicks(0, this.errorMax, 4);
      const yHi = Math.max(this.errorMax, yTicks[yTicks.length - 1]);

      const xPix = (nn) => margin.left + (nn / N_MAX) * plotW;
      const yPix = (v) => margin.top + plotH - (v / yHi) * plotH;

      drawAxes(ctx, {
        margin,
        plotW,
        plotH,
        xTicks,
        yTicks,
        xPix,
        yPix,
        colors,
        fontFamily: colors.fontFamily,
        xGrid: false,
        xFormat: (t) => String(Math.round(t)),
      });

      ctx.strokeStyle = colors.fitLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let nn = 2; nn <= this.n; nn++) {
        const v = this.errorByN[nn];
        if (v == null) continue;
        const px = xPix(nn);
        const py = yPix(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();

      if (this.n >= 2) {
        ctx.fillStyle = colors.fitLine;
        ctx.beginPath();
        ctx.arc(xPix(this.n), yPix(this.errorByN[this.n]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  initDemo('.convergence-demo', ConvergenceDemo);
})();
