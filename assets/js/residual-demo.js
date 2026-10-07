// Interactive residual-analysis demo embedded via _includes/residual-demo.html:
// a fixed sample size (n = 100, not adjustable -- this demo isolates noise
// as the one variable, unlike assets/js/regression-demo.js where sample
// size is itself the thing being explored) fit with OLS, drawn next to a
// live histogram of that fit's own residuals plus a Gaussian reference
// curve at the residuals' own mean/std. Same canvas-per-frame approach and
// CSS-custom-property color reads as the other demos on this page (see
// regression-demo.js's own top comment for why canvas, not SVG, here).

import { gaussianNoise, mean, std, fitLine, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  const N = 100;
  const SLOPE = 2;
  const INTERCEPT = 3;
  const X_MIN = 0;
  const X_MAX = 10;

  function samplePoint(sigma) {
    const x = X_MIN + Math.random() * (X_MAX - X_MIN);
    return { x, y: SLOPE * x + INTERCEPT + gaussianNoise() * sigma };
  }

  class ResidualDemo {
    constructor(root) {
      this.root = root;
      this.scatterCanvas = root.querySelector('.residual-demo-scatter');
      this.histCanvas = root.querySelector('.residual-demo-hist');
      this.regenBtn = root.querySelector('.residual-demo-regen');
      this.noiseInput = root.querySelector('.residual-demo-noise');
      this.noiseValue = root.querySelector('.residual-demo-noise-value');
      this.meanOut = root.querySelector('.residual-demo-mean');
      this.stdOut = root.querySelector('.residual-demo-std');

      this.regenBtn.addEventListener('click', () => this.regenerate());
      this.noiseInput.addEventListener('input', () => {
        this.noiseValue.textContent = Number(this.noiseInput.value).toFixed(1);
        this.regenerate();
      });

      wireRedraw([this.scatterCanvas, this.histCanvas], () => this.draw());

      this.regenerate();
    }

    regenerate() {
      const sigma = Number(this.noiseInput.value);
      this.points = Array.from({ length: N }, () => samplePoint(sigma));
      this.draw();
    }

    draw() {
      this.drawScatter();
      this.drawHistogram();
    }

    colors() {
      return readColors(this.root, {
        point: '--residual-point',
        fitLine: '--residual-fit-line',
        residual: '--residual-line',
        bar: '--residual-bar',
        gaussian: '--residual-gaussian',
        axis: '--residual-axis',
        grid: '--residual-grid',
        text: '--residual-text',
      });
    }

    drawScatter() {
      const setup = setupCanvas(this.scatterCanvas);
      if (!setup || !this.points) return;
      const { ctx, rect } = setup;
      const colors = this.colors();
      const fontFamily = getComputedStyle(this.root).fontFamily;
      const points = this.points;
      const fit = fitLine(points);

      const margin = { left: 40, right: 12, top: 12, bottom: 26 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;

      const ys = points.map((p) => p.y);
      const fitY0 = fit.slope * X_MIN + fit.intercept;
      const fitY1 = fit.slope * X_MAX + fit.intercept;
      const yLoRaw = Math.min(...ys, fitY0, fitY1);
      const yHiRaw = Math.max(...ys, fitY0, fitY1);
      const yTicks = niceTicks(yLoRaw, yHiRaw, 5);
      const yLo = Math.min(yLoRaw, yTicks[0]);
      const yHi = Math.max(yHiRaw, yTicks[yTicks.length - 1]);
      const ySpan = yHi - yLo || 1;
      const xTicks = niceTicks(X_MIN, X_MAX, 6);

      const xPix = (x) => margin.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
      const yPix = (y) => margin.top + plotH - ((y - yLo) / ySpan) * plotH;

      drawAxes(ctx, { margin, plotW, plotH, xTicks, yTicks, xPix, yPix, colors, fontFamily, xGrid: false });

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

      ctx.strokeStyle = colors.fitLine;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xPix(X_MIN), yPix(fitY0));
      ctx.lineTo(xPix(X_MAX), yPix(fitY1));
      ctx.stroke();

      ctx.fillStyle = colors.point;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(xPix(p.x), yPix(p.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      this._residuals = points.map((p) => p.y - (fit.slope * p.x + fit.intercept));
    }

    drawHistogram() {
      const setup = setupCanvas(this.histCanvas);
      if (!setup || !this._residuals) return;
      const { ctx, rect } = setup;
      const colors = this.colors();
      const fontFamily = getComputedStyle(this.root).fontFamily;
      const residuals = this._residuals;

      const m = mean(residuals);
      const s = std(residuals) || 1e-6;
      this.meanOut.textContent = m.toFixed(3);
      this.stdOut.textContent = s.toFixed(3);

      const maxAbs = Math.max(...residuals.map((r) => Math.abs(r)), 1e-6) * 1.15;
      const binCount = 14;
      const binWidth = (2 * maxAbs) / binCount;
      const counts = new Array(binCount).fill(0);
      for (const r of residuals) {
        let idx = Math.floor((r + maxAbs) / binWidth);
        idx = Math.min(Math.max(idx, 0), binCount - 1);
        counts[idx]++;
      }
      const maxCount = Math.max(...counts, 1);

      const margin = { left: 34, right: 12, top: 12, bottom: 26 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;

      const xLo = -maxAbs;
      const xHi = maxAbs;
      const xTicks = niceTicks(xLo, xHi, 5);
      const yTicks = niceTicks(0, maxCount, 4);
      const yHi = Math.max(maxCount, yTicks[yTicks.length - 1]);

      const xPix = (x) => margin.left + ((x - xLo) / (xHi - xLo)) * plotW;
      const yPix = (c) => margin.top + plotH - (c / yHi) * plotH;

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
        xGrid: false,
        yFormat: (t) => String(Math.round(t)),
      });

      ctx.fillStyle = colors.bar;
      for (let i = 0; i < binCount; i++) {
        const binLo = xLo + i * binWidth;
        const binHi = binLo + binWidth;
        const x0 = xPix(binLo);
        const x1 = xPix(binHi);
        const y0 = yPix(counts[i]);
        const yBase = yPix(0);
        ctx.fillRect(x0 + 1, y0, x1 - x0 - 2, yBase - y0);
      }

      // Gaussian reference curve at the residuals' own mean/std, scaled so
      // its area matches the histogram's total count -- lets a reader
      // compare the actual bar heights against "what a clean Gaussian would
      // look like here" directly, the comparison the article's prose asks
      // for.
      const totalArea = residuals.length * binWidth;
      ctx.strokeStyle = colors.gaussian;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const x = xLo + (i / steps) * (xHi - xLo);
        const density = (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - m) ** 2) / (2 * s * s));
        const y = density * totalArea;
        const px = xPix(x);
        const py = yPix(y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  initDemo('.residual-demo', ResidualDemo);
})();
