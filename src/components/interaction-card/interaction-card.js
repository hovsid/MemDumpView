import '../base-card/base-card.js';
import './interaction-card.css';

export class InteractionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="交互">
        <!--content/controls slot-->
      </base-card>
    `;
  }
}
customElements.define('interaction-card', InteractionCard);
