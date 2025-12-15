// 数据节点，包含最基本扩展字段
export class Node {
  constructor({ x, y, label = undefined, meta = undefined } = {}) {
    this.x = x; // number, 时间戳
    this.y = y; // number, 数值
    this.label = label; // string，可选
    this.meta = meta;   // any, 可选
  }
}

// 表示一条序列
export class Sequence {
  constructor({ name, nodes = [], meta = undefined } = {}) {
    this.name = name; // string, 序列名
    this.nodes = Array.isArray(nodes) ? nodes.map(n => (n instanceof Node ? n : new Node(n))) : [];
    this.meta = meta; // any, 可选（如来自文件的附加信息）
  }
}

export class DataModel {
  constructor() {
    this.sequences = [];
    this._listeners = {};
  }

  setSequences(seqList) {
    // 自动转换为 Sequence 实例
    this.sequences = Array.isArray(seqList) ? seqList.map(
      s => (s instanceof Sequence ? s : new Sequence(s))
    ) : [];
    this._emit('sequences:changed', this.sequences);
  }

  getSequences() {
    return this.sequences;
  }

  clearSequences() {
    this.sequences = [];
    this._emit('sequences:changed', this.sequences);
  }

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
  }

  _emit(event, payload) {
    (this._listeners[event] || []).forEach(fn => fn(payload));
  }
}

// 单例暴露
export const dataModel = new DataModel();
