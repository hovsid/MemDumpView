import style from './base-card.css?raw';
import template from './base-card.html?raw'

/**
 * <base-card title="xxx">
 *   slot: content
 *   <div slot="footer"></div>
 * </base-card>
 */
export class BaseCard extends HTMLElement {
  static get observedAttributes() { return ['title']; }
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'title' && this.shadowRoot) {
      this.shadowRoot.querySelector('.card-header').textContent = newVal;
    }
  }
  connectedCallback() {
    this.attributeChangedCallback('title', null, this.getAttribute('title'));
  }
}
customElements.define('base-card', BaseCard);
