import { formatSI, formatSeconds } from '../../utils/format.js';

// 提供属性：sequences（所有序列），range（可选），hoverIndex（非必需）
// 用事件 'point-hover' 向父组件发送 {point, clientX, clientY}，mouseout发null
export class ChartCanvas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `<canvas style="width:100%;height:100%;"></canvas>`;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this._sequences = [];
    this._range = null;
    this._drawnPoints = [];
    // 事件绑定
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
  }
  connectedCallback() {
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('mouseleave', this._onLeave);
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }
  disconnectedCallback() {
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mouseleave', this._onLeave);
    window.removeEventListener('resize', this._resize);
  }

  set sequences(seqs) { this._sequences = seqs || []; this._draw(); }
  get sequences() { return this._sequences; }
  set range(r) { this._range = r; this._draw(); }
  get range() { return this._range; }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const root = this;
    const w = root.clientWidth || 400;
    const h = root.clientHeight || 300;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this._draw();
  }
  _draw() {
    const ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const W = this.canvas.width, H = this.canvas.height;
    const margin = { left: 70 * dpr, right: 70 * dpr, top: 32 * dpr, bottom: 48 * dpr };
    const plotW = W - margin.left - margin.right, plotH = H - margin.top - margin.bottom;
    const range = this._range || {xmin: 0, xmax: 1, ymin: 0, ymax: 1};
    // 转换函数
    const xToPx = x => margin.left + ((x - range.xmin) / (range.xmax - range.xmin)) * plotW;
    const yToPx = y => margin.top + plotH - ((y - range.ymin) / (range.ymax - range.ymin)) * plotH;
    // 绘制点收集
    this._drawnPoints = [];
    let colorIndex = 0;
    for (const seq of this._sequences) {
      if (!seq.nodes) continue;
      ctx.strokeStyle = seq.color || '#229';
      ctx.beginPath(); let start = true;
      const nodes = seq.nodes.getItems();
      nodes.forEach((n, idx) => {
        if (!(n.x >= range.xmin && n.x <= range.xmax && n.y >= range.ymin && n.y <= range.ymax)) return;
        const px = xToPx(n.x), py = yToPx(n.y);
        this._drawnPoints.push({node: n, seq, px, py});
        if (start) { ctx.moveTo(px, py); start = false; } else { ctx.lineTo(px, py);}
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
