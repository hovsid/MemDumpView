import './status-bar.css';

export class StatusBar extends HTMLElement {
  static get observedAttributes() { return ['message', 'loading']; }
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <div class="status-bar">
        <span id="msg"></span>
        <span id="spinner" class="spinner" style="display:none;"></span>
      </div>
    `;
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
