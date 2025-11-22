export function splitCSVLine(line, sep = ',') {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        res.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  res.push(cur);
  return res;
}

function detectSeparator(sampleLines = []) {
  // count fields for common separators and choose the one with most columns (heuristic)
  const seps = [',', ';', '\t'];
  let best = { sep: ',', score: -1 };
  for (const sep of seps) {
    let score = 0;
    for (const line of sampleLines) {
      if (!line) continue;
      // but don't parse quotes here, just quick count of sep occurrences outside quotes might be expensive.
      // simpler: count occurrences of sep
      score += (line.split(sep).length - 1);
    }
    if (score > best.score) best = { sep, score };
  }
  return best.sep;
}

function stripBOM(s) {
  if (!s) return s;
  if (s.charCodeAt(0) === 0xFEFF) return s.slice(1);
  return s;
}

export async function parseCSVStream(file, onProgress) {
  const chunkSize = 1024 * 1024;
  let offset = 0, leftover = '';
  let firstLineChecked = false, isHeader = false, headerCols = null;
  let timeIdx = 0, valueIdx = 1;
  const points = [];
  const sampleLinesForDetect = [];
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const text = await slice.text();
    offset += chunkSize;
    const chunk = leftover + text;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() || '';
    for (let line of lines) {
      // collect sample for separator detection
      if (sampleLinesForDetect.length < 6) sampleLinesForDetect.push(line);
    }
    // determine separator if not yet
    const sep = detectSeparator(sampleLinesForDetect);
    for (let line of lines) {
      line = stripBOM(line.trim()); if (!line) continue;
      const parts = splitCSVLine(line, sep).map(s => s.trim());
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
    const line = stripBOM(leftover.trim());
    if (line) {
      const sep = detectSeparator(sampleLinesForDetect);
      const parts = splitCSVLine(line, sep).map(s => s.trim());
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

// parse CSV from a text blob (sync-friendly)
export async function parseCSVText(text) {
  text = stripBOM(text);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sample = lines.slice(0, 6);
  const sep = detectSeparator(sample);
  let firstLineChecked = false, isHeader = false, headerCols = null;
  let timeIdx = 0, valueIdx = 1;
  const points = [];
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = splitCSVLine(line, sep).map(s => s.trim());
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
  return { points, hasHeader: !!isHeader, headerCols, timeIdx, valueIdx };
}
