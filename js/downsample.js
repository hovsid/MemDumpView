// downsample.js - two downsampling strategies
// Note: functions are pure and do not depend on DOM; they return reduced x/y arrays.

export function downsampleBucket(x, y, target, forceSet) {
  const n = x.length;
  if (n <= target) return { x, y };
  const bucketCount = Math.min(target, n);
  const bucketSize = n / bucketCount;
  const chosen = new Set();
  chosen.add(0);
  chosen.add(n - 1);
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(n - 1, Math.floor((b + 1) * bucketSize));
    if (end <= start) continue;
    let minIdx = start,
      maxIdx = start;
    let minVal = y[start],
      maxVal = y[start];
    for (let i = start + 1; i <= end; i++) {
      if (y[i] < minVal) {
        minVal = y[i];
        minIdx = i;
      }
      if (y[i] > maxVal) {
        maxVal = y[i];
        maxIdx = i;
      }
    }
    chosen.add(minIdx);
    chosen.add(maxIdx);
  }
  forceSet.forEach((idx) => chosen.add(idx - 1));
  const sorted = [...chosen].sort((a, b) => a - b);
  return { x: sorted.map((i) => x[i]), y: sorted.map((i) => y[i]) };
}

export function downsampleLTTB(x, y, target, forceSet) {
  const n = x.length;
  if (n <= target) return { x, y };
  const keep = new Set();
  keep.add(0);
  keep.add(n - 1);
  forceSet.forEach((idx) => keep.add(idx - 1));
  const base = keep.size;
  let remaining = target - base;
  if (remaining <= 0) {
    const sorted = [...keep].sort((a, b) => a - b);
    return { x: sorted.map((i) => x[i]), y: sorted.map((i) => y[i]) };
  }
  const buckets = remaining;
  const bucketSize = (n - 2) / buckets;
  let a = 0;
  for (let i = 0; i < buckets; i++) {
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1;
    if (rangeEnd >= n - 1) break;
    let maxArea = -1,
      chosen = rangeStart;
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgEnd = Math.min(n - 1, avgRangeEnd);
    const avgStart = Math.min(n - 1, avgRangeStart);
    let avgX = 0,
      avgY = 0,
      count = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += x[j];
      avgY += y[j];
      count++;
    }
    if (count === 0) {
      avgX = x[rangeEnd];
      avgY = y[rangeEnd];
      count = 1;
    }
    avgX /= count;
    avgY /= count;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (x[a] - avgX) * (y[j] - y[a]) - (x[a] - x[j]) * (avgY - y[a]),
      );
      if (area > maxArea) {
        maxArea = area;
        chosen = j;
      }
    }
    keep.add(chosen);
    a = chosen;
  }
  const sorted = [...keep].sort((a, b) => a - b);
  return { x: sorted.map((i) => x[i]), y: sorted.map((i) => y[i]) };
}
