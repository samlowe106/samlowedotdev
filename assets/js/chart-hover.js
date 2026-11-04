/* Hover crosshair for the inline-SVG charts in fetch-recession-data.py and
   fetch-labor-breakdown-data.py: every `svg.chart-interactive` is followed
   by a `<script type="application/json" class="chart-hover-data">` sibling
   holding that chart's own point list (pixel x, optionally pixel y, and the
   1-3 lines of text to show for that point). On mousemove this finds the
   nearest point by x, then moves one pre-rendered crosshair group (a line,
   an optional dot, a background rect, and a fixed number of <tspan> label
   lines already sized into the chart by the Python side) to match --
   nothing is created or destroyed per hover, just a handful of attributes
   updated, so this stays cheap even on the labor chart's ~170 points.

   Kept out of the two Python scripts' own SCSS-classes-only philosophy on
   purpose: reading the live cursor position and finding the nearest point
   genuinely needs JS, there's no CSS-only way to do it smoothly (a CSS
   sibling-hover trick can only snap between pre-rendered hit zones, which
   would mean ~170 extra DOM nodes and CSS rules for the labor chart alone).
   Everything else about these charts is still static, colorless-in-markup
   SVG per their own files' comments -- this only ever repositions elements,
   never sets a fill/stroke color, so light/dark/OLED theming still lives
   entirely in _recession.scss/_labor-breakdown.scss. */
(function () {
  function nearestPoint(points, px) {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].x < px) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(points[lo - 1].x - px) < Math.abs(points[lo].x - px)) lo -= 1;
    return points[lo];
  }

  function svgX(svg, clientX) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const frac = rect.width ? (clientX - rect.left) / rect.width : 0;
    return vb.x + Math.min(Math.max(frac, 0), 1) * vb.width;
  }

  function initChart(svg) {
    const dataEl = svg.nextElementSibling;
    if (!dataEl || dataEl.tagName !== "SCRIPT") return;
    let data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }
    const points = data.points;
    if (!points || !points.length) return;

    const crosshair = svg.querySelector(".chart-crosshair");
    const line = svg.querySelector(".chart-crosshair-line");
    const dot = svg.querySelector(".chart-crosshair-dot");
    const labelBg = svg.querySelector(".chart-crosshair-label-bg");
    const label = svg.querySelector(".chart-crosshair-label");
    const labelLines = svg.querySelectorAll(".chart-crosshair-label-line");
    if (!crosshair || !line || !label) return;

    const midX = (data.x0 + data.x1) / 2;

    function update(clientX) {
      const p = nearestPoint(points, svgX(svg, clientX));
      line.setAttribute("x1", p.x);
      line.setAttribute("x2", p.x);
      if (dot) {
        if (p.y != null) {
          dot.setAttribute("cx", p.x);
          dot.setAttribute("cy", p.y);
          dot.style.display = "";
        } else {
          dot.style.display = "none";
        }
      }

      // Anchor away from whichever edge the point is closest to, so the
      // label never runs past the chart's own left/right bounds (SVG
      // overflow is hidden by default -- see the two Python files' own
      // axis-label comments for the same issue there).
      const anchor = p.x < midX ? "start" : "end";
      labelLines.forEach((tspan, i) => {
        tspan.textContent = (p.lines && p.lines[i]) || "";
        tspan.setAttribute("x", p.x);
        tspan.setAttribute("text-anchor", anchor);
      });

      if (labelBg) {
        // getBBox() gives the label's real rendered size -- unlike the
        // Python side (no font metrics available at build time), the
        // browser actually knows this, so the background box fits exactly
        // instead of being character-count-estimated.
        const bbox = label.getBBox();
        labelBg.setAttribute("x", bbox.x - 4);
        labelBg.setAttribute("y", bbox.y - 3);
        labelBg.setAttribute("width", bbox.width + 8);
        labelBg.setAttribute("height", bbox.height + 6);
      }

      crosshair.classList.add("is-active");
    }

    function hide() {
      crosshair.classList.remove("is-active");
    }

    svg.addEventListener("mousemove", (e) => update(e.clientX));
    svg.addEventListener("mouseenter", (e) => update(e.clientX));
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches[0]) update(e.touches[0].clientX);
      },
      { passive: true }
    );
    svg.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches[0]) update(e.touches[0].clientX);
      },
      { passive: true }
    );
    svg.addEventListener("touchend", hide);
  }

  function init() {
    document.querySelectorAll("svg.chart-interactive").forEach(initChart);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
