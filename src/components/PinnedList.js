import './PinnedList.css';
import { formatSI, formatSeconds } from "../utils/format.js";

export class PinnedList {
  constructor(container) {
    this.container = container;
    this.pinned = [];
    this.filter = '__all';
    this.groupBy = false;
    this.sortBy = 'time';
    // callbacks
    this.onJump = () => {};
    this.onDelete = () => {};
    // onSelect now means checkbox toggled (selection toggle)
    this.onSelect = () => {};
    // onHide toggles the pin.hidden flag (hide/show the pin itself)
    this.onHide = () => {};
    this._render();
  }

  setPinned(pins) { this.pinned = pins ? pins.slice() : []; this._render(); }
  updateOptions({ filter, groupBy, sortBy } = {}) {
    if (filter !== undefined) this.filter = filter;
    if (groupBy !== undefined) this.groupBy = groupBy;
    if (sortBy !== undefined) this.sortBy = sortBy;
    this._render();
  }
  _render() {
    this.container.innerHTML = '';
    let list = this.pinned.slice();
    if (this.filter && this.filter !== '__all') list = list.filter(p => p.seriesId === this.filter);
    if (this.sortBy === 'time') list.sort((a,b)=>a.relMicro-b.relMicro);
    if (this.sortBy === 'value') list.sort((a,b)=>a.val-b.val);
    if (this.sortBy === 'series') list.sort((a,b)=> (a.seriesName||'').localeCompare(b.seriesName) || a.relMicro - b.relMicro);
    if (this.groupBy) {
      const groups = {};
      for (const p of list) (groups[p.seriesName] = groups[p.seriesName] || []).push(p);
      for (const k of Object.keys(groups)) {
        const header = document.createElement('div'); header.className = 'pinned-group-header'; header.textContent = k;
        this.container.appendChild(header);
        for (const p of groups[k]) this.container.appendChild(this._makeRow(p));
      }
    } else {
      for (const p of list) this.container.appendChild(this._makeRow(p));
    }
  }

  _makeRow(p) {
    const el = document.createElement('div');
    // reflect selected and hidden states in class names
    el.className = 'pinned-item' + (p.selected ? ' selected' : '') + (p.hidden ? ' hidden' : '');
    // checkbox (explicit selection control)
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-checkbox';
    chk.setAttribute('aria-label', `选择 标记 ${p.seriesName} ${(p.relMicro/1e6).toFixed(3)}s`);
    chk.checked = !!p.selected;

    const meta = document.createElement('div'); meta.className='meta';
    const title = document.createElement('div'); title.className='title'; title.textContent = p.seriesName;
    const sub = document.createElement('div'); sub.className='sub'; sub.textContent = `${formatSeconds(p.relMicro/1e6)} — ${formatSI(p.val)}`;
    meta.appendChild(title); meta.appendChild(sub);
    const actions = document.createElement('div'); actions.className='actions';
    const jumpBtn = document.createElement('button'); jumpBtn.className='btn-ghost'; jumpBtn.textContent='跳转';
    const delBtn = document.createElement('button'); delBtn.className='btn-danger'; delBtn.textContent='删除';
    actions.appendChild(jumpBtn); actions.appendChild(delBtn);

    // layout: checkbox | meta | actions
    el.appendChild(chk);
    el.appendChild(meta);
    el.appendChild(actions);

    // Row click -> toggle pin.hidden (onHide), but ignore clicks from actions or checkbox
    el.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest) {
        if (ev.target.closest('.actions')) return;
        if (ev.target.classList && ev.target.classList.contains('pin-checkbox')) return;
      }
      this.onHide(p, ev);
    });

    // Checkbox click -> selection toggle. Stop propagation so row onHide won't run.
    chk.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onSelect(p, ev);
    });

    // action buttons handle their own clicks and stop propagation to avoid bubbling
    jumpBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.onJump(p); });
    delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.onDelete(p); });

    return el;
  }
}
