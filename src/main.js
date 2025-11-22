import { Sidebar } from "./components/Sidebar.js";
import { Chart } from "./components/Chart.js";
import { PinnedList } from "./components/PinnedList.js";
import { formatSeconds } from "./utils/format.js";

const app = document.getElementById('app');
app.innerHTML = `
  <div class="controls"><div class="left small">拖拽上传或使用左侧“交互”面板打开文件。</div><div style="margin-left:auto" class="small">悬停显示点、点击固定浮窗、滚轮缩放、拖拽平移、双击复位</div></div>
  <div id="status" class="box" style="display:flex;align-items:center;gap:8px;">就绪</div>
  <div class="main">
    <div id="sidebar" class="sidebar"></div>
    <div id="chartWrap" class="chart-wrap box"></div>
    <div id="rightbar" class="rightbar"></div>
  </div>
`;

const statusEl = document.getElementById('status');
const sidebar = new Sidebar(document.getElementById('sidebar'));
const chartWrap = document.getElementById('chartWrap');
const rightbar = document.getElementById('rightbar');

const chart = new Chart(chartWrap);

// tooltip element
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function setStatus(msg, loading = false) {
  statusEl.textContent = msg;
  statusEl.setAttribute('aria-live', 'polite');
  if (loading) statusEl.classList.add('loading'); else statusEl.classList.remove('loading');
}

// pinned list UI
const pinnedListContainer = document.createElement('div');
pinnedListContainer.className = 'box pinned-box';
pinnedListContainer.innerHTML = `<strong>标记点（Pinned）</strong><div class="small" style="margin-bottom:6px">支持 Shift/Ctrl 多选或按住 Shift 框选</div><div id="pinnedListRoot" style="margin-top:8px"></div>`;
rightbar.appendChild(pinnedListContainer);
const pinnedList = new PinnedList(document.getElementById('pinnedListRoot'));

// wire sidebar
sidebar.onOpenFile = async () => {
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = '.csv,text/csv,text/plain'; fi.multiple = true; fi.style.display = 'none';
  fi.addEventListener('change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) { setStatus('未选择文件'); return; }
    setStatus('开始解析文件...');
    for (const f of files) await chart.loadFile(f);
  });
  document.body.appendChild(fi);
  fi.click();
  setTimeout(()=> fi.remove(), 3000);
};
sidebar.onExportPNG = async () => {
  // 允许未来传入 scale（可以扩展 Sidebar UI），目前使用默认 scale=2
  const blob = await chart.exportPNG(2);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'chart.png'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onExportCSV = () => {
  const arr = [];
  for (const s of chart.seriesList) {
    const arrPts = s.sampled && s.sampled.length ? s.sampled : s.rel;
    if (!arrPts) continue;
    for (const p of arrPts) arr.push(`${JSON.stringify(s.name)},${p[0]},${p[1]}`);
  }
  const out = 'series,rel_us,value\n' + arr.join('\n');
  const blob = new Blob([out], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sampled.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onExportPinned = () => {
  const blob = chart.exportPinnedCSV();
  if (!blob) { alert('没有任何标记点可导出'); return; }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'pinned.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onClearAll = () => { chart.seriesList = []; chart.clearPinned(); chart.resampleInViewAndRender(); sidebar.updateLegend([]); pinnedList.setPinned([]); setStatus('已清除所有序列及标记'); };
// connect targetPoints to chart
sidebar.onTargetChange = (v) => { chart.setSampleTarget(v); chart.resampleInViewAndRender(); setStatus(`目标采样点: ${v}`); };
sidebar.onAutoFit = () => { chart.resampleInViewAndRender(); setStatus('已自动适配像素'); };
sidebar.onZoomReset = () => { chart.viewMinX = 0; chart.viewMaxX = chart.computeGlobalExtents().max; chart.resampleInViewAndRender(); setStatus('视窗已重置'); };
sidebar.onResetOriginal = () => {
  if (!chart.originalViewSet) { alert('尚未记录初始视窗'); return; }
  chart.viewMinX = chart.originalViewMin; chart.viewMaxX = chart.originalViewMax; chart.resampleInViewAndRender(); setStatus('已恢复到初始视窗');
};
sidebar.onFitAll = () => { const ext = chart.computeGlobalExtents(); chart.viewMinX = 0; chart.viewMaxX = ext.max; chart.resampleInViewAndRender(); setStatus('已适配所有数据'); };

// wire chart events to UI
chart.on('status', (msg) => setStatus(msg));
chart.on('seriesChanged', (series) => sidebar.updateLegend(series));
chart.on('pinnedChanged', (pins) => {
  pinnedList.setPinned(pins);
});
chart.on('resampled', () => {
  // update pinned tooltips positions via render event
});
chart.on('rendered', ({metrics}) => {
  // update pinned tooltip DOM positions if pinned exist
  updatePinnedTooltips(metrics);
});
chart.on('hover', (candidate) => {
  if (!candidate) { tooltip.style.display = 'none'; return; }
  tooltip.style.display = 'block';
  tooltip.style.left = candidate.clientX + 'px';
  tooltip.style.top = (candidate.clientY - 8) + 'px';
  tooltip.style.background = candidate.series.color || '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '8px 10px';
  tooltip.style.borderRadius = '8px';
  tooltip.innerHTML = `<div style="font-weight:700">${candidate.series.name}</div><div style="opacity:0.95">${formatSeconds(candidate.point[0]/1e6)} — ${candidate.point[1]}</div>`;
});

// pinnedList interactions
pinnedList.onJump = (p) => {
  chart.jumpToPin(p);
  setStatus(`跳转到 ${p.seriesName}`);
};
pinnedList.onDelete = (p) => { chart.removePinned(p); setStatus('已删除标记', false); };
pinnedList.onSelect = (p, ev) => {
  p.selected = !p.selected;
  chart._emit('pinnedChanged', chart.pinnedPoints);
};

// expose keyboard handling: ensure keyboard events are processed
window.addEventListener('keydown', (ev) => chart.handleKeyEvent(ev), true);

// Drag & drop upload (on chartWrap)
let dragCounter = 0;
const dropOverlay = document.createElement('div');
dropOverlay.className = 'drop-overlay';
dropOverlay.style.display = 'none';
dropOverlay.innerHTML = `<div class="message">释放文件以上传（支持多个 CSV）</div>`;
chartWrap.appendChild(dropOverlay);

chartWrap.addEventListener('dragenter', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  dragCounter++;
  chartWrap.classList.add('dragover');
  dropOverlay.style.display = 'flex';
  setStatus('检测到拖拽文件，释放以上传', true);
});
chartWrap.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
chartWrap.addEventListener('dragleave', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) { chartWrap.classList.remove('dragover'); dropOverlay.style.display = 'none'; setStatus('就绪', false); dragCounter = 0; }
});
chartWrap.addEventListener('drop', async (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  chartWrap.classList.remove('dragover'); dropOverlay.style.display = 'none'; dragCounter = 0;
  setStatus('开始处理拖拽的文件...', true);
  try {
    const items = ev.dataTransfer.files;
    if (!items || items.length === 0) { setStatus('未检测到文件', false); return; }
    for (const f of Array.from(items)) {
      if (f && f.size > 0) await chart.loadFile(f);
    }
    const ext = chart.computeGlobalExtents();
    chart.viewMinX = 0; chart.viewMaxX = ext.max; chart.setCanvasSize(); chart.resampleInViewAndRender();
    setStatus('上传完成', false);
  } catch (err) {
    console.error('[drop] error', err);
    setStatus('上传失败: ' + (err && err.message ? err.message : err), false);
    alert('上传失败: ' + (err && err.message ? err.message : err));
  }
});

// Utility: update pinned tooltip DOMs (created here)
// 优化：复用已存在的 DOM 元素，避免每次 render 都 remove/create
const pinnedTooltipMap = new Map(); // key -> {el, lastSeenAt}
function pinnedKey(p) { return `${p.seriesId}::${p.relMicro}`; }

function updatePinnedTooltips(metrics) {
  const now = Date.now();
  // mark all existing as unseen; we'll set lastSeenAt for ones we keep
  for (const v of pinnedTooltipMap.values()) v._seen = false;

  if (!chart.pinnedPoints || chart.pinnedPoints.length === 0) {
    // remove all
    for (const kv of pinnedTooltipMap.entries()) {
      try { kv[1].el.remove(); } catch(e){}
    }
    pinnedTooltipMap.clear();
    return;
  }

  const m = metrics || chart.getPlotMetrics();
  const { margin, plotW, plotH, minXSec, maxXSec, minY, maxY } = m;
  const rect = chart.canvas.getBoundingClientRect();
  const xToPx = (xMicro) => margin.left + ((xMicro / 1e6 - minXSec) / ((maxXSec - minXSec) || 1)) * plotW;
  const yToPx = (y) => margin.top + plotH - ((y - minY) / ((maxY - minY) || 1)) * plotH;

  const currentKeys = new Set();
  for (const p of chart.pinnedPoints) {
    const key = pinnedKey(p);
    currentKeys.add(key);
    let node = pinnedTooltipMap.get(key);
    const s = chart.seriesList.find(x => x.id === p.seriesId && x.visible);
    if (!s) {
      // if series hidden, skip (but keep DOM around)
      if (node) { node.el.style.display = 'none'; node._seen = true; node.lastSeenAt = now; }
      continue;
    }
    const pxCanvas = xToPx(p.relMicro);
    const pyCanvas = yToPx(p.val);
    const clientX = rect.left + (pxCanvas / chart.dpr);
    const clientY = rect.top + (pyCanvas / chart.dpr) - 8;
    if (!node) {
      const el = document.createElement('div');
      el.className = 'pinned-tooltip';
      el.style.position = 'fixed';
      el.style.zIndex = 9998;
      document.body.appendChild(el);
      node = { el, lastSeenAt: now, _seen: true };
      pinnedTooltipMap.set(key, node);
    } else {
      node._seen = true;
      node.lastSeenAt = now;
      node.el.style.display = 'block';
    }
    node.el.style.left = clientX + 'px';
    node.el.style.top = clientY + 'px';
    node.el.style.background = p.selected ? 'linear-gradient(90deg, rgba(43,108,176,0.95), rgba(43,108,176,0.85))' : (p.color || '#333');
    node.el.style.color = '#fff';
    node.el.style.padding = '8px 10px';
    node.el.style.borderRadius = '8px';
    node.el.style.fontSize = '12px';
    node.el.innerHTML = `<div style="font-weight:700">${p.seriesName}</div><div style="opacity:0.95">${(p.relMicro/1e6).toFixed(3)}s — ${p.val}</div>`;
  }

  // clean up old nodes not in currentKeys (delay removal slightly to avoid flicker)
  for (const [key, node] of pinnedTooltipMap.entries()) {
    if (!currentKeys.has(key)) {
      // remove
      try { node.el.remove(); } catch(e){}
      pinnedTooltipMap.delete(key);
    }
  }
}

// try load sample files (best-effort)
(async function tryLoadSamples() {
  const samples = ['sample1.csv', 'sample2.csv'];
  for (const s of samples) {
    try {
      const resp = await fetch(s);
      if (!resp.ok) continue;
      const text = await resp.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parsed = [];
      for (const line of lines) {
        const parts = line.split(',').map(x => x.trim()); const x = Number(parts[0]); const y = Number(parts[1]);
        if (isFinite(x) && isFinite(y)) parsed.push([x,y]);
      }
      if (parsed.length === 0) continue;
      const id = crypto.randomUUID?.() || `s${Date.now()}${Math.random()}`;
      parsed.sort((a,b)=>a[0]-b[0]);
      const firstX = parsed[0][0];
      const rel = parsed.map(p=>[p[0]-firstX, p[1]]);
      chart.seriesList.push({id, name:s, raw: parsed, rel, sampled: [], color:'', visible:true, firstX});
    } catch(e){}
  }
  if (chart.seriesList.length > 0) {
    chart._applyColors();
    const ext = chart.computeGlobalExtents();
    chart.viewMinX = 0; chart.viewMaxX = ext.max; chart.setCanvasSize(); chart.resampleInViewAndRender(); sidebar.updateLegend(chart.seriesList);
    if (!chart.originalViewSet) { chart.originalViewMin = 0; chart.originalViewMax = ext.max; chart.originalViewSet = true; }
  }
})();

// initial render
chart.resampleInViewAndRender();
setStatus('就绪');
