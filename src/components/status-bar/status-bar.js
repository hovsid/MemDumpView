import style from './status-bar.css?raw';
import template from './status-bar.html?raw';

export class StatusBar extends HTMLElement {
  static get observedAttributes() { return ['message', 'loading']; }
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }

  // 属性变化响应
  attributeChangedCallback(name, oldV, newV) {
    if (name === 'message') {
      this.shadowRoot.getElementById('msg').textContent = newV || '';
    }
    if (name === 'loading') {
      this.shadowRoot.getElementById('spinner').style.display =
        (newV === '' || newV === 'true') ? '' : 'none';
    }
  }

  // JS调用接口
  setStatus(msg, loading = false) {
    this.setAttribute('message', msg || '');
    if (loading) this.setAttribute('loading', '');
    else this.removeAttribute('loading');
  }
}
customElements.define('status-bar', StatusBar);
