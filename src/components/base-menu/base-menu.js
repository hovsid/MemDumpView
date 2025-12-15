import style from './base-menu.css?raw';
import '../base-button/base-button.js'

export class BaseMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="base-menu"></div>
      <style>${style}</style>
    `;
    this._menu = this.shadowRoot.querySelector('.base-menu');
    this._closeHandler = this._onDocClick.bind(this);
  }

  set menuItems(val) {
    this._items = Array.isArray(val) ? val : [];
    this._render();
  }
  get menuItems() { return this._items || []; }

  connectedCallback() {
    document.addEventListener('mousedown', this._closeHandler);
  }
  disconnectedCallback() {
    document.removeEventListener('mousedown', this._closeHandler);
  }

  _render() {
    // 清除
    this._menu.innerHTML = '';
    if (!this._items) return;
    for (const item of this._items) {
      const btn = document.createElement('base-button');
      btn.type = item.type || '';
      btn.innerText = item.label || '';
      btn.style.width = '100%';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('item-click', { detail: item }));
        if (typeof item.callback === 'function') item.callback(item);
        this.remove();
      });
      this._menu.appendChild(btn);
    }
    // 支持 slot 扩展，比如底部附加插槽
    const slot = document.createElement('slot');
    this._menu.appendChild(slot);
  }

  _onDocClick(e) {
    // 如果不是点击在菜单本体上，则关闭自己
    if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
      this.remove();
    }
  }
}
customElements.define('base-menu', BaseMenu);
