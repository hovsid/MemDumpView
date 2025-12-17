import style from './chart-tooltip.css?raw';

export class ChartTooltip extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `<style>${style}</style><div id="tooltip" class="tooltip"></div>`;
    this.$tooltip = this.shadowRoot.getElementById('tooltip');
    this._visible = false;
  }

  show({x, y, content}) {
    this.$tooltip.innerHTML = content || '';
    this.$tooltip.style.display = 'block';
    // 简单定位，防止溢出
    const pad = 14;
    let left = x + pad, top = y + pad;
    const rect = this.$tooltip.getBoundingClientRect();
    const winW = window.innerWidth, winH = window.innerHeight;
    if (left + rect.width > winW - 10) left = x - rect.width - pad;
    if (top + rect.height > winH - 10) top = y - rect.height - pad;
    this.$tooltip.style.left = left + 'px';
    this.$tooltip.style.top = top + 'px';
    this._visible = true;
  }
  hide() {
    this.$tooltip.innerHTML = '';
    this.$tooltip.style.display = 'none';
    this._visible = false;
  }
}
customElements.define('chart-tooltip', ChartTooltip);
