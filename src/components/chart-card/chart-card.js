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
    this._lastHitNode = null;
    this._bindEvents();
  }

  connectedCallback() {
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    dataModel.on('sequences:changed', () => this._onDataChanged());
    // 初始隐藏 tooltip
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
      this.tooltip.style.position = 'fixed';
      this.tooltip.style.pointerEvents = 'none';
      this.tooltip.style.zIndex = 10000;
      this.tooltip.style.background = '#fff';
      this.tooltip.style.boxShadow = '0 4px 14px rgba(30,30,60,0.20)';
      this.tooltip.style.borderRadius = '8px';
      this.tooltip.style.fontSize = '13px';
      this.tooltip.style.color = '#222';
      this.tooltip.style.padding = '10px 16px';
      this.tooltip.style.minWidth = '160px';
      this.tooltip.style.maxWidth = '320px';
      this.tooltip.style.wordBreak = 'break-all';
      this.tooltip.style.border = '1px solid #e6eef9';
    }
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

    // 绘制曲线和点的可视属性缓存（用于命中检测）
    this._drawnPoints = []; // [{x, y, seqIndex, nodeIndex, px, py, nodeObj, seriesLabel, color}]
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
      nodes.forEach((n, idx) => {
        if (!this.range.inRange(n)) return;
        const px = xToPx(n.x), py = yToPx(n.y);
        // 缓存点的像素和数据
        this._drawnPoints.push({
          x: n.x, y: n.y, seqIndex: colorIndex, nodeIndex: idx,
          px, py, nodeObj: n, seriesLabel: seq.label, color: seq.color, raw: n
        });
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
    this.canvas.addEventListener('mousemove', ev => this._onMouseMove(ev));
    this.canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this.canvas.addEventListener('keydown', ev => this._onKey(ev));
  }

  _onMouseMove(ev) {
    if (!this._drawnPoints || !this._drawnPoints.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (window.devicePixelRatio || 1);
    const y = (ev.clientY - rect.top) * (window.devicePixelRatio || 1);

    // 命中检测：找最近的点，限制最远距离
    let minDist = Infinity, closest = null;
    for (const pt of this._drawnPoints) {
      const d2 = (pt.px - x) ** 2 + (pt.py - y) ** 2;
      if (d2 < minDist) {
        minDist = d2;
        closest = pt;
      }
    }
    console.log("minDist:", Math.sqrt(minDist), closest);
    const maxDist = 12 * (window.devicePixelRatio || 1);
    if (closest && Math.sqrt(minDist) < maxDist) {
      if (this._lastHitNode !== closest) {
        this._lastHitNode = closest;
        this._showTooltip(ev.clientX, ev.clientY, closest);
      }
    } else {
      this._lastHitNode = null;
      this._hideTooltip();
    }
  }

  _onMouseLeave() {
    this._lastHitNode = null;
    this._hideTooltip();
  }

  _hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
      this.tooltip.innerHTML = '';
    }
  }

  _showTooltip(clientX, clientY, pt) {
    console.log("show tooltip called:", clientX, clientY, pt);
    if (!this.tooltip || !pt) return;
    console.log("show tooltip for:", pt);
    // 格式化 NodeItem 属性
    const node = pt.nodeObj;
    let content = `<strong>序列名：</strong>${pt.seriesLabel ?? ''}<br>`;
    Object.entries(node).forEach(([k, v]) => {
      if (k.startsWith('_')) return;
      if (typeof v === 'function') return;
      let val = v;
      if (typeof v === 'number' && /x|micro/i.test(k)) {
        val = `${v}（${formatSeconds(v/1e6)}）`;
      }
      content += `<strong>${k}：</strong>${val}<br>`;
    });
    this.tooltip.innerHTML = content;

    // 定位
    const pad = 16;
    this.tooltip.style.display = 'block';
    let left = clientX + pad, top = clientY + pad;
    // 保证不会超出窗口
    const w = this.tooltip.offsetWidth, h = this.tooltip.offsetHeight;
    const winW = window.innerWidth, winH = window.innerHeight;
    if (left + w > winW - 12) left = clientX - w - pad;
    if (top + h > winH - 12) top = clientY - h - pad;
    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
  }

  _onKey(ev) {
    // todo: 可添加键盘交互
  }
}
customElements.define('chart-card', ChartCard);
