import '../base-button/base-button.js';
import '../base-card/base-card.js';
import '../item-list/item-list.js';
import { dataModel } from '../../model/data-model.js';
import { inputHandler } from '../../model/input-handler.js';
import style from './file-card.css?raw';
import template from './file-card.html?raw';

const uploadIcon = `<svg class="icon" width="18" height="18" fill="none" viewBox="0 0 18 18"><rect x="8" y="3" width="2" height="12" rx="1"/><rect x="3" y="8" width="12" height="2" rx="1"/></svg>`;

export class FileCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }
  connectedCallback() {
    this._bind();
    this._updateList();
    dataModel.on && dataModel.on('sequences:changed', () => this._updateList());
  }

  _bind() {
    const uploadBtn = this.shadowRoot.getElementById('uploadBtn');
    const fileInput = this.shadowRoot.getElementById('fileInput');
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async (ev) => {
      const files = Array.from(ev.target.files || []);
      if (files.length === 0) return;
      this._setStatus('开始导入...', true);
      for (const f of files) {
        try {
          await inputHandler.handleInput(f);
          this._setStatus(`已导入 ${f.name}`);
        } catch (err) {
          this._setStatus(`导入失败: ${err && err.message ? err.message : err}`);
        }
      }
      fileInput.value = '';
    };

    const itemList = this.shadowRoot.getElementById('itemList');
    itemList.addEventListener('selection-change', e => {
      // 你可以用 e.detail 获取所有选中项的 key
    });
    itemList.menuConfig = [
      {
        label: '重命名',
        callback: (seq) => {
          const val = prompt('输入新文件名', seq.name);
          if (val && val !== seq.name) { seq.name = val; this._setStatus(`已重命名为${val}`); dataModel._emit && dataModel._emit('sequences:changed', dataModel.getSequences()); }
        }
      },
      {
        label: '导出为 JSON',
        callback: (seq) => {
          const out = { name: seq.name, nodes: seq.nodes ? seq.nodes.slice() : [] };
          const blob = new Blob([JSON.stringify({sequences:[out]}, null, 2)], {type:'application/json'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = seq.name + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          this._setStatus('已导出');
        }
      },
      {
        label: '删除文件',
        callback: (seq) => {
          let seqArr = dataModel.getSequences().filter(s => s !== seq && s.name !== seq.name);
          dataModel.setSequences(seqArr);
          this._setStatus('已删除');
        }
      }
    ];
  }

  _updateList() {
    const itemList = this.shadowRoot.getElementById('itemList');
    const arr = dataModel.getSequences ? dataModel.getSequences() : [];
    itemList.items = arr;
  }

  _setStatus(msg, loading = false) {
    const statusBar = document.querySelector('status-bar');
    if (statusBar && typeof statusBar.setStatus === 'function') {
      statusBar.setStatus(msg, loading);
    }
  }
}
customElements.define('file-card', FileCard);
