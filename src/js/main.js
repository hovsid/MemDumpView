// main.js - orchestrates the UI, state and connects modules
// Entry module loaded by index page.

import * as U from "./utils.js";
import * as P from "./parser.js";
import * as DS from "./downsample.js";
import * as Plot from "./plot.js";

/* ===== State ===== */
export const state = {
  gcPairs: [],
  heapTimestamps: [], // timestamps (microseconds since epoch) for each sample (may be empty if older format)
  heapValuesOriginal: [],
  heapGcMarkers: [], // sample indices (1-based) — now can grow by inserted timestamps
  heapGcMarkerValues: [],
  heapGcMarkerRawValues: [],
  gcPairMarkerPositions: {}, // mapping gcIdx -> array of positions (indices into heapGcMarkers array)
  heapMarkerOffset: 0,
  plotRendered: false,

  dsCurrentX: [],
  dsCurrentY: [],
  dsActive: true,
  lastAlgo: "bucket",
  lastTarget: 3000,

  simulatedCompactedX: [],
  simulatedCompactedY: [],
  haveSimulation: false,
};

/* ===== Parsing Merged File (uses parser helpers) ===== */
function parseMergedFile(content) {
  const lines = content.split(/\r?\n/);
  const phase1Idx = lines.findIndex((l) =>
    /^phase1:\s*heap use\s*$/i.test(l.trim()),
  );
  const phase2Idx = lines.findIndex((l) =>
    /^phase2:\s*page dump\s*$/i.test(l.trim()),
  );
  const statusEl = document.getElementById("load-status");

  if (phase1Idx === -1 || phase2Idx === -1 || phase2Idx <= phase1Idx) {
    statusEl.innerHTML =
      "<span style='color:#c62828'>Invalid merged file format: missing phase markers.</span>";
    return;
  }

  const heapLines = lines
    .slice(phase1Idx + 1, phase2Idx)
    .filter((l) => l.trim().length > 0);
  const gcDumpLines = lines.slice(phase2Idx + 1);

  // Parse heap timeline portion (now timestamp, bytes)
  parseHeapTimelineFromLines(heapLines);

  // Parse GC dump portion (blocks may include heapDump metadata)
  const gcDumpText = gcDumpLines.join("\n");
  const blocks = P.parseGCDumpBlocks(gcDumpText);
  state.gcPairs = P.pairBlocks(blocks);

  // Map GC pairs to timeline sample indices (inserting missing points when needed)
  mapGcPairsToTimeline();

  renderGCPairs();

  statusEl.innerHTML = `<span style='color:#2e7d32'>Loaded heap samples: ${state.heapValuesOriginal.length}, GC pairs: ${state.gcPairs.length}</span>`;
}

/* ===== Parse Heap Timeline (from lines list) =====
   New expected format per line:
     <timestamp>, <heap bytes>
   where timestamp is microseconds since epoch (integer) and heap bytes is numeric.
   If old format is used (no timestamps), heapTimestamps will stay empty.
*/
function parseHeapTimelineFromLines(lines) {
  state.heapTimestamps = [];
  state.heapValuesOriginal = [];
  state.heapGcMarkers = [];
  state.heapGcMarkerValues = [];
  state.heapGcMarkerRawValues = [];
  state.gcPairMarkerPositions = {};

  let min = Infinity,
    max = -Infinity;

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length !== 2) continue;
    const ts = Number(parts[0].trim());
    const v = parseFloat(parts[1].trim());
    if (!Number.isFinite(ts) || isNaN(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  state.heapMarkerOffset = isFinite(min) && isFinite(max) ? (max - min) * 0.0001 : 0;

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length !== 2) continue;
    const ts = Number(parts[0].trim());
    const v = parseFloat(parts[1].trim());
    if (!Number.isFinite(ts) || isNaN(v)) continue;
    state.heapTimestamps.push(ts);
    state.heapValuesOriginal.push(v);
  }

  // apply default downsampling using local DS functions
  applyDownsampling(state.lastAlgo, state.lastTarget);
  Plot.renderHeapPlot(state);
  buildCorrelationPanel();
}

/* ===== Map GC pairs to timeline sample indices; insert missing timestamps when needed =====
   Behavior:
   - For each GC pair, for both before and after blocks (if heapDump metadata present)
     we try to map the timestamp to an exact timeline sample. If none exists we:
       - insert a new sample (timestamp and bytes) into heapTimestamps & heapValuesOriginal
         at the correct sorted chronological position (keeping sample indices order).
       - adjust existing heapGcMarkers and gcPairMarkerPositions offsets to account for insertion.
   - For each mapped block we append its sampleIndex (1-based) into state.heapGcMarkers and record
     the position index (index in heapGcMarkers array) in state.gcPairMarkerPositions[gcIdx] array.
   - After mapping/inserts, we recompute downsample and re-render the plot so the newly inserted points
     are visible.
*/
export function mapGcPairsToTimeline() {
  state.heapGcMarkers = [];
  state.heapGcMarkerRawValues = [];
  state.heapGcMarkerValues = [];
  state.gcPairMarkerPositions = {};

  // quick helper to insert a heap sample at position idx (0-based)
  function insertHeapSampleAt(idx, ts, bytes) {
    // insert timestamp & value
    state.heapTimestamps.splice(idx, 0, ts);
    state.heapValuesOriginal.splice(idx, 0, bytes);
    // shift any existing markers that are after or at this insertion point:
    for (let m = 0; m < state.heapGcMarkers.length; m++) {
      if (state.heapGcMarkers[m] > idx) {
        state.heapGcMarkers[m] = state.heapGcMarkers[m] + 1;
      } else if (state.heapGcMarkers[m] === idx) {
        // should not usually happen because sample indices are 1-based in heapGcMarkers,
        // but handle defensively.
        state.heapGcMarkers[m] = state.heapGcMarkers[m] + 1;
      }
    }
    // Also update any recorded positions mapping: positions are indices into heapGcMarkers
    // (they don't need updates here because we didn't reorder heapGcMarkers array itself).
  }

  // Build quick timestamp -> sample index (1-based) map for fast lookup
  const tsToIndex = new Map();
  for (let i = 0; i < state.heapTimestamps.length; i++) {
    const ts = state.heapTimestamps[i];
    if (!tsToIndex.has(ts)) tsToIndex.set(ts, i + 1);
  }

  // Work on sorted GC pairs so mapping order is stable
  const sortedPairs = state.gcPairs.slice().sort((a, b) => a.idx - b.idx);

  for (const pair of sortedPairs) {
    const positionsForThisGc = [];
    const tryMapBlock = (block) => {
      if (!block || !block.heapDump || block.heapDump.ts == null) return;
      const ts = block.heapDump.ts;
      const bytes = block.heapDump.bytes;
      let sampleIndex;
      if (tsToIndex.has(ts)) {
        sampleIndex = tsToIndex.get(ts);
      } else {
        // Insert new sample at proper chronological position
        // Find insertion 0-based index: first i where heapTimestamps[i] > ts
        let insertAt = state.heapTimestamps.findIndex((t) => t > ts);
        if (insertAt === -1) {
          // append at end
          insertAt = state.heapTimestamps.length;
        }
        // default bytes fallback: prefer provided bytes, else estimate from neighbors
        let valueToInsert = bytes;
        if (valueToInsert == null || isNaN(valueToInsert)) {
          // attempt to estimate from previous sample or next sample
          const prev = insertAt - 1;
          const next = insertAt;
          if (prev >= 0 && state.heapValuesOriginal[prev] != null)
            valueToInsert = state.heapValuesOriginal[prev];
          else if (next < state.heapValuesOriginal.length && state.heapValuesOriginal[next] != null)
            valueToInsert = state.heapValuesOriginal[next];
          else valueToInsert = 0;
        }
        // perform insertion
        insertHeapSampleAt(insertAt, ts, valueToInsert);
        // update tsToIndex map: every existing ts with index >= insertAt must shift by +1
        const updated = new Map();
        for (const [k, v] of tsToIndex.entries()) {
          const newIdx = v > insertAt ? v + 1 : v;
          updated.set(k, newIdx);
        }
        updated.set(ts, insertAt + 1);
        // replace map
        tsToIndex.clear();
        for (const [k, v] of updated.entries()) tsToIndex.set(k, v);
        sampleIndex = insertAt + 1;
      }

      // Append marker for this sample
      state.heapGcMarkers.push(sampleIndex);
      const timelineVal =
        state.heapValuesOriginal[sampleIndex - 1] != null
          ? state.heapValuesOriginal[sampleIndex - 1]
          : bytes;
      state.heapGcMarkerRawValues.push(timelineVal);
      state.heapGcMarkerValues.push(timelineVal + state.heapMarkerOffset);

      // record position index in heapGcMarkers array (0-based)
      positionsForThisGc.push(state.heapGcMarkers.length - 1);
    };

    // prefer before then after to keep stable ordering of markers
    tryMapBlock(pair.before);
    tryMapBlock(pair.after);

    if (positionsForThisGc.length) state.gcPairMarkerPositions[pair.idx] = positionsForThisGc;
  }

  // After mapping and possible insertions, re-apply downsampling and re-render so new points show
  applyDownsampling(state.lastAlgo, state.lastTarget);
  Plot.renderHeapPlot(state);
}

/* ===== Downsampling orchestration (main keeps ds state) ===== */
function applyDownsampling(algo, target) {
  state.lastAlgo = algo;
  state.lastTarget = target;
  const n = state.heapValuesOriginal.length;
  const xArr = Array.from({ length: n }, (_, i) => i + 1);
  const forceSet = new Set(state.heapGcMarkers);
  let result =
    algo === "lttb"
      ? DS.downsampleLTTB(xArr, state.heapValuesOriginal, target, forceSet)
      : DS.downsampleBucket(xArr, state.heapValuesOriginal, target, forceSet);
  state.dsCurrentX = result.x;
  state.dsCurrentY = result.y;
  state.dsActive = true;
  updateDsInfo();
  Plot.renderHeapPlot(state);
}

function revertToOriginal() {
  state.dsActive = false;
  updateDsInfo();
  Plot.renderHeapPlot(state);
}

function updateDsInfo() {
  const badge = document.getElementById("ds-info");
  if (!badge) return;
  if (state.heapValuesOriginal.length === 0) {
    badge.textContent = "No data";
    return;
  }
  if (!state.dsActive) {
    badge.textContent = `Original: ${state.heapValuesOriginal.length} pts`;
    badge.style.background = "#555";
  } else {
    badge.textContent = `Downsampled: ${state.dsCurrentX.length}/${state.heapValuesOriginal.length} pts`;
    badge.style.background = "#1976d2";
  }
}

/* ===== UI rendering: GC pairs, grids and popups
   For now these functions largely mirror the original implementation but use
   the parser helpers in parser.js and utilities in utils.js.
*/
function renderGCPairs() {
  const container = document.getElementById("page-dump-view");
  container.innerHTML = "";
  state.simulatedCompactedX = [];
  state.simulatedCompactedY = [];
  state.haveSimulation = false;

  if (state.gcPairs.length === 0) {
    container.innerHTML =
      "<div style='color:#555'>No GC before/after pairs found.</div>";
    buildCorrelationPanel();
    Plot.updateSimulatedLine(state);
    return;
  }

  const sortedPairIndices = state.gcPairs
    .map((p) => p.idx)
    .sort((a, b) => a - b);
  let simMap = new Map();

  for (const pair of state.gcPairs) {
    const beforeDist = P.parsePageDistribution(pair.before.content);
    const afterDist = P.parsePageDistribution(pair.after.content);
    const optimizedBefore = P.simulateCompaction(beforeDist);
    const optimizedAfter = P.simulateCompaction(afterDist);

    let allKeys = [
      ...new Set([...Object.keys(beforeDist), ...Object.keys(afterDist)]),
    ];
    allKeys.sort((a, b) => P.kindOrder(a) - P.kindOrder(b));
    const optKeys = ["Compacted"];

    const unifiedSize = Math.ceil(
      Math.sqrt(
        Math.max(
          P.countTotalPages(beforeDist),
          P.countTotalPages(afterDist),
          P.countTotalPages(optimizedBefore),
          P.countTotalPages(optimizedAfter),
        ),
      ),
    );

    const wrapper = document.createElement("div");
    wrapper.className = "gc-pair-wrapper";

    const summary = P.computeSummary(beforeDist, afterDist);
    const deltaClass =
      summary.deltaOccupancy > 0
        ? "delta-pos"
        : summary.deltaOccupancy < 0
          ? "delta-neg"
          : "delta-zero";

    const memStatValue = getMemStatForGcIdx(pair.idx);
    let simulatedValue = null;
    let memEstimateHtml = "";
    if (memStatValue != null) {
      const occupancyFactor = summary.occupancyAfter / 100;
      simulatedValue = memStatValue * occupancyFactor;
      const memReductionAmount = memStatValue - simulatedValue;
      memEstimateHtml = `
         <div>Overall occupancy after GC: <b>${summary.occupancyAfter.toFixed(2)}%</b></div>
         <div>Simulated compacted bytes: <b>${U.formatBytes(simulatedValue)}</b> (base: ${U.formatBytes(memStatValue)})</div>
         <div>Estimated memory reduction if perfectly compacted: <span class="${memReductionAmount > 0 ? "mem-estimate" : "mem-nochange"}">-${U.formatBytes(memReductionAmount)}</span></div>
      `;
    } else {
      memEstimateHtml = `<div>Simulated compacted bytes: <span class="mem-nochange">N/A (no heap marker)</span></div>`;
    }
    if (simulatedValue != null) simMap.set(pair.idx, simulatedValue);

    const summaryPanel = document.createElement("div");
    summaryPanel.className = "gc-summary-panel";
    summaryPanel.innerHTML = `
      <div class="gc-summary-header-row">
        <div class="gc-summary-title">Conclusion GC ${pair.idx}</div>
        <div class="layout-tools">
          <button class="gc-btn charts-btn">Charts</button>
          <button class="gc-btn highlight-btn">Highlight</button>
          <button class="gc-btn zoom-in-btn">Zoom +</button>
          <button class="gc-btn zoom-out-btn">Zoom -</button>
          <button class="gc-btn zoom-reset-btn">Reset</button>
        </div>
      </div>
      <div>Pages before: <b>${summary.pagesBefore}</b></div>
      <div>Pages after: <b>${summary.pagesAfter}</b></div>
      <div>Pages released: <span class="released">${summary.pagesReleased}</span></div>
      <div>Overall occupancy before: <b>${summary.occupancyBefore.toFixed(2)}%</b></div>
      <div>Overall occupancy after: <b>${summary.occupancyAfter.toFixed(2)}%</b></div>
      <div>Occupancy change: <span class="${deltaClass}">${summary.deltaOccupancy > 0 ? "+" : ""}${summary.deltaOccupancy.toFixed(2)} pp</span></div>
      ${memEstimateHtml}
    `;
    wrapper.appendChild(summaryPanel);

    const originalRow = document.createElement("div");
    originalRow.className = "gc-squares-row";
    const beforePanel = document.createElement("div");
    beforePanel.className = "gc-sq-panel";
    beforePanel.innerHTML = `<div class="gc-sq-title">Before GC ${pair.idx}</div>`;
    beforePanel.appendChild(
      renderSquareGrid(beforeDist, allKeys, "before", pair.idx, unifiedSize),
    );
    const afterPanel = document.createElement("div");
    afterPanel.className = "gc-sq-panel";
    afterPanel.innerHTML = `<div class="gc-sq-title">After GC ${pair.idx}</div>`;
    afterPanel.appendChild(
      renderSquareGrid(afterDist, allKeys, "after", pair.idx, unifiedSize),
    );
    originalRow.appendChild(beforePanel);
    originalRow.appendChild(afterPanel);
    wrapper.appendChild(originalRow);

    const optRow = document.createElement("div");
    optRow.className = "gc-squares-row";
    const optBeforePanel = document.createElement("div");
    optBeforePanel.className = "gc-sq-panel";
    optBeforePanel.innerHTML = `<div class="gc-optimized-label">SIMULATED COMPACT</div><div class="gc-sq-title">Optimized Before GC ${pair.idx}</div>`;
    optBeforePanel.appendChild(
      renderSquareGrid(
        optimizedBefore,
        optKeys,
        "optimized-before",
        pair.idx,
        unifiedSize,
        true,
      ),
    );
    const optAfterPanel = document.createElement("div");
    optAfterPanel.className = "gc-sq-panel";
    optAfterPanel.innerHTML = `<div class="gc-optimized-label">SIMULATED COMPACT</div><div class="gc-sq-title">Optimized After GC ${pair.idx}</div>`;
    optAfterPanel.appendChild(
      renderSquareGrid(
        optimizedAfter,
        optKeys,
        "optimized-after",
        pair.idx,
        unifiedSize,
        true,
      ),
    );
    optRow.appendChild(optBeforePanel);
    optRow.appendChild(optAfterPanel);
    wrapper.appendChild(optRow);

    container.appendChild(wrapper);

    summaryPanel.querySelector(".charts-btn").onclick = () =>
      showUnifiedBarPopup(beforeDist, afterDist, allKeys, "GC " + pair.idx);
    summaryPanel.querySelector(".highlight-btn").onclick = () => {
      Plot.highlightAndFocusHeapMarker(state, pair.idx);
      Plot.jumpToHeapTimeline();
    };
    summaryPanel.querySelector(".zoom-in-btn").onclick = () =>
      manualZoom(wrapper, +2);
    summaryPanel.querySelector(".zoom-out-btn").onclick = () =>
      manualZoom(wrapper, -2);
    summaryPanel.querySelector(".zoom-reset-btn").onclick = () =>
      resetZoom(wrapper);
  }

  // Build simulated series mapping: now we must correlate which gcPairs have simulations
  // and which marker indices correspond. Because we now append before+after markers in order,
  // we iterate over heapGcMarkers in sequence and match to sorted gcPairs with presence.
  let simPos = 0;
  const sortedIndices = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  state.simulatedCompactedX = [];
  state.simulatedCompactedY = [];
  for (const idx of sortedIndices) {
    if (simMap.has(idx)) {
      // simMap has a simulated value for this GC index
      // We expect the corresponding marker(s) for this GC to be present in heapGcMarkers.
      // Since markers are appended before+after when present, find the next marker position that
      // logically belongs to this GC: search forward from simPos and pick the first marker whose
      // mapping was created for this gc idx by inspecting state.gcPairs mapping order isn't stored,
      // so we rely on consistent append ordering (we appended before then after for sortedPairs).
      // For simplicity, pick the marker at simPos if available.
      if (simPos < state.heapGcMarkers.length) {
        state.simulatedCompactedX.push(state.heapGcMarkers[simPos]);
        state.simulatedCompactedY.push(simMap.get(idx));
        simPos++;
      }
    }
    // advance simPos by number of markers this GC contributed (0..2)
    // Count markers by checking presence of heapDump timestamps for before/after
    const pair = state.gcPairs.find((p) => p.idx === idx);
    if (pair) {
      let contributed = 0;
      if (pair.before && pair.before.heapDump && state.heapTimestamps.includes(pair.before.heapDump.ts)) contributed++;
      if (pair.after && pair.after.heapDump && state.heapTimestamps.includes(pair.after.heapDump.ts)) contributed++;
      simPos += contributed - (simMap.has(idx) ? 1 : 0); // we already consumed one above if simMap had it
    }
  }

  state.haveSimulation = state.simulatedCompactedX.length > 0;

  buildCorrelationPanel();
  responsiveRescaleAllGrids();
  window.addEventListener("resize", () => {
    if (!document.querySelector('.gc-pair-wrapper[data-manual-zoom="true"]'))
      responsiveRescaleAllGrids();
    adjustAllPairLayouts();
  });
  adjustAllPairLayouts();
  Plot.updateSimulatedLine(state);
}

function renderSquareGrid(
  groups,
  allKeys,
  when,
  gcIdx,
  forcedSize,
  isOptimized = false,
) {
  let allUsages = [];
  for (const key of allKeys) {
    const arr = groups[key] || [];
    allUsages.push(
      ...arr.map((u, i) => ({
        ...u,
        pageKey: key,
        localIdx: i,
        optimized: isOptimized,
      })),
    );
  }
  const total = allUsages.length;
  const size =
    forcedSize !== undefined ? forcedSize : Math.ceil(Math.sqrt(total));
  const wrapper = document.createElement("div");
  wrapper.className = "square-grid-wrapper";
  const grid = document.createElement("div");
  grid.className = "square-grid";
  grid.dataset.gridSize = size;
  grid.dataset.total = total;
  grid.dataset.gcIdx = gcIdx;
  grid.dataset.when = when;
  if (isOptimized) grid.dataset.optimized = "true";
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (i < total) {
      const usage = allUsages[i];
      const p = usage.value;
      let r = 255,
        g = 255 - Math.round((255 * p) / 100),
        b = 255 - Math.round((255 * p) / 100);
      cell.style.background = `rgb(${r},${g},${b})`;
      if (usage.localIdx === 0) cell.style.boxShadow = "0 0 0 2px #999";
      cell.title = `${usage.optimized ? "Compacted" : "Original"} ${usage.kind} ${usage.name || ""} #${usage.localIdx} : ${p}%`;
      cell.onclick = (ev) => {
        showInfoPopup({
          kind: usage.kind,
          name: usage.name || "",
          index: usage.localIdx,
          percent: p,
          when: when,
          gcIdx: gcIdx,
          optimized: usage.optimized,
        });
        ev.stopPropagation();
      };
    } else cell.style.background = "#eee";
    grid.appendChild(cell);
  }
  wrapper.appendChild(grid);
  return wrapper;
}

/* ===== Layout scaling ===== */
function responsiveRescaleAllGrids() {
  document.querySelectorAll(".square-grid").forEach((grid) => {
    const size = parseInt(grid.dataset.gridSize, 10);
    if (!size) return;
    const wrapper = grid.parentElement;
    const wrapperWidth =
      wrapper.clientWidth || Math.min(window.innerWidth * 0.9, 900);
    const gap = parseFloat(getComputedStyle(grid).gap) || 2;
    const preferred =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--grid-max-cell",
        ),
      ) || 18;
    const minCell =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--grid-min-cell",
        ),
      ) || 6;
    let cell = preferred;
    const needed = size * cell + (size - 1) * gap;
    if (needed > wrapperWidth) {
      cell = Math.floor((wrapperWidth - (size - 1) * gap) / size);
      if (cell < minCell) cell = minCell;
    }
    applyCellSize(grid, cell);
    if (!grid.dataset.originalCellSize) grid.dataset.originalCellSize = cell;
  });
  adjustAllPairLayouts();
}
function applyCellSize(grid, cell) {
  const size = parseInt(grid.dataset.gridSize, 10);
  grid.style.gridTemplateColumns = `repeat(${size}, ${cell}px)`;
  grid.style.gridTemplateRows = `repeat(${size}, ${cell}px)`;
  grid.querySelectorAll(".cell").forEach((c) => {
    c.style.width = cell + "px";
    c.style.height = cell + "px";
  });
  grid.dataset.cellSize = cell;
}
function manualZoom(wrapper, delta) {
  wrapper.dataset.manualZoom = "true";
  const grids = [...wrapper.querySelectorAll(".square-grid")];
  if (!grids.length) return;
  let current = parseInt(
    grids[0].dataset.cellSize ||
      grids[0].querySelector(".cell")?.offsetWidth ||
      14,
    10,
  );
  let next = current + delta;
  if (next < 4) next = 4;
  if (next > 60) next = 60;
  grids.forEach((g) => applyCellSize(g, next));
  adjustPairLayout(wrapper);
}
function resetZoom(wrapper) {
  const grids = [...wrapper.querySelectorAll(".square-grid")];
  grids.forEach((g) => {
    const origin = parseInt(g.dataset.originalCellSize || 14, 10);
    applyCellSize(g, origin);
  });
  delete wrapper.dataset.manualZoom;
  adjustPairLayout(wrapper);
}
function adjustPairLayout(wrapper) {
  wrapper.querySelectorAll(".gc-squares-row").forEach((row) => {
    const panels = [...row.querySelectorAll(".gc-sq-panel")];
    if (panels.length < 2) {
      row.classList.remove("stacked");
      return;
    }
    const w = row.clientWidth;
    const totalNeeded =
      panels.reduce((sum, p) => {
        const grid = p.querySelector(".square-grid");
        if (!grid) return sum;
        const size = parseInt(grid.dataset.gridSize, 10);
        const cellSize = parseInt(grid.dataset.cellSize || 14, 10);
        const gap = parseFloat(getComputedStyle(grid).gap) || 2;
        const inner = size * cellSize + (size - 1) * gap;
        const wrap = grid.parentElement;
        const padL = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
        const padR = parseFloat(getComputedStyle(wrap).paddingRight) || 0;
        const borderL = parseFloat(getComputedStyle(wrap).borderLeftWidth) || 0;
        const borderR =
          parseFloat(getComputedStyle(wrap).borderRightWidth) || 0;
        return sum + inner + padL + padR + borderL + borderR;
      }, 0) + 28;
    if (totalNeeded > w) row.classList.add("stacked");
    else row.classList.remove("stacked");
  });
}
function adjustAllPairLayouts() {
  document.querySelectorAll(".gc-pair-wrapper").forEach(adjustPairLayout);
}

/* ===== Popups ===== */
function showUnifiedBarPopup(beforeDist, afterDist, allKeys, title) {
  let beforeMeta = [],
    afterMeta = [],
    maxCount = 1,
    maxDiff = 1;
  for (const key of allKeys) {
    const b = beforeDist[key] || [],
      a = afterDist[key] || [];
    beforeMeta.push({
      key,
      count: b.length,
      kind: b[0]?.kind || "Unknown",
      name: b[0]?.name || key,
      usages: b,
    });
    afterMeta.push({
      key,
      count: a.length,
      kind: a[0]?.kind || "Unknown",
      name: a[0]?.name || key,
      usages: a,
    });
    maxCount = Math.max(maxCount, b.length, a.length);
    maxDiff = Math.max(maxDiff, Math.abs(a.length - b.length));
  }
  const popup = document.createElement("div");
  popup.className = "bar-popup";
  popup.innerHTML = `
    <div class="bar-popup-header">${U.escapeHtml(title)} Page Type Counts
      <button class="close-btn" onclick="this.closest('.bar-popup').remove()">&times;</button>
    </div>
    <div style="display:flex;gap:28px;flex-wrap:wrap;">
      ${buildBarSection(beforeMeta, maxCount, "Before")}
      ${buildBarSection(afterMeta, maxCount, "After")}
      ${buildDiffSection(beforeMeta, afterMeta, maxDiff, "Diff")}
    </div>`;
  document.body.appendChild(popup);
  U.makeMovable(popup, popup.querySelector(".bar-popup-header"));
}
function buildBarSection(meta, maxCount, title) {
  let html = `<div style="flex:1;min-width:250px;"><div style="font-weight:bold;text-align:center;margin-bottom:6px;">${U.escapeHtml(title)}</div><div>`;
  for (const m of meta) {
    const label = `${m.kind}${m.kind === "FixedBlockPage" ? "[" + m.name + "]" : m.name ? " " + m.name : ""} (${m.count})`;
    const barLen = Math.max(6, Math.round((m.count / maxCount) * 380));
    const mean = m.usages.length
      ? Math.round(m.usages.reduce((a, u) => a + u.value, 0) / m.usages.length)
      : 0;
    let r = 255,
      g = 255 - Math.round((255 * mean) / 100),
      b = 255 - Math.round((255 * mean) / 100);
    html += `<div style="display:flex;align-items:center;margin:3px 0;">
      <span style="min-width:170px;text-align:right;margin-right:10px;font-family:monospace;font-size:0.72em;">${U.escapeHtml(label)}:</span>
      <div style="height:14px;border-radius:6px;background:rgb(${r},${g},${b});width:${barLen}px;" title="mean ${mean}%"></div>
    </div>`;
  }
  html += "</div></div>";
  return html;
}
function buildDiffSection(beforeMeta, afterMeta, maxDiff, title) {
  let html = `<div style="flex:1;min-width:250px;"><div style="font-weight:bold;text-align:center;margin-bottom:6px;">${U.escapeHtml(title)}</div><div>`;
  for (let i = 0; i < beforeMeta.length; i++) {
    let b = beforeMeta[i],
      a = afterMeta[i];
    let diff = a.count - b.count;
    let barLen =
      maxDiff === 0 ? 0 : Math.round((Math.abs(diff) / maxDiff) * 380);
    if (barLen < 6 && diff !== 0) barLen = 6;
    let cls = diff > 0 ? "#aafaa5" : diff < 0 ? "#faa" : "#ddd";
    let label = `${b.kind}${b.kind === "FixedBlockPage" ? "[" + b.name + "]" : b.name ? " " + b.name : ""}`;
    let sign = diff > 0 ? "+" : "";
    html += `<div style="display:flex;align-items:center;margin:3px 0;">
      <span style="min-width:170px;text-align:right;margin-right:10px;font-family:monospace;font-size:0.72em;">${U.escapeHtml(label)}</span>
      <div style="height:14px;border-radius:6px;background:${cls};width:${barLen}px;" title="diff ${diff}"></div>
      <span style="margin-left:6px;font-size:0.72em;color:#1976d2;">${sign}${diff}</span>
    </div>`;
  }
  html += "</div></div>";
  return html;
}
function showInfoPopup(info) {
  const popup = document.createElement("div");
  popup.className = "info-popup";
  popup.style.left = window.innerWidth * 0.55 + Math.random() * 60 + "px";
  popup.style.top = 200 + Math.random() * 100 + "px";
  popup.innerHTML = `
    <div class="info-popup-header">Page Info
      <button class="close-btn" onclick="this.closest('.info-popup').remove()">&times;</button>
    </div>
    <div>
      Kind: <b>${U.escapeHtml(info.kind)}</b><br>
      Name: <b>${U.escapeHtml(info.name)}</b><br>
      Index: <b>${info.index}</b><br>
      Occupancy: <b>${info.percent}%</b><br>
      GC: <b>${U.escapeHtml(info.gcIdx)}</b> (${U.escapeHtml(info.when)})<br>
      Mode: <b>${info.optimized ? "Simulated Compacted" : "Original"}</b>
    </div>`;
  document.body.appendChild(popup);
  U.makeMovable(popup, popup.querySelector(".info-popup-header"));
}

/* ===== Correlation Panel ===== */
function buildCorrelationPanel() {
  const panel = document.getElementById("correlation-rows");
  if (state.gcPairs.length === 0 && state.heapGcMarkers.length === 0) {
    panel.innerHTML = "";
    return;
  }
  let html = "";
  const gcIndices = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  if (gcIndices.length && state.heapGcMarkers.length) {
    gcIndices.forEach((idx, pos) => {
      if (pos < state.heapGcMarkers.length) {
        html += `<div class="corr-row" data-gc="${idx}">GC ${idx} <span class="inline-badge">heap@${state.heapGcMarkers[pos]}</span></div>`;
      } else {
        html += `<div class="corr-row" data-gc="${idx}">GC ${idx} <span class="inline-badge" style="background:#999">no marker</span></div>`;
      }
    });
  } else if (gcIndices.length) {
    html += "<div><b>GC indices:</b></div>";
    gcIndices.forEach((idx) => {
      html += `<div class="corr-row" data-gc="${idx}">GC ${idx}</div>`;
    });
  } else {
    html += "<div><b>Heap GC markers:</b></div>";
    state.heapGcMarkers.forEach((s, i) => {
      html += `<div class="corr-row" data-marker="${i}">Marker ${i + 1} @ sample ${s}</div>`;
    });
  }
  panel.innerHTML = html;
  panel.querySelectorAll(".corr-row").forEach((row) => {
    row.onclick = () => {
      panel
        .querySelectorAll(".corr-row")
        .forEach((r) => r.classList.remove("active"));
      row.classList.add("active");
      const gcIdx = row.getAttribute("data-gc");
      if (gcIdx) {
        Plot.highlightAndFocusHeapMarker(state, parseInt(gcIdx));
        Plot.jumpToHeapTimeline();
        scrollToGCPair(parseInt(gcIdx));
      } else {
        const m = row.getAttribute("data-marker");
        if (m !== null) {
          Plot.highlightAndFocusHeapMarkerByPosition(state, parseInt(m));
          Plot.jumpToHeapTimeline();
        }
      }
    };
  });
}
function scrollToGCPair(idx) {
  const wrappers = [...document.querySelectorAll(".gc-pair-wrapper")];
  for (const w of wrappers) {
    if (
      w.querySelector(".gc-summary-title")?.textContent.includes(`GC ${idx}`)
    ) {
      w.scrollIntoView({ behavior: "smooth", block: "center" });
      w.style.outline = "3px solid #1976d2";
      setTimeout(() => (w.style.outline = ""), 1600);
      break;
    }
  }
}

/* ===== Misc helpers that depended on old globals ===== */
function getMemStatForGcIdx(gcIdx) {
  const sorted = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  const pos = sorted.indexOf(gcIdx);
  if (pos === -1 || pos >= state.heapGcMarkerRawValues.length) return null;
  return state.heapGcMarkerRawValues[pos];
}

/* ===== File Handler (Merged) wiring ===== */
document.getElementById("merged-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("merged-file-name").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    parseMergedFile(ev.target.result);
  };
  reader.readAsText(file);
});

/* ===== Downsampling Controls wiring ===== */
document.getElementById("apply-ds-btn").addEventListener("click", () => {
  const target = parseInt(document.getElementById("ds-target").value, 10);
  const algo = document.getElementById("ds-algo").value;
  if (isNaN(target) || target < 100) {
    alert("Please enter a target >= 100.");
    return;
  }
  if (state.heapValuesOriginal.length === 0) {
    alert("Load merged file first.");
    return;
  }
  applyDownsampling(algo, target);
  document.getElementById("toggle-original-btn").textContent = "Show Original";
});
document.getElementById("toggle-original-btn").addEventListener("click", () => {
  if (state.heapValuesOriginal.length === 0) return;
  if (state.dsActive) {
    revertToOriginal();
    document.getElementById("toggle-original-btn").textContent =
      "Show Downsampled";
  } else {
    applyDownsampling(state.lastAlgo, state.lastTarget);
    document.getElementById("toggle-original-btn").textContent =
      "Show Original";
  }
});

/* ===== Init ===== */
updateDsInfo();
buildCorrelationPanel();
