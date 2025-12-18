import '../base-button/base-button.js';
import '../base-card/base-card.js';
import '../item-list/item-list.js';
import { dataModel } from '../../model/data-model.js';
import { inputHandler } from '../../model/input-handler.js';
import style from './file-card.css?raw';
import template from './file-card.html?raw';

const uploadIcon = ``;

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
        label: '导出为 JSON',
        callback: (seq) => {
          // 此回调在 item-row 中被触发
          const blob = new Blob([JSON.stringify(seq, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (seq.label || '序列') + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          this._setStatus('已导出');
        }
      }
    ];
  }

  _updateList() {
    const itemList = this.shadowRoot.getElementById('itemList');
    itemList.list = dataModel.sequenceList;
  }

  _setStatus(msg, loading = false) {
    const statusBar = document.querySelector('status-bar');
    if (statusBar && typeof statusBar.setStatus === 'function') {
      statusBar.setStatus(msg, loading);
    }
  }
}
customElements.define('file-card', FileCard);
