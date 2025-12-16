import style from './item-row.css?raw';
import template from './item-row.html?raw';
import '../base-menu/base-menu.js';

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
    // 行点击（非菜单/checkbox区域）切换hidden
    this.$row.addEventListener('click', (ev) => {
      if (ev.target.closest('.menu-btn') || ev.target.classList.contains('item-checkbox')) return;
      if (this._item) {
        this._item.hidden = !this._item.hidden;
        console.log('item hidden toggled:', JSON.stringify(this._item));
        // 通知外层刷新（由 list 监听 changed 事件触发）
        this.dispatchEvent(new CustomEvent('item-toggle', { detail: { item: this._item }, bubbles: true, composed: true }));
        this._update();
      }
    });
  }

  _update() {
    if (!this._item) return;
    this.$label.textContent = this._item.label || '未命名';
    if (this.$row) this.$row.style.opacity = this._item.hidden ? '0.45' : '1';
  }

  _showMenu() {
    this._removeMenu();
    const menu = document.createElement('base-menu');
    // 默认内置：重命名/删除，外部只需扩展（如导出）
    const baseMenus = [
      {
        label: '重命名',
        callback: () => {
          const oldLabel = this._item.label || '';
          const val = prompt('输入新名称', oldLabel);
          if (val && val !== oldLabel) {
            this._item.label = val;
            this.dispatchEvent(new CustomEvent('item-renamed', { detail: { item: this._item, label: val }, bubbles: true, composed: true }));
            this._update();
          }
        }
      },
      {
        label: '删除',
        callback: () => {
          this.dispatchEvent(new CustomEvent('item-delete', { detail: { item: this._item }, bubbles: true, composed: true }));
        }
      }
    ];
    const extraMenus = (this._menuConfig || []).map(cfg => ({
      ...cfg,
      callback: () => { if (typeof cfg.callback === 'function') cfg.callback(this._item); }
    }));

    menu.menuItems = [...baseMenus, ...extraMenus];
    menu.addEventListener('item-click', (e) => {
      this.dispatchEvent(new CustomEvent('item-menu-action', { detail: { item: this._item, action: e.detail.label } }));
    });
    document.body.appendChild(menu);
    const rect = this.$menuBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    this._menuDom = menu;
  }

  _removeMenu() {
    if (this._menuDom) try { this._menuDom.remove(); } catch { }
    this._menuDom = null;
  }
}
customElements.define('item-row', ItemRow);
