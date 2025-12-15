import './base-button.css';

// <base-button type="primary" disabled>
//   <span slot="icon"><svg>...</svg></span>
//   按钮文本
// </base-button>
export class BaseButton extends HTMLElement {
  static get observedAttributes() { return ['type', 'disabled']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <button class="base-btn">
        <span class="icon"><slot name="icon"></slot></span>
        <span class="label"><slot></slot></span>
      </button>
    `;
  }
  connectedCallback() {
    this._update();
    this.shadowRoot.querySelector('button').addEventListener('click', (e) => {
      if (this.disabled) return;
      this.dispatchEvent(new Event('click', { bubbles: true }));
    });
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
