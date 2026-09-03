// Interactive persistent homology demo embedded via
// _includes/topology/persistent-homology-demo.html: n points sampled around
// a noisy circle, a disk of radius r grown around every point, and the
// resulting Vietoris-Rips complex (points -> edges when disks touch ->
// triangles when three disks mutually touch). Left panel draws the disks,
// graph edges, and filled-in triangles at the current r; right panel is the
// barcode (H0 = components merging, H1 = loops) computed once per sample via
// the standard persistence-pair reduction algorithm over GF(2) -- the same
// algorithm real TDA libraries (Ripser, GUDHI, ...) run, just restricted to
// the 2-skeleton since that's all a demo of loops needs. Hovering a bar (or
// dragging the radius slider) scrubs r on the left panel. Same
// canvas-per-frame approach and CSS-custom-property color reads as the other
// demos on this page (see regression-demo.js's own top comment for why
// canvas, not SVG, here). Canvas setup, tick generation, axis drawing, and
// the resize/mode-toggle/init wiring are shared via assets/js/demo-core;
// the filtration/reduction math below is this demo's own.

import { gaussianNoise, niceTicks, setupCanvas, readColors, drawAxes, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  const N = 24;
  const CIRCLE_RADIUS = 4;

  function samplePoints(sigma) {
    return Array.from({ length: N }, () => {
      const theta = Math.random() * 2 * Math.PI;
      const radius = CIRCLE_RADIUS + gaussianNoise() * sigma;
      return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
    });
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Standard persistence-pair reduction (Edelsbrunner-Letscher-Zomorodian):
  // walk simplices in filtration order, reduce each boundary column against
  // earlier columns sharing the same pivot ("low"). A column that empties
  // out is a birth; a column that lands on a new low pairs that low's
  // simplex with a death. Restricted here to dimensions 0-2 (vertices, edges,
  // triangles), which is all that's needed for H0/H1.
  function computeBarcode(simplices) {
    const reducedCol = new Map();
    const isLow = new Array(simplices.length).fill(false);
    const isCreator = new Array(simplices.length).fill(false);
    const pairs = [];

    for (let j = 0; j < simplices.length; j++) {
      let col = new Set(simplices[j].faces);
      for (;;) {
        if (col.size === 0) break;
        const low = Math.max(...col);
        const other = reducedCol.get(low);
        if (!other) break;
        for (const v of other) {
          if (col.has(v)) col.delete(v);
          else col.add(v);
        }
      }
      if (col.size > 0) {
        const low = Math.max(...col);
        reducedCol.set(low, col);
        isLow[low] = true;
        pairs.push({
          dim: simplices[low].dim,
          birth: simplices[low].r,
          death: simplices[j].r,
        });
      } else {
        // Boundary reduced away entirely: j creates a new class rather than
        // killing one. Only creators are candidates for an essential
        // (never-dies-within-rMax) class below -- a simplex that reduced to
        // a nonzero column above is a destroyer, already spoken for as a
        // pair's deathIdx, and must never be reconsidered here even if
        // nothing later happens to use it as a pivot.
        isCreator[j] = true;
      }
    }

    const essential = [];
    for (let i = 0; i < simplices.length; i++) {
      if (isCreator[i] && !isLow[i]) {
        essential.push({ dim: simplices[i].dim, birth: simplices[i].r });
      }
    }

    return { pairs, essential };
  }

  function buildFiltration(points, rMax) {
    const n = points.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const r = dist(points[i], points[j]) / 2;
        if (r <= rMax) edges.push({ dim: 1, r, vi: i, vj: j });
      }
    }
    const triangles = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          const r = Math.max(dist(points[i], points[j]), dist(points[j], points[k]), dist(points[i], points[k])) / 2;
          if (r <= rMax) triangles.push({ dim: 2, r, vi: i, vj: j, vk: k });
        }
      }
    }

    const combined = edges.concat(triangles);
    combined.sort((a, b) => a.r - b.r || a.dim - b.dim);

    // Global simplex list for the reduction: vertices first (index = point
    // index, born at r=0), then the sorted edges/triangles. Edge faces are
    // just their two vertex indices; triangle faces are the global indices
    // of its three edges, found via a lookup built alongside the same scan
    // (every edge a triangle needs is guaranteed to already have an index,
    // since a triangle's r is the max of its three edges' r, and ties break
    // edges-before-triangles).
    const simplices = new Array(n);
    for (let i = 0; i < n; i++) simplices[i] = { dim: 0, r: 0, faces: [] };
    const edgeIndex = new Map();
    for (const s of combined) {
      const idx = simplices.length;
      if (s.dim === 1) {
        edgeIndex.set(s.vi + ',' + s.vj, idx);
        simplices.push({ dim: 1, r: s.r, faces: [s.vi, s.vj] });
      } else {
        const eij = edgeIndex.get(s.vi + ',' + s.vj);
        const ejk = edgeIndex.get(s.vj + ',' + s.vk);
        const eik = edgeIndex.get(s.vi + ',' + s.vk);
        simplices.push({ dim: 2, r: s.r, faces: [eij, ejk, eik] });
      }
    }

    return { simplices, edges, triangles };
  }

  function fullConnectivityRadius(points) {
    const n = points.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    const order = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) order.push({ i, j, r: dist(points[i], points[j]) / 2 });
    order.sort((a, b) => a.r - b.r);
    let components = n;
    let last = 0;
    for (const e of order) {
      const ri = find(e.i);
      const rj = find(e.j);
      if (ri !== rj) {
        parent[ri] = rj;
        components--;
        last = e.r;
        if (components === 1) break;
      }
    }
    return last;
  }

  class PersistentHomologyDemo {
    constructor(root) {
      this.root = root;
      this.cloudCanvas = root.querySelector('.ph-demo-cloud');
      this.barcodeCanvas = root.querySelector('.ph-demo-barcode');
      this.regenBtn = root.querySelector('.ph-demo-regen');
      this.noiseInput = root.querySelector('.ph-demo-noise');
      this.noiseValue = root.querySelector('.ph-demo-noise-value');
      this.rInput = root.querySelector('.ph-demo-r');
      this.rValue = root.querySelector('.ph-demo-r-value');
      this.componentsOut = root.querySelector('.ph-demo-components');
      this.loopsOut = root.querySelector('.ph-demo-loops');
      this.rReadoutOut = root.querySelector('.ph-demo-r-readout');

      this.hoverR = null;
      this._barcodeGeom = null;

      this.regenBtn.addEventListener('click', () => this.regenerate());
      this.noiseInput.addEventListener('input', () => {
        this.noiseValue.textContent = Number(this.noiseInput.value).toFixed(2);
        this.regenerate();
      });
      this.rInput.addEventListener('input', () => {
        this.manualR = Number(this.rInput.value);
        this.hoverR = null;
        this.updateReadout();
        this.draw();
      });

      this.barcodeCanvas.addEventListener('mousemove', (event) => this.onBarcodeHover(event));
      this.barcodeCanvas.addEventListener('mouseleave', () => {
        this.hoverR = null;
        this.updateReadout();
        this.draw();
      });

      wireRedraw([this.cloudCanvas, this.barcodeCanvas], () => this.draw());

      this.regenerate();
    }

    activeR() {
      return this.hoverR !== null ? this.hoverR : this.manualR;
    }

    regenerate() {
      const sigma = Number(this.noiseInput.value);
      const points = samplePoints(sigma);
      const rMax = (CIRCLE_RADIUS + 3 * sigma) * 1.3;
      const { simplices, edges, triangles } = buildFiltration(points, rMax);
      const { pairs, essential } = computeBarcode(simplices);

      this.points = points;
      this.edges = edges;
      this.triangles = triangles;
      this.rMax = rMax;
      this.rFull = fullConnectivityRadius(points);

      const bars = pairs
        .map((p) => ({ dim: p.dim, birth: p.birth, death: p.death, essential: false }))
        .concat(essential.map((e) => ({ dim: e.dim, birth: e.birth, death: rMax, essential: true })));
      this.h0Bars = bars.filter((b) => b.dim === 0).sort((a, b) => b.death - b.birth - (a.death - a.birth));
      this.h1Bars = bars.filter((b) => b.dim === 1).sort((a, b) => b.death - b.birth - (a.death - a.birth));

      this.h0DeathRs = this.h0Bars.filter((b) => !b.essential).map((b) => b.death);
      this.h1BirthRs = bars.filter((b) => b.dim === 1).map((b) => b.birth);
      this.h1DeathRs = this.h1Bars.filter((b) => !b.essential).map((b) => b.death);

      this.manualR = 0;
      this.hoverR = null;
      this.rInput.min = '0';
      this.rInput.max = String(rMax);
      this.rInput.step = String(rMax / 500);
      this.rInput.value = '0';

      this.updateReadout();
      this.draw();
    }

    updateReadout() {
      const r = this.activeR();
      const components = N - this.h0DeathRs.filter((d) => d <= r).length;
      const loops = this.h1BirthRs.filter((b) => b <= r).length - this.h1DeathRs.filter((d) => d <= r).length;
      this.rValue.textContent = r.toFixed(2);
      this.rReadoutOut.textContent = r.toFixed(2);
      this.componentsOut.textContent = String(components);
      this.loopsOut.textContent = String(loops);
    }

    draw() {
      this.drawCloud();
      this.drawBarcode();
    }

    colors() {
      return readColors(this.root, {
        point: '--ph-point',
        edge: '--ph-edge',
        disk: '--ph-disk',
        triangle: '--ph-triangle',
        barH0: '--ph-bar-h0',
        barH1: '--ph-bar-h1',
        guide: '--ph-guide',
        axis: '--ph-axis',
        grid: '--ph-grid',
        text: '--ph-text',
      });
    }

    drawCloud() {
      const setup = setupCanvas(this.cloudCanvas);
      if (!setup || !this.points) return;
      const { ctx, rect } = setup;
      const colors = this.colors();
      const r = this.activeR();

      const margin = 12;
      const extent = CIRCLE_RADIUS + 3 * Number(this.noiseInput.value) + 0.5 || CIRCLE_RADIUS + 0.5;
      const size = Math.min(rect.width, rect.height) - margin * 2;
      const scale = size / (2 * extent);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const px = (p) => cx + p.x * scale;
      const py = (p) => cy - p.y * scale;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, rect.width, rect.height);
      ctx.clip();

      ctx.fillStyle = colors.triangle;
      ctx.globalAlpha = 0.3;
      for (const t of this.triangles) {
        if (t.r > r) continue;
        ctx.beginPath();
        ctx.moveTo(px(this.points[t.vi]), py(this.points[t.vi]));
        ctx.lineTo(px(this.points[t.vj]), py(this.points[t.vj]));
        ctx.lineTo(px(this.points[t.vk]), py(this.points[t.vk]));
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = colors.disk;
      ctx.globalAlpha = 0.14;
      for (const p of this.points) {
        ctx.beginPath();
        ctx.arc(px(p), py(p), Math.max(r * scale, 0), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1;
      for (const e of this.edges) {
        if (e.r > r) continue;
        ctx.beginPath();
        ctx.moveTo(px(this.points[e.vi]), py(this.points[e.vi]));
        ctx.lineTo(px(this.points[e.vj]), py(this.points[e.vj]));
        ctx.stroke();
      }

      ctx.fillStyle = colors.point;
      for (const p of this.points) {
        ctx.beginPath();
        ctx.arc(px(p), py(p), 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    drawBarcode() {
      const setup = setupCanvas(this.barcodeCanvas);
      if (!setup || !this.h0Bars) return;
      const { ctx, rect } = setup;
      const colors = this.colors();
      const fontFamily = getComputedStyle(this.root).fontFamily;
      const rMax = this.rMax;
      const activeR = this.activeR();

      const margin = { left: 30, right: 14, top: 18, bottom: 44 };
      const plotW = rect.width - margin.left - margin.right;
      const plotH = rect.height - margin.top - margin.bottom;
      const xPix = (r) => margin.left + (r / rMax) * plotW;

      const rows = this.h0Bars.map((b) => ({ ...b, group: 0 })).concat(this.h1Bars.map((b) => ({ ...b, group: 1 })));
      const rowH = rows.length > 0 ? plotH / rows.length : plotH;

      this._barcodeGeom = { margin, plotW, rMax };

      const xTicks = niceTicks(0, rMax, 5);
      drawAxes(ctx, { margin, plotW, plotH, xTicks, xPix, colors, fontFamily });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.text;
      ctx.fillText('radius (r)', margin.left + plotW / 2, margin.top + plotH + 40);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.text;
      const h0Bottom = this.h0Bars.length * rowH;
      if (this.h0Bars.length > 0) ctx.fillText('H₀', 2, margin.top + Math.min(h0Bottom, plotH) * 0.5 + 3);
      if (this.h1Bars.length > 0) ctx.fillText('H₁', 2, margin.top + h0Bottom + (plotH - h0Bottom) * 0.5 + 3);

      const barThickness = Math.max(Math.min(rowH * 0.7, 10), 2);
      rows.forEach((b, i) => {
        const y0 = margin.top + i * rowH;
        const yc = y0 + rowH / 2;
        const x0 = xPix(b.birth);
        const x1 = b.essential ? margin.left + plotW : xPix(b.death);
        ctx.fillStyle = b.group === 0 ? colors.barH0 : colors.barH1;
        ctx.globalAlpha = activeR >= b.birth && activeR <= (b.essential ? rMax : b.death) ? 1 : 0.55;
        ctx.fillRect(x0, yc - barThickness / 2, Math.max(x1 - x0, 1.5), barThickness);
        if (b.essential) {
          ctx.beginPath();
          ctx.moveTo(x1, yc - barThickness);
          ctx.lineTo(x1 + 6, yc);
          ctx.lineTo(x1, yc + barThickness);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });

      if (rows.length > 0) {
        const gx = xPix(activeR);
        ctx.strokeStyle = colors.guide;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(gx, margin.top);
        ctx.lineTo(gx, margin.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    onBarcodeHover(event) {
      const geom = this._barcodeGeom;
      if (!geom) return;
      const rect = this.barcodeCanvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const frac = geom.plotW > 0 ? (mx - geom.margin.left) / geom.plotW : 0;
      this.hoverR = Math.min(Math.max(frac, 0), 1) * geom.rMax;
      this.updateReadout();
      this.draw();
    }
  }

  initDemo('.ph-demo', PersistentHomologyDemo);
})();
