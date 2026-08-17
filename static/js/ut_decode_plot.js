/* Interactive replacement for the sampled-u_t decode animation.
   Shows "decoded from u_t" vs "real a_t" side by side for a selected action
   dimension; the slider grows the trajectory across the chunk.
   Geometry is set with explicit SVG attributes (not CSS) so text lands in the
   same place regardless of the page's cascade. */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#E53E3E', '#3182CE', '#38A169'];
  const FONT = "'Noto Sans', system-ui, sans-serif";

  const W = 400, H = 208;
  const M = { top: 10, right: 12, bottom: 32, left: 42 };
  const PLOT_W = W - M.left - M.right;
  const PLOT_H = H - M.top - M.bottom;

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function text(str, x, y, opts) {
    const t = el('text', {
      x: x, y: y,
      'font-family': FONT,
      'font-size': (opts && opts.size) || 10,
      'text-anchor': (opts && opts.anchor) || 'middle',
      fill: (opts && opts.fill) || '#8a8a8a'
    });
    t.textContent = str;
    return t;
  }

  function niceTicks(lo, hi, count) {
    const span = hi - lo;
    if (span <= 0) return [lo];
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) || 10) * mag;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      ticks.push(Math.abs(v) < 1e-12 ? 0 : v);
    }
    return ticks;
  }

  function fmt(v) {
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
    controls.className = 'ut-controls';

    const dimGroup = document.createElement('div');
    dimGroup.className = 'ut-group';
    const dimLabel = document.createElement('span');
    dimLabel.className = 'ut-label';
    dimLabel.textContent = 'Dimension';
    dimGroup.appendChild(dimLabel);
    const dimButtons = data.dims.map((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ut-dim' + (i === 0 ? ' active' : '');
      b.textContent = name;
      b.addEventListener('click', () => setDim(i));
      dimGroup.appendChild(b);
      return b;
    });

    const timeGroup = document.createElement('div');
    timeGroup.className = 'ut-group';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'ut-label';
    timeLabel.textContent = 'Timestep';
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'ut-play';
    playBtn.setAttribute('aria-label', 'Animate the chunk');
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'ut-slider';
    slider.min = '1';
    slider.max = String(T);
    slider.step = '1';
    slider.value = String(T);
    slider.setAttribute('aria-label', 'Timestep');
    const readout = document.createElement('span');
    readout.className = 'ut-readout';
    timeGroup.appendChild(timeLabel);
    timeGroup.appendChild(playBtn);
    timeGroup.appendChild(slider);
    timeGroup.appendChild(readout);

    controls.appendChild(dimGroup);
    controls.appendChild(timeGroup);
    root.appendChild(controls);

    // ── Panels ──────────────────────────────────────────────────────────────
    const panels = document.createElement('div');
    panels.className = 'ut-panels';
    root.appendChild(panels);

    const views = [
      { key: 'decoded', title: 'Decoded from u<sub>t</sub>' },
      { key: 'real', title: 'Real a<sub>t</sub> chunk' }
    ].map(spec => {
      const wrap = document.createElement('div');
      wrap.className = 'ut-panel';
      const h = document.createElement('div');
      h.className = 'ut-panel-title';
      const svg = el('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        class: 'ut-svg',
        preserveAspectRatio: 'xMidYMid meet'
      });
      wrap.appendChild(h);
      wrap.appendChild(svg);
      panels.appendChild(wrap);
      return { key: spec.key, title: spec.title, head: h, svg: svg };
    });

    const legend = document.createElement('div');
    legend.className = 'ut-legend';
    for (let i = 0; i < nSamples; i++) {
      const item = document.createElement('span');
      item.className = 'ut-legend-item';
      item.innerHTML = '<span class="ut-swatch" style="background:' +
        COLORS[i % COLORS.length] + '"></span>chunk ' + (i + 1);
      legend.appendChild(item);
    }
    root.appendChild(legend);

    // ── Scales ──────────────────────────────────────────────────────────────
    // One y-range per dimension, shared by both panels so the two are directly
    // comparable, and fixed as the slider moves so the trace grows into a
    // stationary frame.
    const ranges = data.dims.map((_, d) => {
      let lo = Infinity, hi = -Infinity;
      ['decoded', 'real'].forEach(key => {
        for (let s = 0; s < nSamples; s++) {
          data[key][s][d].forEach(v => {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          });
        }
      });
      const pad = (hi - lo) * 0.1 + 1e-4;
      return [lo - pad, hi + pad];
    });

    const xOf = t => M.left + (T > 1 ? (t / (T - 1)) * PLOT_W : PLOT_W / 2);

    let dim = 0;
    let step = T;
    let timer = null;

    function draw() {
      const lo = ranges[dim][0], hi = ranges[dim][1];
      const yOf = v => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
      const yTicks = niceTicks(lo, hi, 4);

      views.forEach(view => {
        view.head.innerHTML = view.title +
          '<span class="ut-dim-tag">' + data.dims[dim] + '</span>';

        const svg = view.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }));
        svg.appendChild(el('rect', {
          x: M.left, y: M.top, width: PLOT_W, height: PLOT_H, fill: '#ffffff'
        }));

        yTicks.forEach(v => {
          const y = yOf(v);
          svg.appendChild(el('line', {
            x1: M.left, x2: M.left + PLOT_W, y1: y, y2: y, stroke: '#ededed', 'stroke-width': 1
          }));
          svg.appendChild(text(fmt(v), M.left - 7, y + 3.5, { anchor: 'end' }));
        });

        for (let t = 0; t < T; t++) {
          const x = xOf(t);
          svg.appendChild(el('line', {
            x1: x, x2: x, y1: M.top, y2: M.top + PLOT_H, stroke: '#f4f4f4', 'stroke-width': 1
          }));
          svg.appendChild(text(String(t), x, M.top + PLOT_H + 15));
        }

        svg.appendChild(el('rect', {
          x: M.left, y: M.top, width: PLOT_W, height: PLOT_H,
          fill: 'none', stroke: '#d0d0d0', 'stroke-width': 1
        }));

        for (let s = 0; s < nSamples; s++) {
          const series = data[view.key][s][dim];
          const color = COLORS[s % COLORS.length];
          if (step === 1) {
            svg.appendChild(el('circle', {
              cx: xOf(0), cy: yOf(series[0]), r: 2, fill: color
            }));
            continue;
          }
          const pts = [];
          for (let t = 0; t < step; t++) pts.push(xOf(t) + ',' + yOf(series[t]));
          svg.appendChild(el('polyline', {
            points: pts.join(' '), fill: 'none', stroke: color,
            'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          }));
        }

        svg.appendChild(text('Timestep', M.left + PLOT_W / 2, H - 5,
          { size: 11, fill: '#666666' }));
      });

      readout.textContent = 't = ' + (step - 1);
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
    }

    function play() {
      if (step >= T) setStep(1);
      timer = setInterval(() => {
        if (step >= T) { stop(); return; }
        setStep(step + 1);
      }, 240);
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
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
