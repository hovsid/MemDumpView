import style from './item-row.css?raw';
import template from './item-row.html?raw';
import '../base-menu/base-menu.js'

export class ItemRow extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
    this.$row = this.shadowRoot.querySelector('.item-row');
    this.$checkbox = this.shadowRoot.querySelector('.item-checkbox');
    this.$label = this.shadowRoot.querySelector('.item-label');
    this.$menuBtn = this.shadowRoot.querySelector('.menu-btn');
    this._menuConfig = [];
    this._item = null;
    this._checked = false;
  }

  set item(val) {
    this._item = val;
    this._update();
  }
  get item() { return this._item; }

  set checked(val) {
    this._checked = !!val;
    this.$checkbox.checked = !!val;
    if (this.$row) this.$row.classList.toggle('selected', !!val);
  }
  get checked() { return this._checked; }

  set menuConfig(arr) {
    this._menuConfig = Array.isArray(arr) ? arr : [];
  }
  get menuConfig() { return this._menuConfig; }

  connectedCallback() {
    this.$checkbox.addEventListener('change', (e) => {
      this.dispatchEvent(new CustomEvent('item-check-toggle', { detail: { item: this._item, checked: this.$checkbox.checked } }));
    });
    this.$menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      this._showMenu();
    });
  }

  _update() {
    if (!this._item) return;
    this.$label.textContent = this._item.name || this._item.id || '未命名';
    // checkbox/row selected状态由上级控制
  }

_showMenu() {
  // 移除旧
  this._removeMenu();
  // 构建 base-menu
  const menu = document.createElement('base-menu');
  menu.menuItems = this._menuConfig.map(cfg => ({
    ...cfg,
    // 对每个menu item，自动包裹关闭
    callback: (item) => {
      if (typeof cfg.callback === 'function') cfg.callback(this._item);
      // menu.remove() 已由 base-menu 内部保证
    }
  }));
  menu.addEventListener('item-click', (e) => {
    this.dispatchEvent(new CustomEvent('item-menu-action', { detail: { item: this._item, action: e.detail.label } }));
  });
  document.body.appendChild(menu);
  // 定位
  const rect = this.$menuBtn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  this._menuDom = menu;
  // detach/cleanup 由 base-menu 自动处理
}

  _removeMenu() {
    if (this._menuDom) try { this._menuDom.remove(); } catch { }
    if (this._menuOutHandler) document.removeEventListener('mousedown', this._menuOutHandler);
    this._menuDom = null; this._menuOutHandler = null;
  }
}
customElements.define('item-row', ItemRow);
