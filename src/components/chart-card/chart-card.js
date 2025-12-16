import '../base-card/base-card.js';
import style from './chart-card.css?raw';
import template from './chart-card.html?raw';
import { dataModel } from '../../model/data-model.js';
import { makeColors, largestTriangleThreeBuckets } from '../../utils/lttb.js';
import { formatSI, formatSeconds } from '../../utils/format.js';

export class ChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
    this.canvas = this.shadowRoot.getElementById('chart-canvas');
    this.tooltip = this.shadowRoot.getElementById('chart-tooltip');
    // 可视区域状态
    this.sampleTarget = 1200;
    this.viewMinX = 0;
    this.viewMaxX = 1;
    this._seriesState = [];
    this._uniqViewKey = -1;
    this._bindEvents();
  }

  connectedCallback() {
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    dataModel.on('sequences:changed', () => this._onDataChanged());
    this._onDataChanged();
  }

  _onDataChanged() {
    const seqs = dataModel.getSequences() || [];
    this._initViewRange(seqs);
    this._sampleAndRender(seqs);
  }

  _initViewRange(seqs) {
    // 初始化视口x轴范围（以所有序列的相对0点为起始、终止）
    let min = Infinity, max = -Infinity;
    for (const seq of seqs) {
      if (!Array.isArray(seq.nodes) || !seq.nodes.length) continue;
      const firstX = seq.nodes[0].x;
      const relXmax = seq.nodes[seq.nodes.length-1].x - firstX;
      min = Math.min(min, 0);
      max = Math.max(max, relXmax);
    }
    if (!isFinite(min) || !isFinite(max) || min === max) { min = 0; max = min + 1; }
    if (this._uniqViewKey !== seqs.length) {
      this.viewMinX = min;
      this.viewMaxX = max;
      this._uniqViewKey = seqs.length;
    }
    if (this.viewMaxX <= this.viewMinX) this.viewMaxX = this.viewMinX + 1;
  }

  _sampleAndRender(seqs) {
    const colors = makeColors(seqs.length || 1);
    this._seriesState = (seqs||[]).map((seq, i) => {
      const nodes = seq.nodes || [];
      const firstX = nodes.length > 0 ? nodes[0].x : 0;
      // 相对x
      let points = nodes.map(n => [n.x - firstX, n.y]);
      // 只采样可视区域
      let inView = points.filter(pt => pt[0] >= this.viewMinX && pt[0] <= this.viewMaxX);
      if (inView.length > this.sampleTarget) {
        inView = largestTriangleThreeBuckets(inView, this.sampleTarget);
      }
      return {
        name: seq.name,
        points: inView,
        color: colors[i],
      };
    });
    this._render();
  }

  _resizeCanvas() {
    const root = this.shadowRoot.querySelector('.chart-card-root');
    if (!root) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(300, (root.clientWidth || 500) * dpr);
    this.canvas.height = 360 * dpr;
    this.canvas.style.width = (root.clientWidth || 500) + 'px';
    this.canvas.style.height = '360px';
    this._render();
  }

  _render() {
    const ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // plot area边距和区间
    const W = this.canvas.width, H = this.canvas.height;
    const margin = { left: 70*dpr, right: 18*dpr, top: 18*dpr, bottom: 48*dpr };
    const plotW = W - margin.left - margin.right, plotH = H - margin.top - margin.bottom;
    // 范围
    let minX = this.viewMinX, maxX = this.viewMaxX;
    let minY = Infinity, maxY = -Infinity;
    for (const s of this._seriesState) {
      for (const pt of s.points) {
        if (!isFinite(pt[1])) continue;
        minY = Math.min(minY, pt[1]);
        maxY = Math.max(maxY, pt[1]);
      }
    }
    if (!isFinite(minY) || !isFinite(maxY)) { minY = 0; maxY = 1; }
    if (minY === maxY) maxY = minY + 1;

    // 映射
    const xToPx = x => margin.left + ((x - minX) / (maxX - minX)) * plotW;
    const yToPx = y => margin.top + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // Y轴网格与标签
    ctx.font = `${13*dpr}px sans-serif`; ctx.fillStyle = '#445066';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let t=0; t<=5; t++) {
      const y = margin.top + (plotH * t / 5);
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left+plotW, y);
      ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 1*dpr; ctx.stroke();
      const v = maxY - t*(maxY-minY)/5;
      ctx.fillText(formatSI(v), margin.left-8*dpr, y);
    }
    ctx.font = `${13*dpr}px sans-serif`; ctx.textAlign = 'left';
    ctx.fillStyle = '#223'; ctx.fillText('内存值', margin.left-40*dpr, margin.top+10);

    // X轴网格与标签（单位为相对秒）
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t=0; t<=7; t++) {
      const x = margin.left + (plotW * t / 7);
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top+plotH);
      ctx.strokeStyle = '#eef4fa'; ctx.lineWidth = 1*dpr; ctx.stroke();
      // 相对us转s
      const v = minX + t*(maxX-minX)/7;
      ctx.fillStyle = '#445066'; ctx.fillText(formatSeconds(v/1e6), x, margin.top+plotH+5*dpr);
    }

    // 绘制序列
    ctx.lineWidth = 2*dpr;
    for (const s of this._seriesState) {
      const arr = s.points;
      if (!arr || arr.length < 2) continue;
      ctx.strokeStyle = s.color; ctx.beginPath();
      arr.forEach((pt, i) => {
        const px = xToPx(pt[0]), py = yToPx(pt[1]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      // 线尾
      const last = arr[arr.length-1];
      const lpx = xToPx(last[0]), lpy = yToPx(last[1]);
      ctx.beginPath(); ctx.arc(lpx, lpy, 3*dpr, 0, Math.PI*2); ctx.fillStyle = s.color; ctx.fill();
    }
    ctx.restore();
  }

  _bindEvents() {
    // 缩放交互
    this.canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 1.2 : (1/1.2);
      const rect = this.canvas.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (window.devicePixelRatio || 1);
      const W = this.canvas.width, marginL = 70*(window.devicePixelRatio||1), marginR = 18*(window.devicePixelRatio||1), plotW = W - marginL - marginR;
      const frac = Math.max(0, Math.min(1, (px-marginL)/plotW));
      const center = this.viewMinX + frac*(this.viewMaxX - this.viewMinX);
      const span = this.viewMaxX - this.viewMinX;
      let newSpan = Math.max(1, span * factor);
      this.viewMinX = Math.max(0, center - newSpan/2);
      this.viewMaxX = this.viewMinX + newSpan;
      this._onDataChanged();
    }, { passive: false });
    // 键盘-平移缩放
    this.canvas.addEventListener('keydown', ev => this._onKey(ev));
  }

  _onKey(ev) {
    const span = this.viewMaxX - this.viewMinX;
    let handled = false;
    if (ev.key === 'a') { // 左移
      this.viewMinX = Math.max(0, this.viewMinX - span*0.08); this.viewMaxX = this.viewMinX + span; handled=true;
    } else if (ev.key === 'd') { // 右移
      this.viewMinX = Math.max(0, this.viewMinX + span*0.08); this.viewMaxX = this.viewMinX + span; handled=true;
    } else if (ev.key === 'w') { // 缩小
      const c = (this.viewMinX+this.viewMaxX)/2, ns = Math.max(1, span/1.18);
      this.viewMinX = Math.max(0, c-ns/2); this.viewMaxX = this.viewMinX+ns; handled=true;
    } else if (ev.key === 's') { // 放大
      const c = (this.viewMinX+this.viewMaxX)/2, ns = Math.min(span*1.18, 1e12);
      this.viewMinX = Math.max(0, c-ns/2); this.viewMaxX = this.viewMinX+ns; handled=true;
    }
    if (handled) { ev.preventDefault(); this._onDataChanged(); }
  }
}
customElements.define('chart-card', ChartCard);
