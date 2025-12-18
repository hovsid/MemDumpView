import { dataModel, SequenceItem } from './data-model.js';

class InputHandler {
  async handleInput(file) {
    // 1. 生成唯一ID和预占位空节点
    const id = 'seq_' + Math.random().toString(36).slice(2, 10);
    const label = file.name.replace(/\.(txt|json)$/i, '');
    const seq = new SequenceItem({ label: label , nodes: [] });
    seq._id = id;
    seq.loading = true;
    dataModel.addSequence(seq); // UI刷出占位条

    // 2. 立即返回，交由后台分流处理
    this._parseAndFillAsync(file, seq);

    return seq;
  }

  async _parseAndFillAsync(file, seq) {
    // 真正的解析/IO留到后台，不阻塞主线程
    const ext = (file.name || '').split('.').pop().toLowerCase();
    let sequences = [];
    try {
      const text = await file.text(); // 若需更彻底流式可改为分段读取
      if (ext === 'json') {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch(e) { throw new Error('JSON解析失败: ' + e.message); }
        if (parsed && Array.isArray(parsed.sequences)) {
          sequences = parsed.sequences;
        } else if (Array.isArray(parsed)) {
          sequences = parsed;
        } else {
          throw new Error('JSON 内容格式无效');
        }
      } else if (ext === 'txt') {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const sequence = { label: seq.label, nodes: [] };
        for(const line of lines) {
          if (!line) continue;
          let [x, y, label, ...rest] = line.split(',');
          if (x==null || y==null) continue;
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
        sequences = [sequence];
      } else {
        throw new Error('仅支持txt或json格式输入');
      }
      // 3. 找到原序列并填充 nodes
      if (sequences.length) {
        // 【只取单序列】如果多序列可以特殊处理
        const fill = sequences[0];
        seq.initNodeList(fill.nodes);
        dataModel._emit('sequences:changed', dataModel.getSequences());
      }
      seq.loading = false;
    } catch (err) {
      seq.loading = false;
      seq.label = seq.label + ' 导入失败';
      dataModel._emit('sequences:changed', dataModel.getSequences());
    }
  }
}
export const inputHandler = new InputHandler();
