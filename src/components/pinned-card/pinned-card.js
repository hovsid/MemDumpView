import '../base-card/base-card.js';
import './pinned-card.css';

export class PinnedCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="标记点">
        <!--pinned points list placeholder-->
      </base-card>
    `;
  }
}
customElements.define('pinned-card', PinnedCard);