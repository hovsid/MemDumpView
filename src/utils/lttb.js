export function largestTriangleThreeBuckets(data, threshold) {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) return data.slice();
  if (threshold < 3) threshold = 3;
  const sampled = new Array(threshold);
  const every = (dataLength - 2) / (threshold - 2);
  let a = 0;
  sampled[0] = data[0];
  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd = Math.floor((i + 2) * every) + 1;
    const avgRangeEndClamped = Math.min(avgRangeEnd, dataLength);
    let avgX = 0, avgY = 0;
    let avgRangeLength = avgRangeEndClamped - avgRangeStart;
    if (avgRangeLength <= 0) avgRangeLength = 1;
    for (let j = avgRangeStart; j < avgRangeEndClamped; j++) { avgX += data[j][0]; avgY += data[j][1]; }
    avgX /= avgRangeLength; avgY /= avgRangeLength;
    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;
    const pointAx = data[a][0], pointAy = data[a][1];
    let maxArea = -1, nextA = rangeOffs;
    for (let j = rangeOffs; j < rangeTo + 1 && j < dataLength; j++) {
      const area = Math.abs((pointAx - avgX) * (data[j][1] - pointAy) - (pointAx - data[j][0]) * (avgY - pointAy)) * 0.5;
      if (area > maxArea) { maxArea = area; nextA = j; }
    }
    sampled[i + 1] = data[nextA]; a = nextA;
  }
  sampled[threshold - 1] = data[dataLength - 1];
  return sampled;
}

export function binarySearchLeft(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] < x) lo = mid + 1; else hi = mid; }
  return lo;
}
export function binarySearchRight(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] <= x) lo = mid + 1; else hi = mid; }
  return lo;
}
export function makeColors(n) {
  const colors = [];
  for (let i = 0; i < n; i++) { const hue = Math.round((360 / Math.max(1, n)) * i); colors.push(`hsl(${hue} 70% 45%)`); }
  return colors;
}

// 新增：全局唯一、label稳定的颜色分配（HSL调色环hash）
export function makeColorForLabel(label) {
  let str = label == null ? '' : String(label);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    hash = hash & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  const sat = 68 + (Math.abs(hash) % 12); // 68-79%
  const lum = 44 + (Math.abs(hash) % 11); // 44-54%
  return `hsl(${hue} ${sat}% ${lum}%)`;
}
