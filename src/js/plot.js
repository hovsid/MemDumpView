// plot.js - plotting and highlight utilities (depends on Plotly global and uses state)

import { formatBytes } from "./utils.js";

/*
  Note: This file was updated to support two visible GC markers per GC pair
  (before + after). The logic assumes state.heapGcMarkers contains markers
  appended in sorted GC order, with zero, one or two markers per GC pair
  (before then after). We build a simple mapping from gcIdx -> marker positions
  (indices into state.heapGcMarkers) and use that to highlight and focus both
  markers for a given GC index.
*/

export function renderHeapPlot(state) {
  const xLine = state.dsActive
    ? state.dsCurrentX
    : Array.from({ length: state.heapValuesOriginal.length }, (_, i) => i + 1);
  const yLine = state.dsActive ? state.dsCurrentY : state.heapValuesOriginal;

  const actualTrace = {
    x: xLine,
    y: yLine,
    type: "scatter",
    mode: "lines",
    name: state.dsActive
      ? `Heap Bytes (downsampled ${state.dsCurrentX.length})`
      : "Heap Bytes",
    line: { color: "#1976d2", width: 2 },
  };

  const markerTrace = {
    x: state.heapGcMarkers,
    y: state.heapGcMarkerValues,
    type: "scatter",
    mode: "markers",
    name: "GC events",
    marker: {
      symbol: "star-diamond",
      size: 9,
      color: "red",
      line: { color: "#000", width: 1 },
    },
    text: state.heapGcMarkers.map(
      (idx, i) =>
        `GC event #${i + 1} @ sample ${idx}<br>Heap: ${state.heapGcMarkerRawValues[i]}`,
    ),
    hoverinfo: "text",
  };

  const traces = [actualTrace, markerTrace];

  if (state.haveSimulation && state.simulatedCompactedX.length) {
    traces.push({
      x: state.simulatedCompactedX,
      y: state.simulatedCompactedY,
      type: "scatter",
      mode: "lines+markers",
      name: "Simulated Compacted Heap",
      line: { color: "#ff9800", width: 2, dash: "dot" },
      marker: {
        symbol: "circle",
        size: 7,
        color: "#ff9800",
        line: { color: "#333", width: 1 },
      },
      text: state.simulatedCompactedY.map(
        (v, i) =>
          `Simulated after GC#${i + 1} @ sample ${state.simulatedCompactedX[i]}<br>${formatBytes(v)}`,
      ),
      hoverinfo: "text",
    });
  }

  Plotly.newPlot("heap-chart", traces, {
    title: "Heap Usage Over Time",
    xaxis: { title: "Sample Index" },
    yaxis: { title: "Heap Bytes" },
    legend: { orientation: "h", x: 0, y: 1.05 },
  });
  state.plotRendered = true;
}

/* Re-render helper kept simple */
export function updateSimulatedLine(state) {
  renderHeapPlot(state);
}

/* Build a mapping from gcIdx -> array of marker positions (indices into state.heapGcMarkers)
   Assumes markers were appended in sorted GC order, before then after when present.
   This is a best-effort mapping used for highlighting two markers per GC.
*/
function buildGcIdxToPositionsMap(state) {
  const map = new Map();
  if (!state.gcPairs || !state.heapGcMarkers) return map;
  const sortedGcIdx = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  let pos = 0;
  for (const idx of sortedGcIdx) {
    const positions = [];
    // For each GC we may have 0..2 markers. Consume up to 2 markers from heapGcMarkers
    // in sequence and assign them to this GC. This relies on the invariant that
    // main mapping appended before then after markers for sorted GC pairs.
    if (pos < state.heapGcMarkers.length) {
      positions.push(pos);
      pos++;
    }
    if (pos < state.heapGcMarkers.length) {
      // We allow two markers per GC. Add second one.
      positions.push(pos);
      pos++;
    }
    if (positions.length) map.set(idx, positions);
  }
  return map;
}

/* Highlight both markers for a given GC index (if present).
   We update marker sizes and place an annotation near the first marker.
*/
export function highlightHeapMarker(state, gcIdx) {
  if (!state.plotRendered) return;
  const gcMap = buildGcIdxToPositionsMap(state);
  const positions = gcMap.get(gcIdx);
  if (!positions || positions.length === 0) return;
  // Build sizes array: enlarge the markers at these positions
  const sizes = state.heapGcMarkers.map((_, i) =>
    positions.includes(i) ? 18 : 9,
  );
  Plotly.restyle("heap-chart", { "marker.size": [sizes] }, 1);

  // Create annotation at first marker of the GC
  const pos0 = positions[0];
  if (pos0 == null) return;
  const ann = {
    x: state.heapGcMarkers[pos0],
    y: state.heapGcMarkerValues[pos0],
    text: `GC ${gcIdx}`,
    showarrow: true,
    arrowhead: 7,
    ax: 0,
    ay: -40,
    bgcolor: "#1976d2",
    font: { color: "#fff", size: 10 },
  };
  Plotly.relayout("heap-chart", { annotations: [ann] });
}

/* Highlight a marker by its position in the heapGcMarkers array */
export function highlightHeapMarkerByPosition(state, pos) {
  if (!state.plotRendered) return;
  const sizes = state.heapGcMarkers.map((_, i) => (i === pos ? 16 : 9));
  Plotly.restyle("heap-chart", { "marker.size": [sizes] }, 1);
  const ann = {
    x: state.heapGcMarkers[pos],
    y: state.heapGcMarkerValues[pos],
    text: `GC#${pos + 1}`,
    showarrow: true,
    arrowhead: 7,
    ax: 0,
    ay: -40,
    bgcolor: "#1976d2",
    font: { color: "#fff", size: 10 },
  };
  Plotly.relayout("heap-chart", { annotations: [ann] });
}

/* Focus window around a given sample index (sampleIndex is the X value, not marker position) */
export function focusOnHeapMarker(state, sampleIndex) {
  if (!state.plotRendered) return;
  const total = state.heapValuesOriginal.length;
  const windowSize = Math.max(50, Math.round(total * 0.05));
  let start = sampleIndex - Math.floor(windowSize / 2);
  let end = sampleIndex + Math.floor(windowSize / 2);
  if (start < 1) {
    end += 1 - start;
    start = 1;
  }
  if (end > total) {
    let diff = end - total;
    start = Math.max(1, start - diff);
    end = total;
  }
  Plotly.relayout("heap-chart", { "xaxis.range": [start, end] });
}

/* Highlight + focus both markers for a GC index; focus uses the first marker sample */
export function highlightAndFocusHeapMarker(state, gcIdx) {
  highlightHeapMarker(state, gcIdx);
  const gcMap = buildGcIdxToPositionsMap(state);
  const positions = gcMap.get(gcIdx);
  if (!positions || positions.length === 0) return;
  const firstPos = positions[0];
  const sampleIndex = state.heapGcMarkers[firstPos];
  if (sampleIndex == null) return;
  focusOnHeapMarker(state, sampleIndex);
}

/* Highlight by marker array position and focus on that marker's sample */
export function highlightAndFocusHeapMarkerByPosition(state, pos) {
  highlightHeapMarkerByPosition(state, pos);
  if (pos < 0 || pos >= state.heapGcMarkers.length) return;
  focusOnHeapMarker(state, state.heapGcMarkers[pos]);
}

export function jumpToHeapTimeline() {
  const chart = document.getElementById("heap-chart");
  if (chart) chart.scrollIntoView({ behavior: "smooth", block: "center" });
}
