// Interactive OLS demo embedded via _includes/regression-demo.html: draws a
// noisy scatter around a "true" line plus the least-squares fit through it.
// Canvas, not SVG (contrast the recession dashboard's charts,
// _includes/../scripts/fetch-recession-data.py's render_chart()) -- this
// redraws on every slider tick / button click, a build-time-only SVG can't
// do that.
//
// The sample persists in a list across interactions -- see the comment in
// RegressionDemo's constructor for exactly which actions replace it
// (noise slider, "Generate new") and which only add to or trim it (the
// sample-size slider).
//
// Colors are read from CSS custom properties on the .regression-demo root
// (see _sass/custom/_regression-demo.scss) via getComputedStyle(), not
// hardcoded here, so the same draw code themes correctly across
// light/dark/OLED and redraws on a mode-toggle flip (see wireRedraw() in
// assets/js/demo-core) without regenerating anything.
//
// Canvas setup, tick generation, axis drawing, and the OLS fit itself are
// shared via assets/js/demo-core -- see that package's own README for what
// it does and doesn't cover.

import { gaussianNoise, fitLine, rSquared, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  const DEFAULT_SLOPE = 2;
  const DEFAULT_INTERCEPT = 3;
  const X_MIN = 0;
  const X_MAX = 10;

  function samplePoint(slope, intercept, sigma) {
    const x = X_MIN + Math.random() * (X_MAX - X_MIN);
    const y = slope * x + intercept + gaussianNoise() * sigma;
    return { x, y };
  }

  // A fresh random true line for "Generate new" -- slope excludes the
  // dead-flat middle (would make "does the fit find the slope" a trivial,
  // uninteresting question) and intercept keeps the line comfortably
  // inside the fixed X_MIN..X_MAX plotting window instead of drifting
  // entirely off-screen.
  function randomSlope() {
    const magnitude = Math.round((0.5 + Math.random() * 2.5) * 10) / 10;
    return Math.random() < 0.5 ? -magnitude : magnitude;
  }

  function randomIntercept() {
    return Math.round((Math.random() * 10 - 2) * 10) / 10;
  }

  class RegressionDemo {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('.regression-demo-canvas');
      this.regenBtn = root.querySelector('.regression-demo-regen');
      this.noiseInput = root.querySelector('.regression-demo-noise');
      this.noiseValue = root.querySelector('.regression-demo-noise-value');
      this.nInput = root.querySelector('.regression-demo-n');
      this.nValue = root.querySelector('.regression-demo-n-value');
      this.trueEq = root.querySelector('.regression-demo-true-eq');
      this.fitEq = root.querySelector('.regression-demo-fit-eq');
      this.r2 = root.querySelector('.regression-demo-r2');

      // this.allPoints is a fixed-size pool, generated at the slider's own
      // max sample size every time the sample itself changes (generateNew(),
      // resample()) -- this.points, what's actually fitted and drawn, is
      // just a slice(0, n) window into that pool. Two things fall out of
      // this for free: dragging the sample-size slider only ever reveals or
      // hides points that already exist (never regenerates them, confirmed
      // by dragging n up then back down and getting the exact same fitted
      // coefficients back), and the chart's own axis range -- computed from
      // the full pool, not just the current slice, see draw() -- stays
      // fixed while that slider moves instead of visibly jumping around as
      // more or fewer points come into view. "Generate new" (a new true
      // line, see generateNew()) and the noise slider (resample() -- sigma
      // describes a whole sample, not a single point, so unlike sample
      // count there's no sensible way to reveal-not-regenerate here) both
      // legitimately replace the pool, and the axes are expected to move
      // when either of those happens.
      this.slope = DEFAULT_SLOPE;
      this.intercept = DEFAULT_INTERCEPT;
      this.allPoints = [];
      this.points = [];

      this.regenBtn.addEventListener('click', () => this.generateNew());
      this.noiseInput.addEventListener('input', () => {
        this.noiseValue.textContent = Number(this.noiseInput.value).toFixed(1);
        this.resample();
      });
      this.nInput.addEventListener('input', () => {
        this.nValue.textContent = this.nInput.value;
        this.syncSampleCount();
      });

      // Guards itself (draw() returns early on a zero-size rect) rather than
      // needing a debounce/dispatched-event dance -- see carousel-init.html's
      // own comment on why a corrupted-size bug there needed exactly this
      // kind of guard once resize handling got involved.
      wireRedraw(this.canvas, () => this.draw());

      this.allPoints = this.samplePool();
      this.syncVisiblePoints();
    }

    currentSigma() {
      return Number(this.noiseInput.value);
    }

    updateTrueEqLabel() {
      this.trueEq.textContent = `y = ${this.slope}x + ${this.intercept}`;
    }

    samplePool() {
      const nMax = Number(this.nInput.max);
      const sigma = this.currentSigma();
      return Array.from({ length: nMax }, () => samplePoint(this.slope, this.intercept, sigma));
    }

    // New random true line, a fresh full pool drawn around it -- the only
    // action that discards the existing sample outright.
    generateNew() {
      this.slope = randomSlope();
      this.intercept = randomIntercept();
      this.updateTrueEqLabel();
      this.allPoints = this.samplePool();
      this.syncVisiblePoints();
    }

    // Same true line, fresh noise draws -- sigma describes the whole pool,
    // so unlike the count slider this does replace every point.
    resample() {
      this.allPoints = this.samplePool();
      this.syncVisiblePoints();
    }

    // Just changes how much of the existing pool is sliced off as "visible"
    // -- never touches the pool itself, so the same n always reveals the
    // exact same points.
    syncSampleCount() {
      this.syncVisiblePoints();
    }

    syncVisiblePoints() {
      const n = Number(this.nInput.value);
      this.points = this.allPoints.slice(0, n);
      this.draw();
    }

    draw() {
      const setup = setupCanvas(this.canvas);
      if (!setup || !this.points.length) return;
      const { ctx, rect } = setup;

      const rootStyle = getComputedStyle(this.root);
      const colors = readColors(this.root, {
        point: '--regression-point',
        trueLine: '--regression-true-line',
        fitLine: '--regression-fit-line',
        residual: '--regression-residual',
        axis: '--regression-axis',
        grid: '--regression-grid',
        text: '--regression-text',
      });
      const fontFamily = rootStyle.fontFamily;
      // Themeable like the colors above, not just a magic number -- lets a
      // one-off screenshot (the article's own convergence video/thumbnail)
      // override just this without touching the live on-page demo.
      const pointRadius = parseFloat(rootStyle.getPropertyValue('--regression-point-radius')) || 2.6;
      const fitLineWidth = parseFloat(rootStyle.getPropertyValue('--regression-fit-line-width')) || 2.5;

      const points = this.points;
      const fit = fitLine(points);
      const r2 = rSquared(points, fit);
      this.fitEq.textContent = `y = ${fit.slope.toFixed(2)}x + ${fit.intercept.toFixed(2)}`;
      this.r2.textContent = r2.toFixed(3);

      // Chromeless: an opt-in capture mode, never set by any markup this
      // repo ships -- only a one-off screenshot script (a hero image, say)
      // sets this attribute via page.evaluate() to get a bare plot with no
      // axis/grid/ticks and the data filling the entire canvas edge to edge,
      // without touching the live on-page demo's normal look at all.
      const chromeless = this.root.hasAttribute('data-capture-mode');
      const margin = chromeless
        ? { left: 0, right: 0, top: 0, bottom: 0 }
        : { left: 46, right: 14, top: 14, bottom: 30 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;

      // Y-range comes from the full pool (this.allPoints) and the true
      // line's endpoints only -- both fixed for the whole n:1->100 sweep,
      // so the axis is fully stable as the sample-size slider moves. The
      // fitted line's own endpoints are deliberately excluded: unlike the
      // true line, the fit is recomputed every time n changes and swings
      // wildly at low n (a 2-3 point fit can extrapolate way outside the
      // data range at x=0/x=10), which was dragging the whole axis around
      // every frame. A wild early fit now just draws partly off-canvas
      // instead, which is arguably more honest anyway -- it's showing you
      // an unreliable fit.
      const ys = this.allPoints.map((p) => p.y);
      const trueYAtXMin = this.slope * X_MIN + this.intercept;
      const trueYAtXMax = this.slope * X_MAX + this.intercept;
      const yLo = Math.min(...ys, trueYAtXMin, trueYAtXMax);
      const yHi = Math.max(...ys, trueYAtXMin, trueYAtXMax);

      // A small fixed-fraction pad, not "expand to the next nice tick" --
      // the latter can snap the domain out to a much coarser round number
      // than the data actually needs (e.g. data spanning 0..23 rounding
      // out to a -10..30 axis), which reads as a lot of dead white space
      // above/below the point cloud. Ticks are computed to look nice but
      // are clipped to this tight domain rather than the other way around.
      const yRange = yHi - yLo || 1;
      const yPad = yRange * 0.06;
      const yMin = yLo - yPad;
      const yMax = yHi + yPad;
      const ySpan = yMax - yMin || 1;
      const yTicks = niceTicks(yMin, yMax, 5).filter((t) => t >= yMin && t <= yMax);
      const xTicks = niceTicks(X_MIN, X_MAX, 6);

      const xPix = (x) => margin.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
      const yPix = (y) => margin.top + plotH - ((y - yMin) / ySpan) * plotH;

      if (!chromeless) {
        drawAxes(ctx, { margin, plotW, plotH, xTicks, yTicks, xPix, yPix, colors, fontFamily });
      }

      // residuals: thin, faint verticals from each point to the fitted line
      ctx.strokeStyle = colors.residual;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (const p of points) {
        const predicted = fit.slope * p.x + fit.intercept;
        ctx.beginPath();
        ctx.moveTo(xPix(p.x), yPix(p.y));
        ctx.lineTo(xPix(p.x), yPix(predicted));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // true line: dashed, muted -- the answer key, not the headline
      ctx.strokeStyle = colors.trueLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xPix(X_MIN), yPix(trueYAtXMin));
      ctx.lineTo(xPix(X_MAX), yPix(trueYAtXMax));
      ctx.stroke();
      ctx.setLineDash([]);

      // fitted line: solid, the site's own "you're interacting with this" accent.
      // Its own endpoints deliberately don't factor into the y-domain above
      // (see that comment) -- so at very low n this can draw partly off-canvas.
      const fitYAtXMin = fit.slope * X_MIN + fit.intercept;
      const fitYAtXMax = fit.slope * X_MAX + fit.intercept;
      ctx.strokeStyle = colors.fitLine;
      ctx.lineWidth = fitLineWidth;
      ctx.beginPath();
      ctx.moveTo(xPix(X_MIN), yPix(fitYAtXMin));
      ctx.lineTo(xPix(X_MAX), yPix(fitYAtXMax));
      ctx.stroke();

      ctx.fillStyle = colors.point;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(xPix(p.x), yPix(p.y), pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  initDemo('.regression-demo', RegressionDemo);
})();
