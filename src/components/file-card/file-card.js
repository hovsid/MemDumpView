import '../base-card/base-card.js';
import './file-card.css';

export class FileCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `
      <base-card title="当前文件">
        <!-- file list/content placeholder -->
      </base-card>
    `;
  }
}
customElements.define('file-card', FileCard);