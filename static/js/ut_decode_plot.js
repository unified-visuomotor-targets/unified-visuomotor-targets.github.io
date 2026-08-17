/* Interactive replacement for the sampled-u_t decode animation.
   Renders "decoded from u_t" vs "real a_t" side by side for a selected action
   dimension, with a timestep slider that progressively reveals the chunk. */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#E53E3E', '#3182CE', '#38A169'];
  const W = 420, H = 260;
  const M = { top: 16, right: 14, bottom: 40, left: 52 };
  const PLOT_W = W - M.left - M.right;
  const PLOT_H = H - M.top - M.bottom;

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function niceTicks(lo, hi, count) {
    const span = hi - lo;
    if (span <= 0) return [lo];
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].find(m => m * mag >= raw) * mag;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
    return ticks;
  }

  function fmt(v) {
    if (Math.abs(v) < 1e-9) return '0';
    return Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2);
  }

  function init() {
    const root = document.getElementById('ut-decode-plot');
    const data = window.UT_DECODE_DATA;
    if (!root || !data) return;

    const T = data.chunk_size;
    const nSamples = data.n_samples;

    // ── Controls ────────────────────────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'ut-plot-controls';

    const dimGroup = document.createElement('div');
    dimGroup.className = 'ut-dim-group';
    const dimLabel = document.createElement('span');
    dimLabel.className = 'ut-control-label';
    dimLabel.textContent = 'Action dimension';
    dimGroup.appendChild(dimLabel);
    const dimButtons = data.dims.map((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ut-dim-button' + (i === 0 ? ' active' : '');
      b.textContent = name;
      b.addEventListener('click', () => setDim(i));
      dimGroup.appendChild(b);
      return b;
    });

    const timeGroup = document.createElement('div');
    timeGroup.className = 'ut-time-group';
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'ut-play-button';
    playBtn.setAttribute('aria-label', 'Play timestep animation');
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'ut-slider';
    slider.min = '1';
    slider.max = String(T);
    slider.step = '1';
    slider.value = String(T);
    slider.setAttribute('aria-label', 'Timestep');
    const timeReadout = document.createElement('span');
    timeReadout.className = 'ut-time-readout';
    timeGroup.appendChild(playBtn);
    timeGroup.appendChild(slider);
    timeGroup.appendChild(timeReadout);

    controls.appendChild(dimGroup);
    controls.appendChild(timeGroup);
    root.appendChild(controls);

    // ── Panels ──────────────────────────────────────────────────────────────
    const panels = document.createElement('div');
    panels.className = 'ut-panels';
    root.appendChild(panels);

    const views = [
      { key: 'decoded', title: 'Decoded from uₜ' },
      { key: 'real', title: 'Real aₜ chunk' }
    ].map(spec => {
      const wrap = document.createElement('div');
      wrap.className = 'ut-panel';
      const h = document.createElement('div');
      h.className = 'ut-panel-title';
      h.textContent = spec.title;
      const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        class: 'ut-svg',
        preserveAspectRatio: 'xMidYMid meet'
      });
      wrap.appendChild(h);
      wrap.appendChild(svg);
      panels.appendChild(wrap);
      return { key: spec.key, svg: svg };
    });

    const legend = document.createElement('div');
    legend.className = 'ut-legend';
    for (let i = 0; i < nSamples; i++) {
      const item = document.createElement('span');
      item.className = 'ut-legend-item';
      item.innerHTML = '<span class="ut-swatch" style="background:' + COLORS[i % COLORS.length] +
        '"></span>chunk ' + (i + 1);
      legend.appendChild(item);
    }
    root.appendChild(legend);

    // ── State ───────────────────────────────────────────────────────────────
    let dim = 0;
    let step = T;
    let timer = null;

    // Shared y-range per dimension across both panels, so the two are directly
    // comparable (matplotlib version scaled each panel independently).
    const ranges = data.dims.map((_, d) => {
      let lo = Infinity, hi = -Infinity;
      for (const key of ['decoded', 'real']) {
        for (let s = 0; s < nSamples; s++) {
          for (const v of data[key][s][d]) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
      const pad = (hi - lo) * 0.12 + 1e-4;
      return [lo - pad, hi + pad];
    });

    const xOf = t => M.left + (T > 1 ? (t / (T - 1)) * PLOT_W : PLOT_W / 2);

    function draw() {
      const [lo, hi] = ranges[dim];
      const yOf = v => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

      views.forEach(view => {
        const svg = view.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        // Grid + axis ticks
        for (const v of niceTicks(lo, hi, 4)) {
          const y = yOf(v);
          svg.appendChild(el('line', {
            x1: M.left, x2: M.left + PLOT_W, y1: y, y2: y, class: 'ut-grid'
          }));
          const label = el('text', { x: M.left - 8, y: y + 4, class: 'ut-tick ut-tick-y' });
          label.textContent = fmt(v);
          svg.appendChild(label);
        }
        for (let t = 0; t < T; t++) {
          const x = xOf(t);
          svg.appendChild(el('line', {
            x1: x, x2: x, y1: M.top, y2: M.top + PLOT_H, class: 'ut-grid'
          }));
          const label = el('text', { x: x, y: M.top + PLOT_H + 20, class: 'ut-tick ut-tick-x' });
          label.textContent = String(t);
          svg.appendChild(label);
        }

        svg.appendChild(el('rect', {
          x: M.left, y: M.top, width: PLOT_W, height: PLOT_H, class: 'ut-frame'
        }));

        // Cursor at the current timestep
        svg.appendChild(el('line', {
          x1: xOf(step - 1), x2: xOf(step - 1),
          y1: M.top, y2: M.top + PLOT_H, class: 'ut-cursor'
        }));

        // Series: full trace faded, revealed prefix solid
        for (let s = 0; s < nSamples; s++) {
          const series = data[view.key][s][dim];
          const color = COLORS[s % COLORS.length];
          const pts = series.map((v, t) => `${xOf(t)},${yOf(v)}`);

          svg.appendChild(el('polyline', {
            points: pts.join(' '), fill: 'none', stroke: color, class: 'ut-line-ghost'
          }));
          svg.appendChild(el('polyline', {
            points: pts.slice(0, step).join(' '), fill: 'none', stroke: color, class: 'ut-line'
          }));
          svg.appendChild(el('circle', {
            cx: xOf(step - 1), cy: yOf(series[step - 1]), r: 3.5, fill: color, class: 'ut-dot'
          }));
        }

        const xTitle = el('text', {
          x: M.left + PLOT_W / 2, y: H - 6, class: 'ut-axis-title'
        });
        xTitle.textContent = 'Timestep';
        svg.appendChild(xTitle);

        const yTitle = el('text', {
          x: 12, y: M.top + PLOT_H / 2, class: 'ut-axis-title',
          transform: `rotate(-90 12 ${M.top + PLOT_H / 2})`
        });
        yTitle.textContent = data.dims[dim];
        svg.appendChild(yTitle);
      });

      timeReadout.textContent = 't = ' + (step - 1);
    }

    function setDim(i) {
      dim = i;
      dimButtons.forEach((b, j) => b.classList.toggle('active', i === j));
      draw();
    }

    function setStep(v) {
      step = Math.min(T, Math.max(1, v));
      slider.value = String(step);
      draw();
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
      playBtn.setAttribute('aria-label', 'Play timestep animation');
    }

    function play() {
      if (step >= T) setStep(1);
      timer = setInterval(() => {
        if (step >= T) { stop(); return; }
        setStep(step + 1);
      }, 260);
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      playBtn.setAttribute('aria-label', 'Pause timestep animation');
    }

    slider.addEventListener('input', () => { stop(); setStep(parseInt(slider.value, 10)); });
    playBtn.addEventListener('click', () => { timer ? stop() : play(); });

    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
