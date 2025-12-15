// app-main.js
// 主入口文件，布局调整为：
// - 底部为状态栏（自定义卡片）
// - 主布局为三栏（左、中、右），左边为两张卡片自上而下（交互卡+文件卡），中为图表卡片，右为标记点卡片

import './components/base-card/base-card.js';
import './components/interaction-card/interaction-card.js';
import './components/file-card/file-card.js';
import './components/chart-card/chart-card.js';
import './components/pinned-card/pinned-card.js';
import './components/status-bar/status-bar.js';
import { dataModel } from './model/data-model.js';
import { inputHandler } from './model/input-handler.js';

// 主页面布局
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  // 主栅格布局
  app.innerHTML = `
    <div class="main-layout">
      <div class="main-left">
        <interaction-card id="interactionCard"></interaction-card>
        <file-card id="fileCard"></file-card>
      </div>
      <div class="main-center">
        <chart-card id="chartCard"></chart-card>
      </div>
      <div class="main-right">
        <pinned-card id="pinnedCard"></pinned-card>
      </div>
    </div>
    <status-bar id="statusBar"></status-bar>
  `;

  // 全局状态栏引用与接口
  const statusBar = document.getElementById('statusBar');
  const setStatus = (msg, loading = false) => {
    if (statusBar && typeof statusBar.setStatus === 'function') {
      statusBar.setStatus(msg, loading);
    } else {
      statusBar.setAttribute('message', msg || '');
      if (loading) statusBar.setAttribute('loading', '');
      else statusBar.removeAttribute('loading');
    }
  };

  // 监听模型或输入处理事件（这里只演示状态栏状态实时更新部分）
  // 你可以根据业务在这里监听并分发各种状态
  dataModel.on && dataModel.on('sequences:changed', () => setStatus('数据已更新'));
  // 你也可以添加更多生命周期状态回调通知
  // 在 inputHandler 解析前后调用 setStatus("xxx", true/false) 实现高亮 loading 状态

  // 例如上传文件后的处理
  // 以下仅为例子，实际应由 interaction-card 内部文件上传调用
  // document.getElementById('interactionCard').addEventListener('file-upload-start', () => setStatus('正在加载文件...', true));
  // document.getElementById('interactionCard').addEventListener('file-upload-end', () => setStatus('加载完成'));

  // Debug: 可直接打开文件测试（支持txt、json）
  // （你可以在 InteractionCard 里实现文件打开按钮触发 inputHandler.handleInput）
  // setStatus('就绪');
});

// 页面样式调整建议，写在 styles.css 中：
// .main-layout { display: flex; flex-direction: row; gap: 16px; flex: 1 1 auto; min-height: 0; }
// .main-left { display: flex; flex-direction: column; gap: 16px; flex: 0 0 320px; min-width: 220px; max-width: 340px; }
// .main-center { flex: 1 1 auto; min-width: 340px; display: flex; flex-direction: column; }
// .main-right { flex: 0 0 320px; display: flex; flex-direction: column; min-width: 220px; max-width: 340px; }
// status-bar { margin-top: 16px; display: block; width: 100%; }
