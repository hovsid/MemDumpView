import '../base-card/base-card.js';
import style from './pinned-card.css?raw';

export class PinnedCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="标记点">
        <!--pinned points list placeholder-->
      </base-card>
      <style>${style}</style>
    `;
  }
}
customElements.define('pinned-card', PinnedCard);
