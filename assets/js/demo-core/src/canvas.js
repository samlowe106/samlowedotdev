/* Canvas setup and CSS-custom-property theming, the two bits of plumbing
   every demo on the site repeats verbatim regardless of what it draws.
   Colors are read fresh on every draw() call rather than cached, so a
   demo re-themes correctly across light/dark/OLED (and on a mode-toggle
   flip, see interaction.js) without regenerating any data. */

/** @typedef {{ ctx: CanvasRenderingContext2D, rect: DOMRect }} CanvasSetup */

/**
 * Sizes a canvas's backing store for the current devicePixelRatio, clears
 * it, and returns a 2D context already scaled so drawing code can work in
 * CSS pixels. Returns null (and does nothing) if the canvas is currently
 * zero-size -- callers should bail out of their draw() early in that case,
 * same as every other zero-size guard on the site (see e.g. the carousel
 * init's own comment on why this beats a debounce/dispatched-event dance).
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasSetup | null}
 */
export function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, rect };
}

/**
 * Reads a set of CSS custom properties off `root` into a plain object,
 * trimmed. `spec` maps the key you want back to the `--custom-property`
 * name to read; pass `_fontFamily: true` in spec (or just read
 * `getComputedStyle(root).fontFamily` yourself) if you also need the font.
 * @param {Element} root
 * @param {Record<string, string>} spec
 * @returns {Record<string, string>}
 */
export function readColors(root, spec) {
  const rootStyle = getComputedStyle(root);
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of Object.keys(spec)) {
    out[key] = rootStyle.getPropertyValue(spec[key]).trim();
  }
  return out;
}
