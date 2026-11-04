/* Gridlines, tick labels, and the L-shaped axis line -- the one visual
   element nearly every demo on the site draws, in the same style, around
   whatever it's actually plotting. Callers own their own margin/domain/
   pixel-mapping decisions (those genuinely differ: some demos clamp a
   domain, some share one square domain across both axes, some skip this
   entirely in a "chromeless" capture mode) -- this just draws what they
   hand it. */

/** @typedef {{ left: number, right: number, top: number, bottom: number }} Margin */

/** The slice of CanvasRenderingContext2D that drawAxes actually touches. */
/** @typedef {{
 *   font: string,
 *   strokeStyle: string | CanvasGradient | CanvasPattern,
 *   fillStyle: string | CanvasGradient | CanvasPattern,
 *   lineWidth: number,
 *   textAlign: CanvasTextAlign,
 *   textBaseline: CanvasTextBaseline,
 *   beginPath(): void,
 *   moveTo(x: number, y: number): void,
 *   lineTo(x: number, y: number): void,
 *   stroke(): void,
 *   fillText(text: string, x: number, y: number): void,
 * }} AxesContext */

/**
 * @param {AxesContext} ctx
 * @param {{
 *   margin: Margin,
 *   plotW: number,
 *   plotH: number,
 *   xTicks: number[],
 *   yTicks?: number[],
 *   xPix: (value: number) => number,
 *   yPix?: (value: number) => number,
 *   colors: { grid: string, axis: string, text: string },
 *   fontFamily: string,
 *   xFormat?: (value: number) => string,
 *   yFormat?: (value: number) => string,
 *   xGrid?: boolean,
 *   yGrid?: boolean,
 * }} opts
 */
export function drawAxes(ctx, opts) {
  const { margin, plotW, plotH, xTicks, yTicks = [], xPix, colors, fontFamily } = opts;
  const yPix = opts.yPix || ((v) => v);
  const xFormat = opts.xFormat || ((t) => t.toFixed(1));
  const yFormat = opts.yFormat || ((t) => t.toFixed(1));
  const xGrid = opts.xGrid !== false;
  const yGrid = opts.yGrid !== false;

  ctx.font = '14px ' + fontFamily;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.text;

  if (yTicks.length) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yTicks) {
      const yy = yPix(t);
      if (yGrid) {
        ctx.beginPath();
        ctx.moveTo(margin.left, yy);
        ctx.lineTo(margin.left + plotW, yy);
        ctx.stroke();
      }
      ctx.fillText(yFormat(t), margin.left - 6, yy);
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) {
    const xx = xPix(t);
    if (xGrid) {
      ctx.beginPath();
      ctx.moveTo(xx, margin.top);
      ctx.lineTo(xx, margin.top + plotH);
      ctx.stroke();
    }
    ctx.fillText(xFormat(t), xx, margin.top + plotH + 6);
  }

  ctx.strokeStyle = colors.axis;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();
}
