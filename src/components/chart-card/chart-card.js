import '../base-card/base-card.js';
import './chart-card.css';

export class ChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="图表">
        <!--canvas or chart placeholder slot-->
      </base-card>
    `;
  }
}
customElements.define('chart-card', ChartCard);