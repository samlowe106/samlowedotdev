/* DOM wiring every demo repeats: redraw on resize, redraw on the site's
   light/dark/OLED mode-toggle flip (posted as a 'message' event with
   direction: 'mode-toggle'), and the "run once per matching element,
   whenever the DOM is ready" init dance. */

/**
 * Wires one or more canvases to redraw on resize, and wires the whole page
 * to redraw on a mode-toggle flip. Does not draw anything itself -- call
 * `onRedraw()` once yourself after wiring, same as every demo already does
 * at the end of its own constructor.
 * @param {HTMLCanvasElement | HTMLCanvasElement[]} canvases
 * @param {() => void} onRedraw
 */
export function wireRedraw(canvases, onRedraw) {
  const list = Array.isArray(canvases) ? canvases : [canvases];
  const ro = new ResizeObserver(() => onRedraw());
  for (const canvas of list) ro.observe(canvas);

  window.addEventListener('message', (event) => {
    if (event.data && event.data.direction === 'mode-toggle') {
      requestAnimationFrame(() => onRedraw());
    }
  });
}

/**
 * Constructs `DemoClass` once for every element matching `selector`,
 * currently in the DOM or as soon as it's ready -- and never twice for the
 * same element (matters because this can run before or after
 * DOMContentLoaded depending on script placement).
 * @param {string} selector
 * @param {new (el: Element) => unknown} DemoClass
 */
export function initDemo(selector, DemoClass) {
  const initialized = new WeakSet();
  function run() {
    document.querySelectorAll(selector).forEach((el) => {
      if (initialized.has(el)) return;
      initialized.add(el);
      new DemoClass(el);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
