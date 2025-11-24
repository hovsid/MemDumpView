// JSON import helper for series files.
// Supports two top-level shapes:
//  - { type: "series-collection", series: [...] }
//  - { type: "series", ...single series... }
// Each returned series has: { id, name, raw: [ point | [x,y] ], firstX?, meta? }
// where a point object may be { x, y, label?, color?, meta? }
// Time normalization: strings -> Date.parse() (ms) -> *1000 => microseconds.
// Numeric heuristic: if x < 1e13 treat as milliseconds and *1000, else treat as microseconds.

export async function parseJSONFile(file) {
  const text = await file.text();
  return parseJSONText(text);
}

export function parseJSONText(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error('JSON 解析失败: ' + (err && err.message ? err.message : err));
  }

  const out = { meta: doc.meta || {}, series: [] };

  const toMicro = (rawX) => {
    if (rawX == null) return NaN;
    if (typeof rawX === 'string') {
      const ms = Date.parse(rawX);
      return isNaN(ms) ? NaN : Math.round(ms * 1000);
    }
    if (typeof rawX === 'number') {
      // heuristic: if number looks small (<1e13) treat as milliseconds (ms) -> *1000
      if (Math.abs(rawX) < 1e13) return Math.round(rawX * 1000);
      return Math.round(rawX);
    }
    return NaN;
  };

  const pushSeries = (s) => {
    const id = s.id || (`s_${Math.random().toString(36).slice(2,9)}`);
    const name = s.name || s.id || 'series';
    const meta = s.meta || {};
    const pts = Array.isArray(s.points || s.data) ? (s.points || s.data) : [];
    const raw = [];
    for (const p of pts) {
      // allow [x,y] tuple or object {x,y,...}
      if (Array.isArray(p) && p.length >= 2) {
        const x = Number(p[0]), y = Number(p[1]);
        if (!isFinite(x) || !isFinite(y)) continue;
        raw.push([x, y]);
      } else if (p && typeof p === 'object') {
        // normalize x to microseconds but keep original object shape for pin metadata
        const normalizedX = toMicro(p.x != null ? p.x : (p[0] != null ? p[0] : undefined));
        const y = p.y != null ? Number(p.y) : (p[1] != null ? Number(p[1]) : NaN);
        if (!isFinite(normalizedX) || !isFinite(y)) continue;
        const copy = Object.assign({}, p);
        copy.x = normalizedX;
        copy.y = y;
        raw.push(copy);
      }
    }
    // compute firstX if provided or from first numeric item
    let firstX = s.firstX != null ? toMicro(s.firstX) : null;
    if (firstX == null) {
      for (const r of raw) {
        if (Array.isArray(r) && isFinite(Number(r[0]))) { firstX = Number(r[0]); break; }
        if (r && typeof r === 'object' && isFinite(Number(r.x))) { firstX = Number(r.x); break; }
      }
      if (firstX == null) firstX = 0;
    }
    out.series.push({ id, name, raw, firstX, meta });
  };

  if (doc && doc.type === 'series-collection' && Array.isArray(doc.series)) {
    for (const s of doc.series) pushSeries(s);
  } else if (doc && doc.type === 'series') {
    pushSeries(doc);
  } else if (Array.isArray(doc)) {
    for (const s of doc) {
      if (s && (s.points || s.data || Array.isArray(s))) pushSeries(s);
    }
  } else {
    if (doc && (doc.points || doc.data)) pushSeries(doc);
    else throw new Error('不支持的 JSON 格式：未检测到 series 或 series-collection');
  }

  return out;
}
