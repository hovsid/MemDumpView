import { dataModel, SequenceItem } from './data-model.js';

class InputHandler {
  async _parseText(file) {
    const id = 'seq_' + Math.random().toString(36).slice(2, 10);
    const label = file.name.replace(/\.(txt|json)$/i, '');
    const seq = new SequenceItem({ label: label, nodes: [] });
    seq._id = id;
    seq.loading = true;
    dataModel.addSequence(seq); // UI刷出占位条
    const text = await file.text(); // 若需更彻底流式可改为分段读取
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sequence = { label: seq.label, nodes: [] };
    for (const line of lines) {
      if (!line) continue;
      let [x, y, label, ...rest] = line.split(',');
      if (x == null || y == null) continue;
      let metaRaw = rest.length ? rest.join(',') : undefined;
      let meta = undefined;
      if (metaRaw) {
        try { meta = JSON.parse(metaRaw); } catch { meta = metaRaw; }
      }
      const node = { x: Number(x), y: Number(y) };
      if (label) node.label = label.trim();
      if (meta !== undefined) node.meta = meta;
      sequence.nodes.push(node);
    }
    seq.initNodeList(sequence.nodes);
    dataModel._emit('sequences:changed', dataModel.getSequences());
    seq.loading = false;
  }

  async _parseJson(file) {
    let parsed;
    try {
      const text = await file.text(); // 若需更彻底流式可改为分段读取
      parsed = JSON.parse(text);
    } catch (e) { throw new Error('JSON解析失败: ' + e.message); }
    if (!parsed) {
      throw new Error('JSON 内容为空或格式无效');
    }
    if (Array.isArray(parsed)) {
      parsed.forEach(seq => {
        dataModel.addSequence(seq);
      });
    } else if (parsed.nodes && Array.isArray(parsed.nodes)) {
      dataModel.addSequence(parsed);
    } else {
      throw new Error('JSON 内容格式无效');
    }
  }

  async handleInput(file) {
    // 真正的解析/IO留到后台，不阻塞主线程
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'json') {
      await this._parseJson(file);
    } else if (ext === 'txt' || ext === 'csv' || ext === 'log') {
      await this._parseText(file);
    } else {
      throw new Error('仅支持txt或json格式输入');
    }
  }
}
export const inputHandler = new InputHandler();
