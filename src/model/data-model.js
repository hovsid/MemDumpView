import { makeColorForLabel, largestTriangleThreeBuckets } from '../utils/lttb.js';

export class BaseItem {
  constructor({ label = '', hidden = false, color = undefined, meta = undefined } = {}) {
    this.label = label;
    this.hidden = hidden;
    this._color = color;
    this.meta = meta;
    this._key = Math.random().toString(36).slice(2, 9);
  }

  get color() {
    if (this._color === undefined && this.label != '') {
      this._color = makeColorForLabel(this.label);
    }
    return this._color;
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

export class NodeRange {
  constructor({ xmin = Infinity, ymin = Infinity, xmax = 0, ymax = 0 } = {}) {
    this.xmin = xmin;
    this.ymin = ymin;
    this.xmax = xmax;
    this.ymax = ymax;
  }

  initFromNode(node) {
    this.xmin = node.x;
    this.xmax = node.x;
    this.ymin = node.y;
    this.ymax = node.y;
  }

  upDateRange(node) {
    this.xmin = Math.min(this.xmin, node.x);
    this.xmax = Math.max(this.xmax, node.x);
    this.ymin = Math.min(this.ymin, node.y);
    this.ymax = Math.max(this.ymax, node.y);
  }

  normalize() {
    return new NodeRange({
      xmin: 0,
      xmax: this.xmax - this.xmin,
      ymin: this.ymin,
      ymax: this.ymax,
    });
  }

  merge(range) {
    this.xmin = Math.min(this.xmin, range.xmin)
    this.xmax = Math.max(this.xmax, range.xmax)
    this.ymin = Math.min(this.ymin, range.ymin)
    this.ymax = Math.max(this.ymax, range.ymax)
  }

  enlarge(rate) {
    this.xmax += (this.xmax - this.xmin) * rate;
    this.ymax += this.ymax * rate;
  }

  equals(range) {
    return this.xmin === range.xmin && this.xmax === range.xmax &&
           this.ymin === range.ymin && this.ymax === range.ymax;
  }

  inNodeRange(node) {
    return node.x >= this.xmin && node.x <= this.xmax &&
           node.y >= this.ymin && node.y <= this.ymax;
  }

  inRange(x, y) {
    return x >= this.xmin && x <= this.xmax &&
           y >= this.ymin && y <= this.ymax;
  }
}

// 节点列表
export class NodeList extends BaseList {
  constructor(nodes = []) {
    // 1. 过滤非法 2. NodeItem化 3. 排序
    let range = new NodeRange();
    const sortedNodes = (nodes)
      .filter(n => n != null && isFinite(Number(n.x)) && isFinite(Number(n.y)))
      .map(n => {
        range.upDateRange(n);
        return n instanceof NodeItem ? n : new NodeItem(n)
      })
      .sort((a, b) => a.x - b.x);
    super(sortedNodes);
    this.range = range;
  }
}

// 序列（每一个节点数组由 NodeList 管理）
export class SequenceItem extends BaseItem {
  static defaultSampleTarget = 3000;
  constructor({ nodes = [], ...rest } = {}) {
    super(rest);
    // nodes 是 NodeList，不是普通数组
    this.nodes = nodes instanceof NodeList ? nodes : new NodeList(nodes);
    this.sampled = this.resample(SequenceItem.defaultSampleTarget);
  }

  resample(targetCount) {
    if (this.nodes.getItems().length <= targetCount) {
      return this.nodes;
    }
    const nodes = this.nodes.getItems();
    // LTTB输入为二维数组，这里需转换
    const lttbInput = nodes.map(n => [n.x, n.y]);
    const lttbRes = largestTriangleThreeBuckets(lttbInput, targetCount);
    // 结果转 NodeItem，且保留排序
    // 为了顺序与原采样点一致，这里用x/y查找原 NodeItem
    const sampledNodes = [];
    for(const [x, y] of lttbRes) {
      // 优选精确匹配原对象，否则新建
      let found = nodes.find(n => n.x === x && n.y === y);
      if (!found) found = new NodeItem({ x, y });
      sampledNodes.push(found);
    }
    return new NodeList(sampledNodes);
  }
}

// 序列列表
export class SequenceList extends BaseList {
  constructor(sequences = []) {
    let range = new NodeRange();
    super(sequences.map(seq => {
      let item = seq instanceof SequenceItem ? seq : new SequenceItem(seq)
      range.merge(item.nodes.range.normalize());
      return item
    }));
    // this.normalizedRange = range;
    this.range = range;
  }

  pushSequence(seq) {
    const item = seq instanceof SequenceItem ? seq : new SequenceItem(seq);
    this.range.merge(item.nodes.range.normalize());
    this.add(item);
  }
}

// 数据模型单例
export class DataModel {
  constructor() {
    this.sequenceList = new SequenceList();
    this._listeners = {};
    this.sequenceList.on('changed', list => this._emit('sequences:changed', list));
  }

  getSequences() {
    return this.sequenceList.getItems();
  }

  addSequence(seq) {
    this.sequenceList.pushSequence(seq);
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
