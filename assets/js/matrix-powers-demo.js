// Iterated matrix-vector multiplication demo, embedded via
// _includes/ergodic-theorem/matrix-powers-demo.html (one include per case;
// its data-case attribute picks which entry of CASES below it draws).
// Animates x, Ax, A^2 x, ... in R^2, 3b1b-style, with A's real eigenlines
// dashed, looping while the demo is on screen.
//
// Between A^k and A^{k+1} the vector moves along A^{k+t}: the fractional
// power P D^t P^{-1} for the positive-eigenvalue cases and S R(t theta) S^{-1}
// for the rotation-like one, so decay and rotation look smooth rather than
// cutting straight across. The flip case has eigenvalue -1, which has no
// real fractional power, so it falls back to the straight-line interpolation
// A^k ((1 - t) I + t A), passing through a singular matrix halfway (the
// vector crosses the eigenvalue-1 line).
//
// This replaced a matplotlib -> animated webp version of the same four
// animations: those came to 160-270 KB each and still looked soft on HiDPI
// screens, where a canvas drawn at devicePixelRatio is sharp for free.

import { setupCanvas, readColors, wireRedraw, initDemo } from './demo-core/src/index.js';

(function () {
  // 2x2 matrices are [[a, b], [c, d]], vectors [x, y].
  const I = [
    [1, 0],
    [0, 1],
  ];

  function mul(M, N) {
    return [
      [M[0][0] * N[0][0] + M[0][1] * N[1][0], M[0][0] * N[0][1] + M[0][1] * N[1][1]],
      [M[1][0] * N[0][0] + M[1][1] * N[1][0], M[1][0] * N[0][1] + M[1][1] * N[1][1]],
    ];
  }

  function apply(M, v) {
    return [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
  }

  function inv(M) {
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    return [
      [M[1][1] / det, -M[0][1] / det],
      [-M[1][0] / det, M[0][0] / det],
    ];
  }

  function lerpMat(M, N, t) {
    return M.map((row, i) => row.map((m, j) => m + (N[i][j] - m) * t));
  }

  function power(A, k) {
    let M = I;
    for (let i = 0; i < k; i++) M = mul(M, A);
    return M;
  }

  // A = P diag(lambda) P^{-1} from eigenpairs; `frac` is A^t for real t
  // (needs every eigenvalue positive).
  function fromEigen(eig) {
    const P = [
      [eig[0].v[0], eig[1].v[0]],
      [eig[0].v[1], eig[1].v[1]],
    ];
    const Pinv = inv(P);
    const frac = (t) =>
      mul(
        mul(P, [
          [eig[0].lam ** t, 0],
          [0, eig[1].lam ** t],
        ]),
        Pinv,
      );
    return { A: frac(1), frac };
  }

  // A = S R(theta) S^{-1}: similar to a rotation, eigenvalues e^{+-i theta},
  // no real eigenvectors. A^t = S R(t theta) S^{-1}.
  function fromRotation(S, theta) {
    const Sinv = inv(S);
    const frac = (t) =>
      mul(
        mul(S, [
          [Math.cos(t * theta), -Math.sin(t * theta)],
          [Math.sin(t * theta), Math.cos(t * theta)],
        ]),
        Sinv,
      );
    return { A: frac(1), frac };
  }

  const CASES = {
    // A column-stochastic matrix, [[0.9, 0.2], [0.1, 0.8]]: the 0.7
    // component decays and A^k x settles on x*.
    converge: {
      eig: [
        { lam: 1, v: [2, 1] },
        { lam: 0.7, v: [1, -1] },
      ],
      x: [0.1, 0.9],
      steps: 10,
      showLimit: true,
    },
    // Same eigenlines; |A^k x| blows up but its direction converges.
    grow: {
      eig: [
        { lam: 1.2, v: [2, 1] },
        { lam: 0.6, v: [1, -1] },
      ],
      x: [-0.5, 1.5],
      steps: 8,
    },
    // [[0, 1], [1, 0]], the periodic two-state chain: eigenvalues 1 and -1
    // tie in modulus, so A^k x hops back and forth forever.
    flip: {
      eig: [
        { lam: 1, v: [1, 1] },
        { lam: -1, v: [1, -1] },
      ],
      x: [0.8, 0.2],
      steps: 8,
      linear: true,
    },
    // Circles an ellipse forever.
    rotate: {
      rotation: { S: [[1, 0.6], [0, 0.7]], theta: 0.6 },
      x: [1, 0],
      steps: 12,
    },
  };

  const HOLD_MS = 400; // resting on each integer k
  const MORPH_MS = 700; // moving from A^k x to A^{k+1} x
  const END_HOLD_MS = 2200;
  const MATH_FONT = "'Times New Roman', Times, serif";

  function smoothstep(x) {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
  }

  function niceStep(raw) {
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
    return 10 * mag;
  }

  function fmt(v) {
    return (v < 0 ? '−' : '') + String(Math.abs(v));
  }

  // Distance along unit pixel direction d from p to the edge of box
  // [x0, x1] x [y0, y1], or 0 if p isn't inside it.
  function rayExit(p, d, box) {
    const [x0, x1, y0, y1] = box;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return 0;
    const ts = [];
    if (d[0] > 1e-9) ts.push((x1 - p[0]) / d[0]);
    if (d[0] < -1e-9) ts.push((x0 - p[0]) / d[0]);
    if (d[1] > 1e-9) ts.push((y1 - p[1]) / d[1]);
    if (d[1] < -1e-9) ts.push((y0 - p[1]) / d[1]);
    return ts.length ? Math.min(...ts) : 0;
  }

  // Draws a run of math-ish text: parts are { t, it?, sup?, sub? }, baseline
  // at y, anchored at x per align. Baseline-anchored on purpose, so x, Ax
  // and A^k x (no capital / capital / superscript) sit on one line.
  function mathFont(p, size) {
    return `${p.it ? 'italic ' : ''}${p.sup || p.sub ? size * 0.7 : size}px ${MATH_FONT}`;
  }

  function mathWidths(ctx, parts, size) {
    return parts.map((p) => {
      ctx.font = mathFont(p, size);
      return ctx.measureText(p.t).width + (p.sup ? size * 0.06 : 0);
    });
  }

  function drawMath(ctx, parts, x, y, size, color, align) {
    const font = (p) => mathFont(p, size);
    const widths = mathWidths(ctx, parts, size);
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    parts.forEach((p, i) => {
      ctx.font = font(p);
      const dy = p.sup ? -0.42 * size : p.sub ? 0.22 * size : 0;
      ctx.fillText(p.t, cx + (p.sup ? size * 0.06 : 0), y + dy);
      cx += widths[i];
    });
  }

  class MatrixPowersDemo {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('.matrix-powers-demo-canvas');

      const spec = CASES[root.dataset.case];
      if (!spec) {
        console.error(`matrix-powers-demo: unknown case "${root.dataset.case}"`);
        return;
      }
      const built = spec.rotation ? fromRotation(spec.rotation.S, spec.rotation.theta) : fromEigen(spec.eig);
      this.spec = spec;
      this.A = built.A;
      this.frac = spec.linear ? (t) => lerpMat(I, this.A, t) : built.frac;
      this.powers = Array.from({ length: spec.steps + 1 }, (_, k) => power(this.A, k));
      this.iterates = this.powers.map((M) => apply(M, spec.x));
      this.view = this.computeView();

      this.cycleMs = spec.steps * (HOLD_MS + MORPH_MS) + END_HOLD_MS;
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Reduced motion: a still picture of the final state, never animated.
      this.elapsed = this.reduceMotion ? spec.steps * (HOLD_MS + MORPH_MS) : 0;
      this.playing = !this.reduceMotion;
      this.visible = false;
      this.rafId = null;
      this.lastTs = null;

      new IntersectionObserver(
        (entries) => {
          this.visible = entries[0].isIntersecting;
          this.update();
        },
        { threshold: 0.25 },
      ).observe(root);
      wireRedraw(this.canvas, () => this.draw());

      this.update();
    }

    // M(s), the matrix carrying the plane at real time s in [0, steps].
    matrixAt(s) {
      const k = Math.min(Math.floor(s), this.spec.steps);
      const t = s - k;
      return t > 0 ? mul(this.powers[k], this.frac(t)) : this.powers[k];
    }

    // Square view (the canvas is square) around the origin and the whole
    // path, fixed for the whole loop so nothing rescales mid-animation.
    computeView() {
      const pts = [[0, 0]];
      for (let i = 0; i <= 200; i++) pts.push(apply(this.matrixAt((i / 200) * this.spec.steps), this.spec.x));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const lo = [Math.min(...xs), Math.min(...ys)];
      const hi = [Math.max(...xs), Math.max(...ys)];
      const half = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * 0.68;
      const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
      return { x0: c[0] - half, x1: c[0] + half, y0: c[1] - half, y1: c[1] + half };
    }

    // Time along the loop -> s, holding on each integer k before moving on.
    timeToS(ms) {
      const per = HOLD_MS + MORPH_MS;
      const k = Math.floor(ms / per);
      if (k >= this.spec.steps) return this.spec.steps;
      const within = ms - k * per;
      return within < HOLD_MS ? k : k + smoothstep((within - HOLD_MS) / MORPH_MS);
    }

    update() {
      const shouldRun = this.playing && this.visible;
      if (shouldRun && this.rafId === null) {
        this.lastTs = null;
        this.rafId = requestAnimationFrame((ts) => this.tick(ts));
      } else if (!shouldRun && this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.draw();
    }

    tick(ts) {
      if (this.lastTs !== null) this.elapsed = (this.elapsed + ts - this.lastTs) % this.cycleMs;
      this.lastTs = ts;
      this.draw();
      this.rafId = requestAnimationFrame((t) => this.tick(t));
    }

    colors() {
      return readColors(this.root, {
        vector: '--mp-vector',
        eigen1: '--mp-eigen-1',
        eigen2: '--mp-eigen-2',
        axis: '--mp-axis',
        grid: '--mp-grid',
        text: '--mp-text',
      });
    }

    draw() {
      if (!this.spec) return;
      const setup = setupCanvas(this.canvas);
      if (!setup) return;
      const { ctx, rect } = setup;
      const W = rect.width;
      const H = rect.height;
      const colors = this.colors();
      const { x0, x1, y0, y1 } = this.view;
      const px = (p) => [((p[0] - x0) / (x1 - x0)) * W, H - ((p[1] - y0) / (y1 - y0)) * H];
      const origin = px([0, 0]);
      const size = Math.max(13, Math.min(17, W / 32));

      // Background grid and axes.
      const step = niceStep((x1 - x0) / 8);
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      for (let g = Math.ceil(x0 / step) * step; g <= x1; g += step) {
        const [gx] = px([g, 0]);
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
      }
      for (let g = Math.ceil(y0 / step) * step; g <= y1; g += step) {
        const [, gy] = px([0, g]);
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
      }
      ctx.stroke();
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, origin[1]);
      ctx.lineTo(W, origin[1]);
      ctx.moveTo(origin[0], 0);
      ctx.lineTo(origin[0], H);
      ctx.stroke();

      // Real eigenlines (invariant under every A^k, so they never move),
      // each labeled just inside where it leaves the frame, on whichever
      // half runs longer. The frame for labels starts below the top row,
      // which the iterate label owns.
      const margin = 10;
      const frame = [margin, W - margin, 3.4 * size, H - margin];
      const xRel = [px(this.spec.x)[0] - origin[0], px(this.spec.x)[1] - origin[1]];
      const lineNormals = [];
      (this.spec.eig || []).forEach((e, i) => {
        const len = Math.hypot(e.v[0], e.v[1]);
        const d = [e.v[0] / len, -e.v[1] / len]; // pixel space: y points down
        const color = i === 0 ? colors.eigen1 : colors.eigen2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(origin[0] - d[0] * 3 * W, origin[1] - d[1] * 3 * W);
        ctx.lineTo(origin[0] + d[0] * 3 * W, origin[1] + d[1] * 3 * W);
        ctx.stroke();
        ctx.setLineDash([]);

        const back = [-d[0], -d[1]];
        const dd = rayExit(origin, d, frame) >= rayExit(origin, back, frame) ? d : back;
        const end = rayExit(origin, dd, frame);
        const ex = origin[0] + dd[0] * end;
        const ey = origin[1] + dd[1] * end;
        // The label is a w x h box, centered on the line pulled back from
        // the exit point by its own extent along the line, then pushed off
        // the line by its extent across it (so no corner touches the
        // dashes). Prefer the side of the line x starts on, which the trail
        // rarely reaches this far out; use the other side if the preferred
        // one won't fit in the frame.
        const parts = [{ t: 'λ', it: true }, { t: String(i + 1), sub: true }, { t: ` = ${fmt(e.lam)}` }];
        const w = mathWidths(ctx, parts, size).reduce((a, b) => a + b, 0);
        const h = size * 1.2;
        const gap = size * 0.3;
        let n = [-dd[1], dd[0]];
        if (n[0] * xRel[0] + n[1] * xRel[1] < 0) n = [-n[0], -n[1]];
        const along = Math.abs(dd[0]) * (w / 2) + Math.abs(dd[1]) * (h / 2) + gap;
        const place = (nn) => {
          const across = Math.abs(nn[0]) * (w / 2) + Math.abs(nn[1]) * (h / 2) + gap;
          return [ex - dd[0] * along + nn[0] * across, ey - dd[1] * along + nn[1] * across];
        };
        const fits = (c) => c[0] - w / 2 >= frame[0] && c[0] + w / 2 <= frame[1] && c[1] - h / 2 >= frame[2] && c[1] + h / 2 <= frame[3];
        let c = place(n);
        if (!fits(c) && fits(place([-n[0], -n[1]]))) {
          n = [-n[0], -n[1]];
          c = place(n);
        }
        lineNormals.push(n);
        const cx = Math.min(Math.max(c[0], frame[0] + w / 2), frame[1] - w / 2);
        const cy = Math.min(Math.max(c[1], frame[2] + h / 2), frame[3] - h / 2);
        drawMath(ctx, parts, cx, cy + size * 0.35, size, color, 'center');
      });
      if (this.spec.rotation) {
        drawMath(ctx, [{ t: 'λ', it: true }, { t: ' = ' }, { t: 'e', it: true }, { t: `±${this.spec.rotation.theta}`, sup: true }, { t: 'i', it: true, sup: true }], 12, 12 + size * 2.6, size, colors.text, 'left');
      }

      // x*, the component of x along the dominant eigenline, labeled on the
      // far side of the line from x, since the trail arrives from x's side.
      if (this.spec.showLimit) {
        const [e1, e2] = this.spec.eig;
        const P = [
          [e1.v[0], e2.v[0]],
          [e1.v[1], e2.v[1]],
        ];
        const c = apply(inv(P), this.spec.x);
        const [lx, ly] = px([c[0] * e1.v[0], c[0] * e1.v[1]]);
        ctx.strokeStyle = colors.eigen1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lx, ly, 7, 0, Math.PI * 2);
        ctx.stroke();
        const n = lineNormals[0].map((v) => -v);
        const baseline = n[1] < 0 ? ly + n[1] * 16 - 2 : ly + n[1] * 16 + size * 0.85;
        drawMath(ctx, [{ t: 'x', it: true }, { t: '*', sup: true }], lx + n[0] * 16, baseline, size, colors.eigen1, n[0] > 0 ? 'left' : 'right');
      }

      // Trail of earlier iterates, fading with age.
      const s = this.timeToS(this.elapsed);
      const kNow = Math.floor(s + 1e-9);
      ctx.fillStyle = colors.vector;
      for (let j = 0; j <= kNow; j++) {
        const [tx, ty] = px(this.iterates[j]);
        ctx.globalAlpha = Math.max(0.45, 0.9 * 0.8 ** (kNow - j));
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // The current vector, as an arrow from the origin.
      const tip = px(apply(this.matrixAt(s), this.spec.x));
      const vx = tip[0] - origin[0];
      const vy = tip[1] - origin[1];
      const len = Math.hypot(vx, vy);
      if (len > 0.5) {
        const head = Math.min(14, len * 0.6);
        const ux = vx / len;
        const uy = vy / len;
        ctx.strokeStyle = colors.vector;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(origin[0], origin[1]);
        ctx.lineTo(tip[0] - ux * head * 0.8, tip[1] - uy * head * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(tip[0] - ux * head - uy * head * 0.45, tip[1] - uy * head + ux * head * 0.45);
        ctx.lineTo(tip[0] - ux * head + uy * head * 0.45, tip[1] - uy * head - ux * head * 0.45);
        ctx.closePath();
        ctx.fill();
      }

      // Which iterate we're on (the nearest integer k).
      const k = Math.round(s);
      const label = k === 0 ? [{ t: 'x', it: true }] : [{ t: 'A', it: true }, ...(k > 1 ? [{ t: String(k), sup: true }] : []), { t: 'x', it: true }];
      drawMath(ctx, label, 12, 12 + size * 1.1, size * 1.2, colors.vector, 'left');
    }
  }

  initDemo('.matrix-powers-demo', MatrixPowersDemo);
})();
