# Beginner guide: What each important function does

This doc lists and explains the main functions you will find in `src/js/main.js`. Use it as an orientation before editing code.

Utilities
- escapeHtml(text): Escapes special characters for safe HTML insertion.
- makeMovable(popup, header): Adds mouse drag handlers so popups can be dragged by the header.
- formatBytes(bytes): Human-readable byte size formatting.

Parsing & state
- parseMergedFile(content): Accepts the entire merged file as text. It expects markers:
  - `phase1:` followed by "heap use"
  - `phase2:` followed by "page dump"
  It splits the file and feeds the heap timeline and GC dump parts to their respective parsers. Updates load status in UI.
- parseHeapTimelineFromLines(lines): Parses the phase1 lines, builds:
  - heapValuesOriginal: array of heap byte numbers
  - heapGcMarkers: positions (sample indexes) where status=true
  - heapGcMarkerRawValues: raw heap bytes for these markers
  - heapGcMarkerValues: a tiny offset added for plotting markers above the line
  It also triggers downsampling and initial plot build.
- parseGCDumpBlocks(text): Splits the page dump text into blocks (before/after blocks) using a regex on headers.
- pairBlocks(blocks): Pairs adjacent before/after blocks with the same GC index into pairs array.

Page distribution helpers
- parsePageDistribution(contentLines): Parses lines inside a before/after block and returns a dictionary of page-types -> array of page usages.
- parsePageUsages(data, kind, name): Parses the string representation of usages like "(40%) + -" and returns structured entries.
- countTotalPages(dist), kindOrder(k): Small helpers for layout and ordering.

Visualization / UI rendering
- renderGCPairs(): Main function that renders all GC before/after summaries, the square grids, simulated compaction panels, and wiring of their buttons. Also builds the correlation panel and simulated series for the heap timeline.
- renderSquareGrid(groups, allKeys, when, gcIdx, forcedSize, isOptimized=false): Builds a grid of colored cells representing pages, with click handler to show details.

Plot handling
- renderHeapPlot(): Builds Plotly traces from the current data (downsampled/original line, GC markers, optional simulated-compacted line) and calls Plotly.newPlot.
- updateSimulatedLine(): Convenience wrapper to refresh plot when simulated series changes.

Downsampling
- downsampleBucket(x,y,target,forceSet): Bucket min/max downsampling. Ensures markers in forceSet are preserved.
- downsampleLTTB(x,y,target,forceSet): LTTB algorithm ensuring forceSet is preserved.
- applyDownsampling(algo, target): Applies the selected algorithm and updates dsCurrentX/dsCurrentY, then re-renders the plot.
- revertToOriginal(): Reverts to the full original sample set.

Interaction helpers
- buildCorrelationPanel(): Builds the list of GC ↔ heap markers. Clicking a row highlights the GC and scrolls/zooms the timeline and related GC pair view.
- highlightHeapMarker, highlightHeapMarkerByPosition: Visual highlighting on the Plotly chart.
- focusOnHeapMarker(sampleIndex): Zooms the Plotly X axis window centered around the chosen sample.
- showUnifiedBarPopup, showInfoPopup: Build and show popups with charts and page info.

Event wiring
- File input change handler: Reads uploaded merged file and hands to parseMergedFile.
- Buttons for applying downsampling and toggling original/downsamped view.
