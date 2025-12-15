import style from './item-list.css?raw';
import template from './item-list.html?raw';
import './item-row.js';

export class ItemList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
    this._items = [];
    this._menuConfig = [];
    this._selected = new Set();
    this._listEl = this.shadowRoot.getElementById('list');
  }

  set items(arr) {
    this._items = arr || [];
    this._ensureKeySet();
    this.renderList();
  }
  get items() { return this._items; }

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

  _ensureKeySet() {
    for (const item of this._items) {
      if (item._key != null) continue;
      if (item.id !== undefined) item._key = item.id;
      else if (item.name !== undefined) item._key = item.name;
      else item._key = Math.random().toString(36).slice(2, 9);
    }
  }

  renderList() {
    const root = this._listEl;
    root.innerHTML = '';
    for (const item of this._items) {
      const row = document.createElement('item-row');
      row.item = item;
      row.checked = this._selected.has(item._key);
      row.menuConfig = this._menuConfig;
      row.addEventListener('item-check-toggle', e => {
        const { item: ritem, checked } = e.detail || {};
        if (checked) this._selected.add(ritem._key);
        else this._selected.delete(ritem._key);
        this.dispatchEvent(new CustomEvent('selection-change', { detail: this.selected }));
        this.renderList();
      });
      row.addEventListener('item-menu-action', e => {
        // 如果需要，可以在此派发自定义事件给 file-card/card
        this.dispatchEvent(new CustomEvent('menu-action', { detail: { ...e.detail } }));
      });
      root.appendChild(row);
    }
  }
}

customElements.define('item-list', ItemList);
