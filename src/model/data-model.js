import { makeColorForLabel, largestTriangleThreeBuckets } from '../utils/lttb.js';

export class BaseItem {
  constructor({ label = '', hidden = false, color = undefined, meta = undefined } = {}) {
    this.label = label;
    this.hidden = hidden;
    this._color = color;
    this.meta = meta;
    this._key = Math.random().toString(36).slice(2, 9);
    this._listeners = {};
  }

  get color() {
    if (this._color === undefined && this.label != '') {
      this._color = makeColorForLabel(this.label);
    }
    return this._color;
  }

  set color(c) { this._color = c; this._emit('changed', 'color'); }

  on(evt, cb) { (this._listeners[evt] = this._listeners[evt] || []).push(cb); }
  _emit(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }
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
      item => {
        let baseItem = item instanceof BaseItem ? item : new BaseItem(item)
        baseItem.on('changed', (e) => this._emit('changed', e));
        return baseItem;
      }
    );
    this._emit('changed', "set");
  }
  getItems() { return this._items; }
  add(item) {
    if (item) this._items.push(item);
    item.on('changed', (e) => this._emit('changed', e));
    this._emit('changed', item);
  }
  remove(item) {
    const idx = this._items.indexOf(item);
    if (idx >= 0) { this._items.splice(idx, 1); this._emit('changed', item); }
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
    this.initNodeList(nodes);
  }

  initNodeList(nodes) {
    this.nodes = nodes;
    this.resample(SequenceItem.defaultSampleTarget);
  }

  async resample(targetCount) {
    const labelNodes = this.nodes.filter(node => node.label !== undefined);
    const noLabelNodes = this.nodes.filter(node => node.label === undefined);
    const sampledNodes = noLabelNodes.length > targetCount ?
      largestTriangleThreeBuckets(noLabelNodes, targetCount) :
      noLabelNodes;
    this.sampled = new NodeList(sampledNodes.concat(labelNodes));
    this._emit('changed', 'resampled');
    this.sampled.on('changed', (e) => this._emit('changed', e));
  }
}

// 序列列表
export class SequenceList extends BaseList {
  constructor(sequences = []) {
    let range = new NodeRange();
    super(sequences.map(seq => seq instanceof SequenceItem ? seq : new SequenceItem(seq)));
    // this.normalizedRange = range;
    this.range = range;
    this.on('changed', () => {
      this.updatedRange()
    });
  }

  pushSequence(seq) {
    const item = seq instanceof SequenceItem ? seq : new SequenceItem(seq);
    this.add(item);
  }

  updatedRange() {
    let range = new NodeRange();
    this.getItems().forEach(seq => {
      range.merge(seq.sampled.range.normalize());
    });
    this.range = range;
  }
}

// 数据模型单例
export class DataModel {
  constructor() {
    this.sequenceList = new SequenceList();
    this._listeners = {};
    this.sequenceList.on('changed', e => this._emit('sequences:changed', e));
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
