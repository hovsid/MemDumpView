// Shared Card component - simple DOM wrapper (no framework)
// Import its CSS so Vite will bundle it when this module is imported.
import './Card.css';

export function createCard(title = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-box';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.textContent = title || '';
  wrapper.appendChild(header);

  const content = document.createElement('div');
  content.className = 'card-content';
  wrapper.appendChild(content);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  footer.style.display = 'none';
  wrapper.appendChild(footer);

  return {
    el: wrapper,
    headerEl: header,
    contentEl: content,
    footerEl: footer,
    setTitle(t) { header.textContent = t; },
    showFooter(show) { footer.style.display = show ? '' : 'none'; }
  };
}
