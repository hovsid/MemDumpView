import template from './base-button.html?raw';
import style from './base-button.css?raw';

// <base-button type="primary" disabled>
//   <span slot="icon"><svg>...</svg></span>
//   按钮文本
// </base-button>
export class BaseButton extends HTMLElement {
  static get observedAttributes() { return ['type', 'disabled']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }
  connectedCallback() {
    this._update();
  }
  attributeChangedCallback() { this._update(); }
  set disabled(val) {
    if (val) this.setAttribute('disabled', ''); else this.removeAttribute('disabled');
    this._update();
  }
  get disabled() { return this.hasAttribute('disabled'); }
  _update() {
    const btn = this.shadowRoot.querySelector('button');
    btn.className = `base-btn${this.getAttribute('type') ? ' ' + this.getAttribute('type') : ''}`;
    btn.disabled = this.hasAttribute('disabled');
  }
}
customElements.define('base-button', BaseButton);
