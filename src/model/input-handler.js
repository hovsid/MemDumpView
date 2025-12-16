import { dataModel, SequenceItem } from './data-model.js';

// TXT 格式：每行 x, y, label, meta（label和meta可省略）
// JSON 格式：完整的 { sequences: [ { name, nodes:[{x,y,label,meta}] } ] } 可直接用
class InputHandler {
  async handleInput(file) {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const text = await file.text();
    let sequences = [];
    if (ext === 'json') {
      // JSON: 直接作为数据结构，不做其他处理
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch(e) { throw new Error('JSON解析失败: ' + e.message); }
      if (parsed && Array.isArray(parsed.sequences)) {
        sequences = parsed.sequences;
      } else if (Array.isArray(parsed)) {
        // 兼容以数组为顶层
        sequences = parsed;
      } else {
        throw new Error('JSON 内容格式无效');
      }
    } else if (ext === 'txt') {
      // TXT: 每个文件为1个序列，其name为文件名，nodes为逐行
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const sequence = { label: file.name.replace(/\.txt$/i,''), nodes: [] };
      for(const line of lines) {
        if (!line) continue;
        // 允许最后一项meta有逗号
        let [x, y, label, ...rest] = line.split(',');
        if (x==null || y==null) continue;
        let metaRaw = rest.length ? rest.join(',') : undefined;
        let meta = undefined;
        if (metaRaw) {
          // 优先尝试JSON解析meta
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
    sequences.forEach(sequence => {
        dataModel.addSequence(new SequenceItem(sequence));
    });
  }
}
export const inputHandler = new InputHandler();
