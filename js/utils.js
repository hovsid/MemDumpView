// utils.js - small utility helpers used across modules

export function escapeHtml(text){
  return String(text).replace(/[<>&"'`]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

export function makeMovable(popup, header){
  let offsetX=0, offsetY=0, isDown=false;
  header = header || popup.querySelector('.bar-popup-header,.info-popup-header');
  if(!header) return;
  header.onmousedown = e => {
    isDown = true;
    offsetX = e.clientX - popup.offsetLeft;
    offsetY = e.clientY - popup.offsetTop;
    document.body.style.userSelect = "none";
  };
  document.addEventListener('mousemove', e => {
    if(!isDown) return;
    popup.style.left = (e.clientX - offsetX) + "px";
    popup.style.top  = (e.clientY - offsetY) + "px";
  });
  document.addEventListener('mouseup', () => {
    isDown = false;
    document.body.style.userSelect = "";
  });
}

export function formatBytes(bytes){
  if(bytes === 0) return "0 B";
  const units = ['B','KB','MB','GB','TB','PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return (v>=100 ? v.toFixed(0) : v>=10 ? v.toFixed(1) : v.toFixed(2)) + " " + units[i];
}