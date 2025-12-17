import '../base-card/base-card.js';
import './chart-canvas.js';
import './chart-tooltip.js';
import template from './chart-card.html?raw';
import style from './chart-card.css?raw';
import { dataModel } from '../../model/data-model.js';

export class ChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }
  connectedCallback() {
    this.canvas = this.shadowRoot.getElementById('chart-canvas');
    this.tooltip = this.shadowRoot.getElementById('chart-tooltip');
    this._bind();
    this._update();
    dataModel.on && dataModel.on('sequences:changed', () => this._update());
  }

  _update() {
    // 提取并传递数据
    const arr = dataModel.getSequences && dataModel.getSequences();
    this.canvas.sequences = arr || [];
    if (arr && arr.length) {
      this.canvas.range = dataModel.sequenceList && dataModel.sequenceList.range;
    }
  }
  _bind() {
    // 监听canvas抛出的 point-hover 事件
    this.canvas.addEventListener('point-hover', (e) => {
      if (!e.detail) { this.tooltip.hide(); return; }
      const {node, seq, clientX, clientY} = e.detail;
      let content = `<strong>序列名：</strong>${seq.label || ''}<br>`;
      Object.entries(node).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (typeof v === 'function') return;
        content += `<strong>${k}：</strong>${v}<br>`;
      });
      this.tooltip.show({x: clientX, y: clientY, content});
    });
  }
}
customElements.define('chart-card', ChartCard);
