import { NodeRange, dataModel } from '../../model/data-model.js';
import { formatSI, formatSeconds } from '../../utils/format.js';

// 提供属性：sequences（所有序列），range（可选），hoverIndex（非必需）
// 用事件 'point-hover' 向父组件发送 {point, clientX, clientY}，mouseout发null
export class ChartCanvas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `<canvas style="width:100%;height:100%;outline:none;"></canvas>`;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.range = new NodeRange({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 });
    this._drawnPoints = [];
    // 事件绑定
    // this._onMove = this._onMove.bind(this);
    // this._onLeave = this._onLeave.bind(this);
    // this._render = this._render.bind(this);
    // this._resize = this._resize.bind(this);
  }
  connectedCallback() {
    dataModel.on('sequences:changed', () => this._onDataChanged());
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.addEventListener('mouseleave', () => this._onLeave());
    this._resize();
  }
  disconnectedCallback() {
    window.removeEventListener('resize', () => this._resize());
    this.canvas.removeEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.removeEventListener('mouseleave', () => this._onLeave());
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
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.offsetWidth > 0 ? this.offsetWidth : 400;
    const h = this.offsetHeight > 0 ? this.offsetHeight : 300;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this._render();
  }
  _render() {
    const ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 获取数据和范围
    const sequences = dataModel.getSequences();

    // 基本布局参数
    const W = this.canvas.width, H = this.canvas.height;
    const margin = { left: 70 * dpr, right: 70 * dpr, top: 32 * dpr, bottom: 48 * dpr };
    const plotW = W - margin.left - margin.right, plotH = H - margin.top - margin.bottom;
    const xToPx = x => margin.left + ((x - this.range.xmin) / (this.range.xmax - this.range.xmin || 1e-6)) * plotW;
    const yToPx = y => margin.top + plotH - ((y - this.range.ymin) / (this.range.ymax - this.range.ymin || 1e-6)) * plotH;

    // 1. 画Y轴网格与标签
    ctx.font = `${13 * dpr}px sans-serif`;
    ctx.fillStyle = '#445066';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let t = 0; t <= 5; t++) {
      const y = margin.top + (plotH * t / 5);
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotW, y);
      ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      const v = this.range.ymax - t * (this.range.ymax - this.range.ymin) / 5;
      ctx.fillText(formatSI(v), margin.left - 8 * dpr, y);
    }

    // 2. 画X轴网格与标签（单位为相对秒）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= 7; t++) {
      const x = margin.left + (plotW * t / 7);
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH);
      ctx.strokeStyle = '#eef4fa'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      const v = t * (this.range.xmax - this.range.xmin) / 7;
      ctx.fillStyle = '#445066'; ctx.fillText(formatSeconds(v / 1e6), x, margin.top + plotH + 5 * dpr);
    }

    // 3. 画所有序列曲线，并记录每个点位置用于悬停
    this._drawnPoints = [];
    let colorIndex = 0;
    for (const seq of sequences) {
      if (seq.hidden) continue;
      const nodes = seq.sampled.getItems();
      if (!nodes.length) continue;
      ctx.strokeStyle = seq.color || '#229';
      ctx.beginPath();
      let started = false;
      nodes.forEach((n, idx) => {
        if (!this.range.inRange(n.x - seq.nodes.range.xmin, n.y)) return;
        const px = xToPx(n.x - seq.nodes.range.xmin), py = yToPx(n.y);
        this._drawnPoints.push({
          node: n, seq, px, py
        });
        if (!started) { ctx.moveTo(px, py); started = true; }
        else { ctx.lineTo(px, py); }
      });
      ctx.stroke();
      colorIndex++;
    }

    ctx.restore();
  }

  _onMove(ev) {
    // 命中检测
    if (!this._drawnPoints.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (window.devicePixelRatio || 1);
    const y = (ev.clientY - rect.top) * (window.devicePixelRatio || 1);
    let minDist = Infinity, closest = null;
    for (const pt of this._drawnPoints) {
      const d2 = (pt.px - x) ** 2 + (pt.py - y) ** 2;
      if (d2 < minDist) { minDist = d2; closest = pt; }
    }
    const maxDist = 12 * (window.devicePixelRatio || 1);
    if (closest && Math.sqrt(minDist) < maxDist) {
      this.dispatchEvent(new CustomEvent('point-hover', {
        detail: {node: closest.node, seq: closest.seq, clientX: ev.clientX, clientY: ev.clientY},
        bubbles: true, composed: true
      }));
    } else {
      this.dispatchEvent(new CustomEvent('point-hover', {
        detail: null, bubbles: true, composed: true
      }));
    }
  }
  _onLeave() {
    this.dispatchEvent(new CustomEvent('point-hover', {detail: null, bubbles: true, composed: true}));
  }
}
customElements.define('chart-canvas', ChartCanvas);
