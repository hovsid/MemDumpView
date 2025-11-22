import { formatSI, formatSeconds } from "../utils/format.js";
import { largestTriangleThreeBuckets, binarySearchLeft, binarySearchRight } from "../utils/lttb.js";
import { parseCSVStream } from "../utils/csv.js";

export class Chart {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'chart-canvas';
    this.canvas.setAttribute('tabindex','0');
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    // state
    this.seriesList = [];
    this.viewMinX = NaN; this.viewMaxX = NaN;
    this.pinnedPoints = [];
    this.originalViewSet = false;
    this.originalViewMin = null; this.originalViewMax = null;

    // events
    this.events = new Map();

    // internal interaction state
    this._hoverCandidate = null;
    this._boxSelecting = false;
    this._boxStart = null;
    this._selectRectEl = null;
    this._boxMode = null; // 'zoom'|'select'
    this._suppressClick = false;
    this._lastTouchTime = 0;
    this._touchState = { active:false, mode:null, ...{} };

    this._bindHandlers();
    this.setCanvasSize();
    window.addEventListener('resize', () => this._resizeDebounced(), { passive: true });
  }

  on(evt, handler) {
    if (!this.events.has(evt)) this.events.set(evt, []);
    this.events.get(evt).push(handler);
  }
  _emit(evt, payload) {
    const handlers = this.events.get(evt) || [];
    for (const h of handlers) h(payload);
  }

  // ---------- file loading ----------
  async loadFile(file) {
    this._emit('status', `解析 ${file.name}...`);
    const id = crypto.randomUUID?.() || `s${Date.now()}`;
    const meta = { id, name: file.name || 'file', raw: [], rel: [], sampled: [], color: '', visible: true, firstX: null, headerCols: null };
    this.seriesList.push(meta);
    this._emit('seriesChanged', this.seriesList);
    try {
      const result = await parseCSVStream(file, p => this._emit('status', `解析 ${file.name}: ${Math.round(p*100)}%`));
      meta.headerCols = result.headerCols;
      meta.raw = result.points.slice();
      meta.raw.sort((a,b)=>a[0]-b[0]);
      if (!meta.raw.length) {
        this.seriesList = this.seriesList.filter(s => s !== meta);
        this._emit('seriesChanged', this.seriesList);
        this._emit('status', `文件 ${file.name} 无数据`);
        return;
      }
      meta.firstX = meta.raw[0][0];
      meta.rel = meta.raw.map(p => [p[0] - meta.firstX, p[1]]);
      this._applyColors();
      const ext = this.computeGlobalExtents();
      if (!this.originalViewSet) {
        this.originalViewMin = 0;
        this.originalViewMax = ext.max;
        this.originalViewSet = true;
      }
      this.viewMinX = 0; this.viewMaxX = ext.max;
      this.setCanvasSize(); this.resampleInViewAndRender();
      this._emit('status', `解析完成：${file.name}`);
      this._emit('seriesChanged', this.seriesList);
    } catch (err) {
      console.error(err);
      this._emit('status', `解析失败：${err && err.message ? err.message : err}`);
    }
  }

  _applyColors() {
    const colors = [];
    const n = this.seriesList.length;
    for (let i=0;i<n;i++){ const hue = Math.round((360 / Math.max(1, n)) * i); colors.push(`hsl(${hue} 70% 45%)`); }
    this.seriesList.forEach((s,i)=> s.color = s.color || colors[i%colors.length]);
  }

  computeGlobalExtents() {
    let min = Infinity, max = -Infinity;
    for (const s of this.seriesList) {
      if (!s.rel || s.rel.length === 0) continue;
      min = Math.min(min, s.rel[0][0]);
      max = Math.max(max, s.rel[s.rel.length - 1][0]);
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    min = Math.max(0, min);
    return {min, max};
  }

  setCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width * this.dpr));
    const h = Math.max(150, Math.floor(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }
  _resizeDebounced() { clearTimeout(this._rt); this._rt = setTimeout(()=> { this.setCanvasSize(); this.resampleInViewAndRender(); }, 120); }

  resampleInViewAndRender() {
    if (this.seriesList.length === 0) { this.render(); return; }
    this.setCanvasSize();
    const marginBase = {left: 70 * this.dpr, right: 18 * this.dpr, top: 18 * this.dpr, bottom: 48 * this.dpr};
    const plotW = this.canvas.width - marginBase.left - marginBase.right;
    const pixelTargetVal = 1;
    const approx = Math.max(50, Math.min(20000, Math.round(plotW / this.dpr * pixelTargetVal)));
    const globalTarget = 1000;
    const finalTarget = Math.min(globalTarget, approx);

    const ext = this.computeGlobalExtents();
    if (!isFinite(this.viewMinX)) this.viewMinX = 0;
    if (!isFinite(this.viewMaxX)) this.viewMaxX = ext.max;
    this.viewMinX = Math.max(0, this.viewMinX);
    this.viewMaxX = Math.max(this.viewMinX + 1, this.viewMaxX);

    for (const s of this.seriesList) {
      if (!s.rel || s.rel.length === 0) { s.sampled = []; continue; }
      if (!s.visible) { s.sampled = []; continue; }
      const arr = s.rel;
      const lo = Math.max(0, binarySearchLeft(arr, this.viewMinX));
      const hi = Math.min(arr.length, binarySearchRight(arr, this.viewMaxX));
      const windowArr = arr.slice(Math.max(0, lo - 1), Math.min(arr.length, hi + 1));
      if (windowArr.length <= finalTarget) s.sampled = windowArr;
      else s.sampled = largestTriangleThreeBuckets(windowArr, finalTarget);
    }

    // remove pinned for hidden series
    this.pinnedPoints = this.pinnedPoints.filter(p => this.seriesList.find(s => s.id === p.seriesId && s.visible));
    this.render();
    this._emit('resampled');
  }

  // pinned API
  addPinned(seriesId, relMicro, val, color, seriesName) {
    const exists = this.pinnedPoints.find(p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val);
    if (exists) return exists;
    const entry = { seriesId, seriesName, relMicro, val, color, selected:false };
    this.pinnedPoints.push(entry);
    this._emit('pinnedChanged', this.pinnedPoints);
    this.render();
    return entry;
  }
  removePinned(entry) {
    const idx = this.pinnedPoints.indexOf(entry);
    if (idx >= 0) this.pinnedPoints.splice(idx,1);
    this._emit('pinnedChanged', this.pinnedPoints);
    this.render();
  }
  clearPinned() {
    this.pinnedPoints = [];
    this._emit('pinnedChanged', this.pinnedPoints);
    this.render();
  }
  exportPinnedCSV() {
    if (!this.pinnedPoints.length) return null;
    let out = 'series,rel_us,value\n';
    for (const p of this.pinnedPoints) out += `${JSON.stringify(p.seriesName)},${p.relMicro},${p.val}\n`;
    const blob = new Blob([out], {type: 'text/csv;charset=utf-8;'});
    return blob;
  }

  // Rendering helpers
  getPlotMetrics() {
    const W = this.canvas.width, H = this.canvas.height;
    const marginBase = {left: 70 * this.dpr, right: 18 * this.dpr, top: 18 * this.dpr, bottom: 48 * this.dpr};
    const plotH = H - marginBase.top - marginBase.bottom;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of this.seriesList) {
      if (!s.visible) continue;
      const arr = (s.sampled && s.sampled.length>0) ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      minX = Math.min(minX, arr[0][0]); maxX = Math.max(maxX, arr[arr.length-1][0]);
      for (const p of arr) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    }
    if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    const globalExt = this.computeGlobalExtents();
    if (isFinite(this.viewMinX) && isFinite(this.viewMaxX) && this.viewMaxX > this.viewMinX) {
      this.viewMinX = Math.max(0, this.viewMinX);
      this.viewMaxX = Math.min(this.viewMaxX, globalExt.max + 1);
      minX = this.viewMinX; maxX = this.viewMaxX;
    }
    const yPadTop = (maxY - minY) * 0.06 || 1;
    maxY = maxY + yPadTop; minY = 0;
    this.ctx.font = `${11 * this.dpr}px sans-serif`;
    const rows = 5;
    let maxLabelWidth = 0;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows; const v = maxY - t * (maxY - minY); const s = formatSI(v); const w = this.ctx.measureText(s).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    }
    this.ctx.font = `${12 * this.dpr}px sans-serif`;
    const yTitleWidth = this.ctx.measureText('内存值').width;
    const leftMargin = Math.max(marginBase.left, Math.ceil(yTitleWidth + maxLabelWidth + 20 * this.dpr));
    const margin = { left: leftMargin, right: marginBase.right, top: marginBase.top, bottom: marginBase.bottom };
    const plotW = W - margin.left - margin.right;
    return { W, H, margin, plotW, plotH, minX, maxX, minY, maxY, minXSec: minX / 1e6, maxXSec: maxX / 1e6 };
  }

  render() {
    const metrics = this.getPlotMetrics();
    const { W, H, margin, plotW, plotH, minX, maxX, minY, maxY, minXSec, maxXSec } = metrics;
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    if (plotW <= 10 || plotH <= 10) return;

    ctx.font = `${11 * this.dpr}px sans-serif`; const rows = 5;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= rows; i++) {
      const t = i / rows; const y = margin.top + t * plotH;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotW, y);
      ctx.strokeStyle = '#f2f6fb'; ctx.lineWidth = Math.max(1, this.dpr * 0.5); ctx.stroke();
      const v = maxY - t * (maxY - minY); const label = formatSI(v);
      ctx.fillStyle = '#445066'; ctx.fillText(label, margin.left - 8 * this.dpr, y);
    }
    ctx.font = `${12 * this.dpr}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#223';
    ctx.fillText('内存值', Math.max(8 * this.dpr, 4 * this.dpr), margin.top + plotH / 2);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const cols = Math.max(4, Math.min(8, Math.floor(plotW / (80 * this.dpr))));
    for (let i = 0; i <= cols; i++) {
      const t = i / cols; const x = margin.left + t * plotW;
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH);
      ctx.strokeStyle = '#f6f9fc'; ctx.stroke();
      const vSec = minXSec + t * (maxXSec - minXSec); const label = formatSeconds(vSec);
      ctx.fillStyle = '#445066'; ctx.fillText(label, x, margin.top + plotH + 8 * this.dpr);
    }

    const xToPx = (xMicro) => margin.left + ((xMicro / 1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
    const yToPx = (y) => margin.top + plotH - ((y - minY) / ((maxY - minY) || 1)) * plotH;

    ctx.lineWidth = Math.max(1.4 * this.dpr, 1.2); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const s of this.seriesList) {
      if (!s.visible) continue;
      const arr = s.sampled && s.sampled.length ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      ctx.strokeStyle = s.color; ctx.beginPath();
      let started = false;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i]; const px = xToPx(p[0]), py = yToPx(p[1]);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      const last = arr[arr.length - 1]; const lx = xToPx(last[0]), ly = yToPx(last[1]);
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(lx, ly, Math.max(2.5 * this.dpr, 2), 0, Math.PI*2); ctx.fill();
    }

    // draw pinned points
    for (const p of this.pinnedPoints) {
      const s = this.seriesList.find(x => x.id === p.seriesId && x.visible);
      if (!s) continue;
      const px = xToPx(p.relMicro); const py = yToPx(p.val);
      ctx.save();
      ctx.strokeStyle = p.selected ? 'rgba(43,108,176,0.22)' : 'rgba(0,0,0,0.12)';
      ctx.lineWidth = Math.max(1, this.dpr * 0.6);
      ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
      ctx.beginPath(); ctx.moveTo(px, margin.top); ctx.lineTo(px, margin.top + plotH); ctx.moveTo(margin.left, py); ctx.lineTo(margin.left + plotW, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(2, this.dpr * 0.9); ctx.strokeStyle = p.color || s.color;
      ctx.arc(px, py, Math.max(5 * this.dpr, 4), 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.fillStyle = p.color || s.color; ctx.arc(px, py, Math.max(2.5 * this.dpr, 1.5), 0, Math.PI*2); ctx.fill();
      if (p.selected) { ctx.beginPath(); ctx.strokeStyle = 'rgba(43,108,176,0.9)'; ctx.lineWidth = Math.max(1.2, this.dpr); ctx.arc(px, py, Math.max(8 * this.dpr, 6), 0, Math.PI*2); ctx.stroke(); }
      ctx.restore();
    }

    // emit rendered with metrics
    this._emit('rendered', { metrics });
  }

  // ----- Interaction binding (mouse/keyboard/touch) -----
  _bindHandlers() {
    // create mouse/touch handlers that forward events into chart state
    this.canvas.addEventListener('mousemove', (ev) => this._onMouseMove(ev));
    this.canvas.addEventListener('mouseleave', () => { this._hoverCandidate = null; this._emit('hover', null); });
    this.canvas.addEventListener('click', (ev) => this._onClick(ev));
    this.canvas.addEventListener('mousedown', (ev) => this._onMouseDown(ev));
    window.addEventListener('mousemove', (ev) => this._onWindowMouseMove(ev));
    window.addEventListener('mouseup', (ev) => this._onWindowMouseUp(ev));
    this.canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); this._onWheel(ev); }, { passive: false });

    // keyboard: library consumer can delegate events to chart.handleKeyEvent
    // touch support
    this.canvas.addEventListener('touchstart', (ev) => this._onTouchStart(ev), { passive: false });
    this.canvas.addEventListener('touchmove', (ev) => this._onTouchMove(ev), { passive: false });
    this.canvas.addEventListener('touchend', (ev) => this._onTouchEnd(ev), { passive: false });
    this.canvas.addEventListener('touchcancel', (ev) => this._onTouchEnd(ev), { passive: false });
  }

  _getClientMetrics() {
    const rect = this.canvas.getBoundingClientRect();
    const metrics = this.getPlotMetrics();
    return { rect, metrics };
  }

  _onMouseMove(ev) {
    // ignore synthetic after touch
    if (Date.now() - this._lastTouchTime < 350) return;
    const { rect, metrics } = this._getClientMetrics();
    const px = (ev.clientX - rect.left) * this.dpr;
    const py = (ev.clientY - rect.top) * this.dpr;
    const { margin, plotW, plotH, minX, maxX, minY, maxY, minXSec, maxXSec } = metrics;
    if (plotW <= 0 || plotH <= 0) { this._emit('hover', null); return; }
    const targetRelX = minX + ((px - margin.left) / plotW) * (maxX - minX || 1);

    let best = { d2: Infinity, series: null, point: null };
    for (const s of this.seriesList) {
      if (!s.visible) continue;
      const arr = s.sampled && s.sampled.length ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      let lo = 0, hi = arr.length - 1;
      while (hi - lo > 3) {
        const mid = (lo + hi) >> 1;
        if (arr[mid][0] < targetRelX) lo = mid; else hi = mid;
      }
      for (let i = Math.max(0, lo - 2); i <= Math.min(arr.length - 1, hi + 2); i++) {
        const p = arr[i];
        const sx = margin.left + ((p[0]/1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
        const sy = margin.top + plotH - ((p[1] - minY) / ((maxY - minY) || 1)) * plotH;
        const dx = sx - px, dy = sy - py; const d2 = dx*dx + dy*dy;
        if (d2 < best.d2) best = { d2, series: s, point: p };
      }
    }

    if (best.series && best.point && best.d2 < (30 * this.dpr) * (30 * this.dpr)) {
      this._hoverCandidate = { series: best.series, point: best.point, clientX: ev.clientX, clientY: ev.clientY, d2: best.d2 };
      this._emit('hover', this._hoverCandidate);
    } else {
      this._hoverCandidate = null;
      this._emit('hover', null);
    }
  }

  _onClick(ev) {
    if (this.seriesList.length === 0) return;
    if (this._boxSelecting) return;
    if (this._suppressClick) { this._suppressClick = false; return; }
    if (Date.now() - this._lastTouchTime < 350) return;

    const { rect, metrics } = this._getClientMetrics();
    const px = (ev.clientX - rect.left) * this.dpr;
    const py = (ev.clientY - rect.top) * this.dpr;
    const { margin, plotW, plotH, minX, maxX, minY, maxY, minXSec, maxXSec } = metrics;
    if (plotW <= 0 || plotH <= 0) return;
    const targetRelX = minX + ((px - margin.left) / plotW) * (maxX - minX || 1);

    let best = { d2: Infinity, series: null, point: null };
    for (const s of this.seriesList) {
      if (!s.visible) continue;
      const arr = s.sampled && s.sampled.length ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      let lo = 0, hi = arr.length - 1;
      while (hi - lo > 3) {
        const mid = (lo + hi) >> 1;
        if (arr[mid][0] < targetRelX) lo = mid; else hi = mid;
      }
      for (let i = Math.max(0, lo - 2); i <= Math.min(arr.length - 1, hi + 2); i++) {
        const p = arr[i];
        const sx = margin.left + ((p[0]/1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
        const sy = margin.top + plotH - ((p[1] - minY) / ((maxY - minY) || 1)) * plotH;
        const dx = sx - px, dy = sy - py; const d2 = dx*dx + dy*dy;
        if (d2 < best.d2) best = { d2, series: s, point: p };
      }
    }

    const thresh = (28 * this.dpr) * (28 * this.dpr);
    if (best.series && best.point && best.d2 < thresh) {
      const existingIdx = this.pinnedPoints.findIndex(pp => pp.seriesId === best.series.id && pp.relMicro === best.point[0] && pp.val === best.point[1]);
      if (existingIdx >= 0) {
        this.pinnedPoints.splice(existingIdx, 1);
      } else {
        this.addPinned(best.series.id, best.point[0], best.point[1], best.series.color || '#333', best.series.name);
      }
      this._emit('pinnedChanged', this.pinnedPoints);
      this.render();
    } else {
      // clicked empty area: clear pinned selection
      for (const p of this.pinnedPoints) p.selected = false;
      this._emit('pinnedChanged', this.pinnedPoints);
      this.render();
    }
  }

  _onMouseDown(ev) {
    if (ev.button !== 0) return;
    if (Date.now() - this._lastTouchTime < 350) return;
    const rect = this.canvas.getBoundingClientRect();
    this._boxStart = { x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
    this._boxMode = ev.shiftKey ? 'select' : 'zoom';
    this._boxSelecting = true;
    this._selectRectEl = document.createElement('div');
    this._selectRectEl.className = 'select-rect';
    this.container.appendChild(this._selectRectEl);
  }

  _onWindowMouseMove(ev) {
    if (!this._boxSelecting || !this._selectRectEl || !this._boxStart) return;
    const x1 = Math.min(this._boxStart.x, ev.clientX), x2 = Math.max(this._boxStart.x, ev.clientX);
    const y1 = Math.min(this._boxStart.y, ev.clientY), y2 = Math.max(this._boxStart.y, ev.clientY);
    const parentRect = this.container.getBoundingClientRect();
    const left = Math.max(parentRect.left, x1), top = Math.max(parentRect.top, y1);
    const right = Math.min(parentRect.right, x2), bottom = Math.min(parentRect.bottom, y2);
    if (right <= left || bottom <= top) { this._selectRectEl.style.display = 'none'; return; }
    this._selectRectEl.style.display = 'block';
    this._selectRectEl.style.left = (left - parentRect.left) + 'px';
    this._selectRectEl.style.top = (top - parentRect.top) + 'px';
    this._selectRectEl.style.width = (right - left) + 'px';
    this._selectRectEl.style.height = (bottom - top) + 'px';
  }

  _onWindowMouseUp(ev) {
    if (!this._boxSelecting || !this._selectRectEl || !this._boxStart) return;
    const parentRect = this.container.getBoundingClientRect();
    const left = parentRect.left + (parseFloat(this._selectRectEl.style.left) || 0);
    const top = parentRect.top + (parseFloat(this._selectRectEl.style.top) || 0);
    const right = left + (parseFloat(this._selectRectEl.style.width) || 0);
    const bottom = top + (parseFloat(this._selectRectEl.style.height) || 0);
    const minSize = 6;
    if ((right - left) < minSize || (bottom - top) < minSize) {
      try { this._selectRectEl.remove(); } catch(e){}
      this._selectRectEl = null; this._boxStart = null; this._boxSelecting = false; this._boxMode = null;
      return;
    }

    const metrics = this.getPlotMetrics();
    const { margin, plotW, plotH, minXSec, maxXSec, minY, maxY } = metrics;
    const clientToRelMicro = (clientX) => {
      const px = (clientX - parentRect.left) * this.dpr;
      const proportion = (px - margin.left) / plotW;
      const sec = minXSec + proportion * (maxXSec - minXSec || 1);
      return sec * 1e6;
    };

    if (this._boxMode === 'zoom') {
      const relA = clientToRelMicro(left);
      const relB = clientToRelMicro(right);
      if (ev.altKey) {
        const center = (relA + relB) / 2;
        const currentSpan = Math.max(1, this.viewMaxX - this.viewMinX || 1);
        const selSpan = Math.abs(relB - relA) || (currentSpan * 0.05);
        const factor = 1 + Math.max(0.2, selSpan / Math.max(1, currentSpan));
        const ext = this.computeGlobalExtents();
        const globalSpan = Math.max(1, ext.max - 0);
        let newSpan = Math.min(globalSpan + 1, currentSpan * factor);
        newSpan = Math.max(1, newSpan);
        let newMin = Math.max(0, center - newSpan / 2);
        let newMax = newMin + newSpan;
        if (newMax > ext.max) {
          newMax = ext.max;
          newMin = Math.max(0, newMax - newSpan);
        }
        this.viewMinX = Math.max(0, newMin);
        this.viewMaxX = Math.max(this.viewMinX + 1, newMax);
        this.resampleInViewAndRender();
        this._emit('status', '已向外扩展视窗（Alt 缩小视图）');
      } else {
        let newMin = Math.max(0, Math.min(relA, relB));
        let newMax = Math.max(newMin + 1, Math.max(relA, relB));
        const minSpan = Math.max(1, (newMax - newMin) * 0.00001);
        if (newMax - newMin < minSpan) {
          const center = (newMin + newMax) / 2;
          newMin = Math.max(0, center - minSpan/2);
          newMax = newMin + minSpan;
        }
        this.viewMinX = newMin; this.viewMaxX = newMax;
        this.resampleInViewAndRender();
        this._emit('status', '已聚焦到所选区域');
      }
    } else if (this._boxMode === 'select') {
      const addMode = ev.ctrlKey || ev.metaKey;
      const anySelected = [];
      const rectBox = {left, right, top, bottom};
      const xToClient = (xMicro) => {
        const px = margin.left + ((xMicro/1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
        return parentRect.left + (px / this.dpr);
      };
      const yToClient = (y) => {
        const py = margin.top + plotH - ((y - minY) / ((maxY - minY) || 1)) * plotH;
        return parentRect.top + (py / this.dpr);
      };
      for (let i=0;i<this.pinnedPoints.length;i++) {
        const p = this.pinnedPoints[i];
        const cx = xToClient(p.relMicro);
        const cy = yToClient(p.val);
        if (cx >= rectBox.left && cx <= rectBox.right && cy >= rectBox.top && cy <= rectBox.bottom) {
          p.selected = true; anySelected.push(p);
        } else {
          if (!addMode) p.selected = false;
        }
      }
      this._emit('pinnedChanged', this.pinnedPoints);
      if (anySelected.length) this._emit('status', `已框选 ${anySelected.length} 个标记`);
      else this._emit('status', '未选中任何标记');
    }

    try { this._selectRectEl.remove(); } catch(e){}
    this._selectRectEl = null; this._boxStart = null; this._boxSelecting = false; this._boxMode = null;

    this._suppressClick = true;
    setTimeout(()=> this._suppressClick = false, 120);
  }

  _onWheel(ev) {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.12 : (1/1.12);
    const centerClientX = ev.clientX;
    const centerRel = this.clientXToRelMicro(centerClientX);
    const span = Math.max(1, this.viewMaxX - this.viewMinX || 1);
    let newSpan = Math.max(1, span * factor);
    let newMin = Math.max(0, centerRel - newSpan / 2);
    let newMax = newMin + newSpan;
    const ext = this.computeGlobalExtents();
    if (newMax > ext.max) { newMax = ext.max; newMin = Math.max(0, newMax - newSpan); }
    this.viewMinX = newMin; this.viewMaxX = newMax;
    this.resampleInViewAndRender();
  }

  clientXToRelMicro(clientX) {
    const parentRect = this.canvas.getBoundingClientRect();
    const metrics = this.getPlotMetrics();
    const { margin, plotW, minXSec, maxXSec } = metrics;
    const px = (clientX - parentRect.left) * this.dpr;
    const proportion = (px - margin.left) / plotW;
    const sec = minXSec + proportion * (maxXSec - minXSec || 1);
    return sec * 1e6;
  }

  // touch handlers (simplified and robust)
  _onTouchStart(ev) {
    this._lastTouchTime = Date.now();
    this._touchState.active = true;
    this._touchState.moved = false;
    const touches = ev.touches;
    this._touchState.startTouches = Array.from(touches).map(t => ({id: t.identifier, clientX: t.clientX, clientY: t.clientY}));
    this._touchState.lastTouches = this._touchState.startTouches.slice();
    if (touches.length === 1) {
      this._touchState.mode = 'pan';
      this._touchState.panStartClientX = touches[0].clientX;
      this._touchState.panStartViewMin = this.viewMinX;
      if (this._touchState.longPressTimer) clearTimeout(this._touchState.longPressTimer);
      this._touchState.longPressTimer = setTimeout(() => {
        if (!this._touchState.moved) {
          const clientX = touches[0].clientX;
          const relMicro = this.clientXToRelMicro(clientX);
          // find nearest point close to that rel and pin
          let best = { d2: Infinity, series: null, point: null };
          const metrics = this.getPlotMetrics();
          const rect = this.canvas.getBoundingClientRect();
          const px = (clientX - rect.left) * this.dpr;
          const { margin, plotW, plotH, minXSec, maxXSec, minY, maxY } = metrics;
          for (const s of this.seriesList) {
            if (!s.visible) continue;
            const arr = s.sampled && s.sampled.length ? s.sampled : s.rel;
            if (!arr || arr.length === 0) continue;
            let lo = 0, hi = arr.length - 1;
            while (hi - lo > 3) {
              const mid = (lo + hi) >> 1;
              if (arr[mid][0] < relMicro) lo = mid; else hi = mid;
            }
            for (let i = Math.max(0, lo - 2); i <= Math.min(arr.length - 1, hi + 2); i++) {
              const p = arr[i];
              const sx = margin.left + ((p[0]/1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
              const sy = margin.top + plotH - ((p[1] - minY) / ((maxY - minY) || 1)) * plotH;
              const dx = sx - px, dy = sy - ((touches[0].clientY - rect.top) * this.dpr); const d2 = dx*dx + dy*dy;
              if (d2 < best.d2) best = { d2, series: s, point: p };
            }
          }
          if (best.series && best.point && best.d2 < (40 * this.dpr) * (40 * this.dpr)) {
            this.addPinned(best.series.id, best.point[0], best.point[1], best.series.color || '#333', best.series.name);
            this._emit('pinnedChanged', this.pinnedPoints);
            this.render();
            this._emit('status', '已长按固定一个点');
          }
        }
      }, 500);
    } else if (touches.length === 2) {
      this._touchState.mode = 'pinch';
      this._touchState.pinchStartDist = this._distanceBetweenTouches(touches[0], touches[1]);
      this._touchState.pinchStartSpan = Math.max(1, this.viewMaxX - this.viewMinX || 1);
      const mid = this._midpoint(touches[0], touches[1]);
      this._touchState.pinchCenterRel = this.clientXToRelMicro(mid.x);
    }
    ev.preventDefault();
  }

  _onTouchMove(ev) {
    this._lastTouchTime = Date.now();
    this._touchState.moved = true;
    if (!this._touchState.active) return;
    const touches = ev.touches;
    if (this._touchState.longPressTimer) { clearTimeout(this._touchState.longPressTimer); this._touchState.longPressTimer = null; }
    if (touches.length === 1 && this._touchState.mode === 'pan') {
      const dx = touches[0].clientX - (this._touchState.lastTouches[0] ? this._touchState.lastTouches[0].clientX : this._touchState.panStartClientX);
      const metrics = this.getPlotMetrics();
      const { margin, plotW, minXSec, maxXSec } = metrics;
      const spanSec = (this.viewMaxX - this.viewMinX) / 1e6;
      const prop = dx * this.dpr / plotW;
      const shiftSec = prop * (maxXSec - minXSec || 1);
      const shiftMicro = shiftSec * 1e6;
      this.viewMinX = Math.max(0, (this._touchState.panStartViewMin || this.viewMinX) - shiftMicro);
      this.viewMaxX = this.viewMinX + Math.max(1, this._touchState.pinchStartSpan || (this.viewMaxX - this.viewMinX));
      this.resampleInViewAndRender();
      this._touchState.lastTouches = Array.from(touches).map(t => ({id: t.identifier, clientX: t.clientX, clientY: t.clientY}));
    } else if (touches.length === 2) {
      const dist = this._distanceBetweenTouches(touches[0], touches[1]);
      const scale = dist / (this._touchState.pinchStartDist || dist);
      const startSpan = this._touchState.pinchStartSpan || Math.max(1, this.viewMaxX - this.viewMinX || 1);
      let newSpan = Math.max(1, startSpan / scale);
      const center = this._touchState.pinchCenterRel || this.clientXToRelMicro((touches[0].clientX + touches[1].clientX)/2);
      let newMin = Math.max(0, center - newSpan / 2);
      let newMax = newMin + newSpan;
      const ext = this.computeGlobalExtents();
      if (newMax > ext.max) { newMax = ext.max; newMin = Math.max(0, newMax - newSpan); }
      this.viewMinX = newMin; this.viewMaxX = Math.max(newMin + 1, newMax);
      this.resampleInViewAndRender();
      this._touchState.lastTouches = Array.from(touches).map(t => ({id: t.identifier, clientX: t.clientX, clientY: t.clientY}));
    }
    ev.preventDefault();
  }

  _onTouchEnd(ev) {
    this._lastTouchTime = Date.now();
    if (this._touchState.longPressTimer) { clearTimeout(this._touchState.longPressTimer); this._touchState.longPressTimer = null; }
    this._touchState.active = false;
    this._touchState.mode = null;
    this._touchState.startTouches = null;
    this._touchState.lastTouches = null;
    this._touchState.pinchStartDist = null;
    this._touchState.pinchStartSpan = null;
    this._touchState.pinchCenterRel = null;
    this._suppressClick = true; setTimeout(()=> this._suppressClick = false, 250);
    setTimeout(()=> { this._lastTouchTime = Date.now(); }, 10);
  }

  _distanceBetweenTouches(t1, t2) { const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY; return Math.hypot(dx, dy); }
  _midpoint(t1, t2) { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

  // keyboard handling (consumer can call chart.handleKeyEvent)
  handleKeyEvent(ev) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    const key = (ev.key || '').toLowerCase();
    const span = Math.max(1, this.viewMaxX - this.viewMinX || 1);
    const panStep = span * 0.12;
    const zoomFactor = 1.18;
    if (key === 'a') {
      ev.preventDefault();
      this.viewMinX = Math.max(0, this.viewMinX - panStep);
      this.viewMaxX = this.viewMinX + span;
      this.resampleInViewAndRender();
    } else if (key === 'd') {
      ev.preventDefault();
      const ext = this.computeGlobalExtents();
      this.viewMinX = Math.min(Math.max(0, ext.max - span), this.viewMinX + panStep);
      this.viewMaxX = this.viewMinX + span;
      this.resampleInViewAndRender();
    } else if (key === 'w') {
      ev.preventDefault();
      const center = (this.viewMinX + this.viewMaxX) / 2;
      const newSpan = Math.max(1, span / zoomFactor);
      this.viewMinX = Math.max(0, center - newSpan / 2);
      this.viewMaxX = this.viewMinX + newSpan;
      this.resampleInViewAndRender();
      this._emit('status', '已缩小视窗（快捷键）');
    } else if (key === 's') {
      ev.preventDefault();
      const center = (this.viewMinX + this.viewMaxX) / 2;
      const ext = this.computeGlobalExtents();
      const newSpan = Math.min(ext.max || (span * zoomFactor), span * zoomFactor);
      this.viewMinX = Math.max(0, center - newSpan / 2);
      this.viewMaxX = this.viewMinX + newSpan;
      this.resampleInViewAndRender();
      this._emit('status', '已放大视窗（快捷键）');
    } else if (key === 'q') {
      ev.preventDefault();
      if (this._hoverCandidate && this._hoverCandidate.series && this._hoverCandidate.point) {
        const s = this._hoverCandidate.series;
        const p = this._hoverCandidate.point;
        const existingIdx = this.pinnedPoints.findIndex(pp => pp.seriesId === s.id && pp.relMicro === p[0] && pp.val === p[1]);
        if (existingIdx >= 0) {
          this.pinnedPoints.splice(existingIdx, 1);
        } else {
          this.addPinned(s.id, p[0], p[1], s.color || '#333', s.name);
        }
        this._emit('pinnedChanged', this.pinnedPoints);
        this.render();
      } else {
        const sel = this.pinnedPoints.filter(p => p.selected);
        if (sel.length > 0) this.jumpToPin(sel[0]);
      }
    } else if (key === 'escape') {
      for (const p of this.pinnedPoints) p.selected = false;
      this._emit('pinnedChanged', this.pinnedPoints);
      this.render();
    } else if (key === 'delete' || key === 'backspace') {
      const toDel = this.pinnedPoints.filter(p => p.selected);
      if (toDel.length === 0) return;
      for (const p of toDel) {
        const idx = this.pinnedPoints.indexOf(p); if (idx >= 0) this.pinnedPoints.splice(idx, 1);
      }
      this._emit('pinnedChanged', this.pinnedPoints);
      this.render();
    }
  }

  jumpToPin(p) {
    const ext = this.computeGlobalExtents();
    const fullSpan = Math.max(1, ext.max || 1000);
    const span = Math.max(1, fullSpan * 0.02);
    this.viewMinX = Math.max(0, p.relMicro - span/2);
    this.viewMaxX = Math.max(this.viewMinX + 1, p.relMicro + span/2);
    this.resampleInViewAndRender();
  }

  // export PNG (simple)
  exportPNG() {
    const exportScale = 2;
    const w = this.canvas.width * exportScale; const h = this.canvas.height * exportScale;
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d'); tctx.scale(exportScale, exportScale);
    // reuse current canvas pixels
    tctx.drawImage(this.canvas, 0, 0, tmp.width, tmp.height);
    return new Promise(resolve => tmp.toBlob(blob => resolve(blob), 'image/png'));
  }
}