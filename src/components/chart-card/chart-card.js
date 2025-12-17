import '../base-card/base-card.js';
import '../base-button/base-button.js';
import template from './chart-card.html?raw';
import style from './chart-card.css?raw';
import { NodeRange, dataModel } from '../../model/data-model.js';
import { makeColors } from '../../utils/lttb.js';
import { formatSI, formatSeconds } from '../../utils/format.js';

export class ChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
    this.canvas = this.shadowRoot.getElementById('chart-canvas');
    this.tooltip = this.shadowRoot.getElementById('chart-tooltip');
    this.range = new NodeRange({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 });
    this.viewMinX = 0;
    this.viewMaxX = 1;
    this._uniqViewKey = -1;
    this._bindEvents();
  }

  connectedCallback() {
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    dataModel.on('sequences:changed', () => this._onDataChanged());
    // this.shadowRoot.getElementById('resetViewBtn').onclick = () => this._resetView();
  }

  _onDataChanged() {
    this._resetViewRange();
    this._render();
  }

  _resetViewRange() {
    if (!dataModel.sequenceList) return;
    if (dataModel.getSequences().length === 0) return;
    if (this.range.equals(dataModel.sequenceList.range)) return;
    this.range = dataModel.sequenceList.range;
    this.range.enlarge(0.1);
  }

  _resizeCanvas() {
    const root = this.shadowRoot.querySelector('.chart-content');
    if (!root) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.floor(root.clientWidth * dpr));
    const h = Math.max(150, Math.floor(root.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = root.clientWidth + "px"; this.canvas.style.height = root.clientHeight + "px";
    }
    this._render();
  }

  _render() {
    const ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 基本布局参数
    const W = this.canvas.width, H = this.canvas.height;
    const margin = { left: 70 * dpr, right: 70 * dpr, top: 32 * dpr, bottom: 48 * dpr };
    const plotW = W - margin.left - margin.right, plotH = H - margin.top - margin.bottom;
    const xToPx = x => margin.left + ((x - this.range.xmin) / (this.range.xmax - this.range.xmin)) * plotW;
    const yToPx = y => margin.top + plotH - ((y - this.range.ymin) / (this.range.ymax - this.range.ymin)) * plotH;

    // Y轴网格与标签
    ctx.font = `${13 * dpr}px sans-serif`; ctx.fillStyle = '#445066';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let t = 0; t <= 5; t++) {
      const y = margin.top + (plotH * t / 5);
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotW, y);
      ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      const v = this.range.ymax - t * (this.range.ymax - this.range.ymin) / 5;
      ctx.fillText(formatSI(v), margin.left - 8 * dpr, y);
    }

    // X轴网格与标签（单位为相对秒）
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= 7; t++) {
      const x = margin.left + (plotW * t / 7);
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH);
      ctx.strokeStyle = '#eef4fa'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      const v = t * (this.range.xmax - this.range.xmin) / 7;
      ctx.fillStyle = '#445066'; ctx.fillText(formatSeconds(v / 1e6), x, margin.top + plotH + 5 * dpr);
    }

    // 序列曲线绘制
    const seqs = dataModel.getSequences() || [];
    let colorIndex = 0;
    for (const seq of seqs) {
      if (seq.hidden) continue;
      const nodes = seq.nodes.getItems();
      if (!nodes.length) continue;
      // 只在视窗区间内点
      ctx.strokeStyle = seq.color;
      ctx.beginPath();
      let start = true
      nodes.forEach(n => {
        if (!this.range.inRange(n)) return;
        const px = xToPx(n.x), py = yToPx(n.y);
        if (start) {
          ctx.moveTo(px, py);
          start = false;
        } else {
          ctx.lineTo(px, py);
        }
      })
      ctx.stroke();
      colorIndex++;
    }

    ctx.restore();
  }

  _bindEvents() {
    this.canvas.addEventListener('wheel', ev => {}, { passive: false });
    this.canvas.addEventListener('keydown', ev => this._onKey(ev));
  }

  _onKey(ev) {
  }
}
customElements.define('chart-card', ChartCard);
