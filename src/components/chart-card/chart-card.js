import '../base-card/base-card.js';
import style from './chart-card.css?raw';

export class ChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="图表">
        <!--canvas or chart placeholder slot-->
      </base-card>
      <style>${style}</style>
    `;
  }
}
customElements.define('chart-card', ChartCard);
