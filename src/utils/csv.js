export async function parseCSVStream(file, onProgress) {
  const chunkSize = 1024 * 1024;
  let offset = 0, leftover = '';
  let firstLineChecked = false, isHeader = false, headerCols = null;
  let timeIdx = 0, valueIdx = 1;
  const points = [];
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const text = await slice.text();
    offset += chunkSize;
    const chunk = leftover + text;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() || '';
    for (let line of lines) {
      line = line.trim(); if (!line) continue;
      const parts = line.split(',').map(s => s.trim());
      if (!firstLineChecked) {
        const maybeNum = Number(parts[0]);
        if (!isFinite(maybeNum)) {
          isHeader = true; headerCols = parts;
          const lower = headerCols.map(h => (h||'').toLowerCase());
          const timeCandidates = ['time','timestamp','ts','date','epoch','t','time_us','us','micro','microseconds'];
          const valCandidates = ['value','mem','memory','memory_used','memory_kb','usage','y'];
          const foundTime = lower.reduce((acc, cur, idx) => acc !== null ? acc : (timeCandidates.includes(cur) ? idx : null), null);
          const foundVal = lower.reduce((acc, cur, idx) => acc !== null ? acc : (valCandidates.includes(cur) ? idx : null), null);
          if (foundTime !== null) timeIdx = foundTime;
          if (foundVal !== null) valueIdx = foundVal;
        } else {
          isHeader = false; timeIdx = 0; valueIdx = 1;
          const x = Number(parts[timeIdx]), y = Number(parts[valueIdx]); if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
        firstLineChecked = true;
      } else {
        const x = Number(parts[timeIdx]), y = Number(parts[valueIdx]); if (isFinite(x) && isFinite(y)) points.push([x, y]);
      }
    }
    if (onProgress) onProgress(Math.min(1, offset / file.size));
    await new Promise(r => setTimeout(r, 0));
  }
  if (leftover) {
    const line = leftover.trim();
    if (line) {
      const parts = line.split(',').map(s => s.trim());
      if (!firstLineChecked) {
        const maybeNum = Number(parts[0]);
        if (!isFinite(maybeNum)) { isHeader = true; headerCols = parts; }
        else { const x=Number(parts[0]), y=Number(parts[1]); if (isFinite(x) && isFinite(y)) points.push([x,y]); }
      } else {
        const x = Number(parts[timeIdx]), y = Number(parts[valueIdx]); if (isFinite(x) && isFinite(y)) points.push([x, y]);
      }
    }
  }
  return { points, hasHeader: !!isHeader, headerCols, timeIdx, valueIdx };
}