/* charts.js - lightweight SVG chart renderers for stats page (no external deps). */
'use strict';

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function makeEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  // Renders a simple bar chart. data = [{label, value}], target = optional reference line.
  function renderBarChart(svg, data, { target = null, color = 'var(--accent)', unit = '' } = {}) {
    clearSvg(svg);
    if (!data.length) {
      const text = makeEl('text', { x: 160, y: 70, 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': '12' });
      text.textContent = 'Нет данных';
      svg.appendChild(text);
      return;
    }
    const W = 320, H = 140;
    const padBottom = 20, padTop = 10;
    const maxVal = Math.max(target || 0, ...data.map((d) => d.value), 1) * 1.15;
    const barGap = 6;
    const barWidth = (W - barGap * (data.length + 1)) / data.length;

    if (target) {
      const y = padTop + (H - padTop - padBottom) * (1 - target / maxVal);
      const line = makeEl('line', {
        x1: 0, x2: W, y1: y, y2: y,
        stroke: 'var(--text-3)', 'stroke-width': 1, 'stroke-dasharray': '4,4'
      });
      svg.appendChild(line);
    }

    data.forEach((d, i) => {
      const x = barGap + i * (barWidth + barGap);
      const barH = Math.max(2, (H - padTop - padBottom) * (d.value / maxVal));
      const y = H - padBottom - barH;
      const rect = makeEl('rect', {
        x, y, width: barWidth, height: barH, rx: Math.min(6, barWidth / 3),
        fill: target && d.value > target ? 'var(--protein)' : color
      });
      svg.appendChild(rect);

      const label = makeEl('text', {
        x: x + barWidth / 2, y: H - 6, 'text-anchor': 'middle',
        fill: 'var(--text-3)', 'font-size': '9', 'font-family': 'var(--f)'
      });
      label.textContent = d.label;
      svg.appendChild(label);
    });
  }

  // Renders a stacked bar chart for macros (protein/fat/carbs per day, in grams).
  function renderStackedMacroChart(svg, data) {
    clearSvg(svg);
    if (!data.length) {
      const text = makeEl('text', { x: 160, y: 70, 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': '12' });
      text.textContent = 'Нет данных';
      svg.appendChild(text);
      return;
    }
    const W = 320, H = 140, padBottom = 20, padTop = 10;
    const maxVal = Math.max(...data.map((d) => d.protein + d.fat + d.carbs), 1) * 1.1;
    const barGap = 6;
    const barWidth = (W - barGap * (data.length + 1)) / data.length;
    const colors = { protein: 'var(--protein)', fat: 'var(--fats)', carbs: 'var(--carbs)' };

    data.forEach((d, i) => {
      const x = barGap + i * (barWidth + barGap);
      let yCursor = H - padBottom;
      ['protein', 'fat', 'carbs'].forEach((key) => {
        const val = d[key] || 0;
        const segH = (H - padTop - padBottom) * (val / maxVal);
        yCursor -= segH;
        const rect = makeEl('rect', {
          x, y: yCursor, width: barWidth, height: Math.max(0, segH),
          fill: colors[key]
        });
        svg.appendChild(rect);
      });

      const label = makeEl('text', {
        x: x + barWidth / 2, y: H - 6, 'text-anchor': 'middle',
        fill: 'var(--text-3)', 'font-size': '9', 'font-family': 'var(--f)'
      });
      label.textContent = d.label;
      svg.appendChild(label);
    });
  }

  // Renders a line chart (e.g. weight trend). data = [{label, value}]
  function renderLineChart(svg, data, { color = 'var(--accent)' } = {}) {
    clearSvg(svg);
    if (!data.length) {
      const text = makeEl('text', { x: 160, y: 70, 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': '12' });
      text.textContent = 'Нет замеров веса';
      svg.appendChild(text);
      return;
    }
    const W = 320, H = 140, padBottom = 20, padTop = 14, padX = 10;
    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const points = data.map((d, i) => {
      const x = data.length === 1 ? W / 2 : padX + (i / (data.length - 1)) * (W - padX * 2);
      const y = padTop + (H - padTop - padBottom) * (1 - (d.value - minVal) / range);
      return { x, y, label: d.label, value: d.value };
    });

    const pathD = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
    const path = makeEl('path', { d: pathD, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(path);

    points.forEach((p) => {
      const circle = makeEl('circle', { cx: p.x, cy: p.y, r: 3.5, fill: color });
      svg.appendChild(circle);
    });

    // first/last labels
    if (points.length) {
      const first = points[0], last = points[points.length - 1];
      [first, last].forEach((p) => {
        const label = makeEl('text', {
          x: p.x, y: H - 6, 'text-anchor': p === first ? 'start' : 'end',
          fill: 'var(--text-3)', 'font-size': '9', 'font-family': 'var(--f)'
        });
        label.textContent = p.label;
        svg.appendChild(label);
      });
    }
  }

  return { renderBarChart, renderStackedMacroChart, renderLineChart };
})();
