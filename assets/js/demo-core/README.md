# demo-core

Shared canvas/math primitives behind the interactive demos on [samlowe.dev](https://samlowe.dev)'s math articles: DPR-aware canvas setup, CSS-custom-property theming, nice tick generation, OLS fitting, axis rendering, and the resize/mode-toggle/init wiring every demo repeats.

```js
import { setupCanvas, readColors, niceTicks, drawAxes, wireRedraw, initDemo } from 'demo-core';

class SomeDemo {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    wireRedraw(this.canvas, () => this.draw());
    this.draw();
  }

  draw() {
    const setup = setupCanvas(this.canvas);
    if (!setup) return;
    const { ctx, rect } = setup;
    const colors = readColors(this.root, { point: '--demo-point', axis: '--demo-axis', grid: '--demo-grid', text: '--demo-text' });

    // ...compute margin/plotW/plotH/xPix/yPix for what you're actually plotting...

    drawAxes(ctx, { margin, plotW, plotH, xTicks: niceTicks(0, 10, 6), yTicks: niceTicks(0, 1, 5), xPix, yPix, colors, fontFamily: getComputedStyle(this.root).fontFamily });
  }
}

initDemo('.some-demo', SomeDemo);
```

## What this is (and isn't)

This covers the boring, genuinely generic 5%: canvas DPR handling, reading a demo's own CSS custom properties, tick generation, drawing gridlines/tick labels/an axis line, wiring resize + the site's dark/light/OLED mode-toggle event, and the "construct once per matching element" init boilerplate.

It does **not** cover each demo's actual content: sampling/generation models, curve fitting beyond plain OLS (ridge, polynomial, or anything else domain-specific), or any bespoke geometry a particular demo draws. Those legitimately differ per demo and stay in the demo's own file.

## API

See [`src/index.js`](src/index.js) for the full surface:

- `setupCanvas(canvas)` — sizes a canvas for the current `devicePixelRatio`, clears it, returns `{ ctx, rect }` (or `null` if the canvas is currently zero-size — bail out of `draw()` in that case).
- `readColors(root, spec)` — reads a set of `--custom-property` values off `root` into a plain object.
- `niceTicks(lo, hi, count)` — ~`count` evenly-spaced, human-readable tick values covering `[lo, hi]`.
- `gaussianNoise()` — one standard-normal sample (Box-Muller).
- `mean(xs)`, `std(xs)` — arithmetic mean and population standard deviation.
- `fitLine(points)`, `rSquared(points, fit)` — ordinary least squares (closed form, single predictor) and its coefficient of determination.
- `drawAxes(ctx, opts)` — gridlines, tick labels, and the axis line.
- `wireRedraw(canvases, onRedraw)` — resize + mode-toggle wiring for one or more canvases.
- `initDemo(selector, DemoClass)` — constructs `DemoClass` once per matching element, DOM-ready-safe.

## Testing

```
npm test
```

## License

demo-core is licensed under the [MIT license](LICENSE).
