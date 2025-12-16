// 通用 Item
export class BaseItem {
  constructor({ label = '', hidden = false, meta = undefined } = {}) {
    this.label = label;
    this.hidden = hidden;
    this.meta = meta;
    this._key = Math.random().toString(36).slice(2, 9);
  }
}

// 通用 List
export class BaseList {
  constructor(items = []) {
    this._items = [];
    this._listeners = {};
    this.setItems(items);
  }
  setItems(items) {
    this._items = (items || []).map(
      item => item instanceof BaseItem ? item : new BaseItem(item)
    );
    this._emit('changed', this._items);
  }
  getItems() { return this._items; }
  add(item) { if (item) this._items.push(item); this._emit('changed', this._items); }
  remove(item) {
    const idx = this._items.indexOf(item);
    if (idx >= 0) { this._items.splice(idx, 1); this._emit('changed', this._items); }
  }
  on(evt, cb) { (this._listeners[evt] = this._listeners[evt] || []).push(cb); }
  _emit(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }
}

// 节点级别的 Item
export class NodeItem extends BaseItem {
  constructor({ x, y, ...rest } = {}) {
    super(rest);
    this.x = x;
    this.y = y;
  }
}

// 节点列表
export class NodeList extends BaseList {
  constructor(nodes = []) {
    super(nodes.map(n =>
      n instanceof NodeItem ? n : new NodeItem(n)
    ));
  }
}

// 序列（每一个节点数组由 NodeList 管理）
export class SequenceItem extends BaseItem {
  constructor({ nodes = [], ...rest } = {}) {
    super(rest);
    // 这里 nodes 是 NodeList 而不是普通数组
    this.nodes = nodes instanceof NodeList ? nodes : new NodeList(nodes);
  }
}

// 序列列表
export class SequenceList extends BaseList {
  constructor(sequences = []) {
    super(sequences.map(seq =>
      seq instanceof SequenceItem ? seq : new SequenceItem(seq)
    ));
  }
}

// 数据模型单例
export class DataModel {
  constructor() {
    this.sequenceList = new SequenceList();
    this._listeners = {};
    this.sequenceList.on('changed', list => this._emit('sequences:changed', list));
  }

  setSequences(seqArr) {
    this.sequenceList.setItems(seqArr);
  }

  getSequences() {
    return this.sequenceList.getItems();
  }

  addSequence(seq) {
    this.sequenceList.add(seq);
  }

  clearSequences() {
    this.sequenceList.setItems([]);
  }

  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
  }

  _emit(evt, arg) {
    (this._listeners[evt] || []).forEach(fn => fn(arg));
  }
}

// 单例暴露
export const dataModel = new DataModel();
