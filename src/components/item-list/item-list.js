import style from './item-list.css?raw';
import template from './item-list.html?raw';
import './item-row.js';

export class ItemList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
    this._list = null;   // BaseList 实例
    this._menuConfig = [];
    this._selected = new Set();
    this._listEl = this.shadowRoot.getElementById('list');
  }

  set list(listObj) {
    if (this._list === listObj) return;
    this._list = listObj;
    if (this._list && this._list.on) {
      this._list.on('changed', (e) => this.renderList());
    }
    this.renderList();
  }
  get list() { return this._list; }

  set menuConfig(menus) {
    this._menuConfig = menus || [];
    this.renderList();
  }
  get menuConfig() { return this._menuConfig; }

  get selected() { return Array.from(this._selected); }
  set selected(list) {
    this._selected = new Set(list || []);
    this.renderList();
  }

  renderList() {
    if (!this._list) return;
    const items = this._list.getItems();
    const root = this._listEl;
    root.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('item-row');
      row.item = item;
      row.checked = this._selected.has(item._key);
      row.menuConfig = this._menuConfig;
      // 删除：由item-row冒泡。此处负责实际删除
      row.addEventListener('item-delete', e => {
        this._list.remove(item);
        this.renderList();
      });
      row.addEventListener('item-toggle', e => {
        // 默认已写入item; 这里 emit changed 以保证外部/图表响应
        this._list._emit && this._list._emit('changed', e);
        this.renderList();
      });
      // 重命名
      row.addEventListener('item-renamed', e => {
        // 默认已写入item; 这里 emit changed 以保证外部/图表响应
        this._list._emit && this._list._emit('changed', e);
        this.renderList();
      });
      // 选中 toggle
      row.addEventListener('item-check-toggle', e => {
        const { item: ritem, checked } = e.detail || {};
        if (checked) this._selected.add(ritem._key);
        else this._selected.delete(ritem._key);
        this.dispatchEvent(new CustomEvent('selection-change', { detail: this.selected }));
        this.renderList();
      });
      // 由item-row放行的菜单事件
      row.addEventListener('item-menu-action', e => {
        this.dispatchEvent(new CustomEvent('menu-action', { detail: { ...e.detail } }));
      });
      root.appendChild(row);
    }
  }
}

customElements.define('item-list', ItemList);
