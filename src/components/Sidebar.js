import { makeColors } from "../utils/lttb.js";

export class Sidebar {
  constructor(container) {
    this.el = container;
    this.onOpenFile = () => {};
    this.onExportPNG = () => {};
    this.onExportCSV = () => {};
    this.onExportPinned = () => {};
    this.onClearAll = () => {};
    this.onAutoFit = () => {};
    this.onZoomReset = () => {};
    this.onResetOriginal = () => {};
    this.onFitAll = () => {};
    this.onTargetChange = () => {};
    this.legendClick = () => {};
    this._render();
  }

  _render() {
    this.el.innerHTML = `
      <div class="box" aria-label="交互">
        <strong>交互</strong>
        <button id="openFile" class="card-btn"><span>打开文件</span></button>
        <button id="exportPng" class="card-btn"><span>导出 PNG</span></button>
        <button id="exportCsv" class="card-btn"><span>导出 CSV</span></button>
        <button id="exportPinned" class="card-btn"><span>导出 标记CSV</span></button>
        <button id="clearAll" class="card-btn"><span>清除 所有</span></button>
      </div>
      <div class="box" aria-label="当前文件">
        <strong>当前文件</strong>
        <div id="legend" class="legend" style="margin-top:8px;"></div>
        <div class="small" style="margin-top:8px">已加载: <span id="seriesCount">0</span></div>
      </div>
      <div class="box" aria-label="视窗控制">
        <strong>视窗控制</strong>
        <div class="control-inline" style="margin-top:8px;">
          <label>目标采样点: <span id="globalTarget">1000</span></label>
          <input id="targetPoints" type="range" min="50" max="10000" step="10" value="1000" />
        </div>
        <div style="margin-top:8px;">
          <button id="autoFit" class="card-btn">自动适配像素</button>
          <button id="zoomReset" class="card-btn">重置视窗</button>
          <button id="resetOriginal" class="card-btn">恢复初始视窗</button>
          <button id="fitAll" class="card-btn">适配所有数据</button>
        </div>
      </div>
    `;
    this._refs = {
      openFile: this.el.querySelector('#openFile'),
      exportPng: this.el.querySelector('#exportPng'),
      exportCsv: this.el.querySelector('#exportCsv'),
      exportPinned: this.el.querySelector('#exportPinned'),
      clearAll: this.el.querySelector('#clearAll'),
      legend: this.el.querySelector('#legend'),
      targetPoints: this.el.querySelector('#targetPoints'),
      globalTarget: this.el.querySelector('#globalTarget'),
      autoFit: this.el.querySelector('#autoFit'),
      zoomReset: this.el.querySelector('#zoomReset'),
      resetOriginal: this.el.querySelector('#resetOriginal'),
      fitAll: this.el.querySelector('#fitAll'),
      seriesCount: this.el.querySelector('#seriesCount')
    };
    this._attach();
  }

  _attach() {
    this._refs.openFile.addEventListener('click', () => this.onOpenFile());
    this._refs.exportPng.addEventListener('click', () => this.onExportPNG());
    this._refs.exportCsv.addEventListener('click', () => this.onExportCSV());
    this._refs.exportPinned.addEventListener('click', () => this.onExportPinned());
    this._refs.clearAll.addEventListener('click', () => this.onClearAll());
    this._refs.targetPoints.addEventListener('input', (e) => {
      this._refs.globalTarget.textContent = e.target.value;
      this.onTargetChange(Number(e.target.value));
    });
    this._refs.autoFit.addEventListener('click', () => this.onAutoFit());
    this._refs.zoomReset.addEventListener('click', () => this.onZoomReset());
    this._refs.resetOriginal.addEventListener('click', () => this.onResetOriginal());
    this._refs.fitAll.addEventListener('click', () => this.onFitAll());
  }

  updateLegend(seriesList) {
    const el = this._refs.legend;
    el.innerHTML = '';
    if (!seriesList) return;
    const colors = makeColors(seriesList.length);
    seriesList.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.style.opacity = s.visible ? '1' : '0.45';
      item.innerHTML = `<span style="width:14px;height:14px;display:inline-block;border-radius:3px;background:${s.color||colors[i]}"></span><span>${s.name}</span>`;
      item.addEventListener('click', () => this.legendClick(s));
      el.appendChild(item);
    });
    this._refs.seriesCount.textContent = seriesList.length;
  }
}