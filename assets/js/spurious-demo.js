// "Generate new" spurious-fit demo embedded via _includes/spurious-demo.html:
// X and Y are drawn *independently* -- two separate Gaussian draws, neither
// built from the other -- so by construction there's no relationship for
// OLS to find. It fits one anyway, every time. The point isn't the fitted
// slope itself (it wobbles around 0 sample to sample, as it should); it's
// that a fitted line and a plausible-sounding R^2 come out regardless,
// which is exactly why "a regression found *a* line" isn't by itself
// evidence of a real relationship -- the motivation for the regression
// validation techniques the article covers right after this demo.
//
// X and Y deliberately do NOT share a sigma (0.25 vs 1.5 below). With n
// fixed, Var(slope-hat) ~ Var(Y) / (n * Var(X)) for OLS on pure noise: a
// narrow X pushes that denominator toward zero, so the fitted slope swings
// wildly from one "Generate new" to the next even at a largish, stable-
// looking n=100 -- the fluctuation this demo exists to show doesn't require
// a small sample, just an ill-conditioned one. Equal sigmas (the original
// version of this demo) made the wobble subtle enough at n=100 that the
// point didn't read visually.
//
// The sampling model here is deliberately its own thing, not shared with
// regression-demo.js (independent X/Y, no true line to draw) -- but the
// canvas/tick/axis/OLS plumbing around it is exactly demo-core's job, see
// assets/js/demo-core.

import { gaussianNoise, fitLine, rSquared, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  const N = 100;
  const MU = 0;
  const SIGMA_X = 0.25;
  const SIGMA_Y = 1.5;

  function samplePoint() {
    // Two independent draws -- Y is not a function of X in any way, unlike
    // every other demo on this page.
    return { x: MU + gaussianNoise() * SIGMA_X, y: MU + gaussianNoise() * SIGMA_Y };
  }

  class SpuriousDemo {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('.spurious-demo-canvas');
      this.regenBtn = root.querySelector('.spurious-demo-regen');
      this.fitEq = root.querySelector('.spurious-demo-fit-eq');
      this.r2 = root.querySelector('.spurious-demo-r2');

      this.regenBtn.addEventListener('click', () => this.regenerate());
      wireRedraw(this.canvas, () => this.draw());

      this.regenerate();
    }

    regenerate() {
      this.points = Array.from({ length: N }, () => samplePoint());
      this.draw();
    }

    draw() {
      const setup = setupCanvas(this.canvas);
      if (!setup || !this.points) return;
      const { ctx, rect } = setup;

      const colors = readColors(this.root, {
        point: '--spurious-point',
        fitLine: '--spurious-fit-line',
        axis: '--spurious-axis',
        grid: '--spurious-grid',
        text: '--spurious-text',
      });
      const fontFamily = getComputedStyle(this.root).fontFamily;

      const points = this.points;
      const fit = fitLine(points);
      const r2 = rSquared(points, fit);
      this.fitEq.textContent = `y = ${fit.slope.toFixed(2)}x + ${fit.intercept.toFixed(2)}`;
      this.r2.textContent = r2.toFixed(3);

      const margin = { left: 40, right: 14, top: 14, bottom: 30 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;

      // One square domain shared by both axes (padded out from whichever
      // axis needs more room), not a separate best-fit domain per axis --
      // X's narrow spread should actually look narrow next to Y's, which is
      // the honest picture of why the fit is unstable here. Rescaling each
      // axis independently to fill the plot would hide that and make the
      // cloud look like a round, equally-spread blob it isn't.
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const lo = Math.min(...xs, ...ys);
      const hi = Math.max(...xs, ...ys);
      const pad = (hi - lo || 1) * 0.12;
      const domainLo = lo - pad;
      const domainHi = hi + pad;
      const span = domainHi - domainLo || 1;

      const ticks = niceTicks(domainLo, domainHi, 5).filter((t) => t >= domainLo && t <= domainHi);

      const xPix = (x) => margin.left + ((x - domainLo) / span) * plotW;
      const yPix = (y) => margin.top + plotH - ((y - domainLo) / span) * plotH;

      drawAxes(ctx, { margin, plotW, plotH, xTicks: ticks, yTicks: ticks, xPix, yPix, colors, fontFamily });

      const fitYAtLo = fit.slope * domainLo + fit.intercept;
      const fitYAtHi = fit.slope * domainHi + fit.intercept;
      ctx.strokeStyle = colors.fitLine;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xPix(domainLo), yPix(fitYAtLo));
      ctx.lineTo(xPix(domainHi), yPix(fitYAtHi));
      ctx.stroke();

      ctx.fillStyle = colors.point;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(xPix(p.x), yPix(p.y), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  initDemo('.spurious-demo', SpuriousDemo);
})();
