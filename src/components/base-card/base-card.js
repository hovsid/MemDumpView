import style from './base-card.css?raw';

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
    this.shadowRoot.innerHTML = `
      <div class="card-box">
        <div class="card-header"></div>
        <div class="card-content"><slot></slot></div>
        <div class="card-footer"><slot name="footer"></slot></div>
      </div>
      <style>${style}</style>
    `;
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'title' && this.shadowRoot) {
      this.shadowRoot.querySelector('.card-header').textContent = newVal;
    }
  }
  connectedCallback() {
    // set title on create
    this.attributeChangedCallback('title', null, this.getAttribute('title'));
  }
}
customElements.define('base-card', BaseCard);
