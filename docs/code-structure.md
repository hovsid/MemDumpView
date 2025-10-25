# Code Structure (Detailed map) — For new contributors

This explains where functionality lives and what each major function or area does.

Files
- src/index.html
  - The exact page content (titles, buttons, layout) as the original page.
  - Loads Plotly from CDN (same as the original).
  - Loads styles from `src/css/styles.css`.
  - Loads our modular JS at the end `<script type="module" src="/js/main.js"></script>`

- src/css/styles.css
  - All CSS (extracted from the original `<style>` block).
  - Preserve selectors and variable names (so visuals remain identical).

- src/js/main.js
  - Contains the entire original inline script code (refactored to a module scope).
  - Responsibilities:
    - Utilities: helper functions like `formatBytes`, `escapeHtml`, `makeMovable`.
    - State: shared arrays/variables for heap values, GC pairs, downsampling state.
    - Parsing: `parseMergedFile`, `parseHeapTimelineFromLines`, and GC parsing helpers.
    - UI rendering: `renderGCPairs`, `renderSquareGrid`, popup builders.
    - Plotting: `renderHeapPlot`, Plotly trace creation and interactions.
    - Downsampling: `downsampleBucket`, `downsampleLTTB`, `applyDownsampling`.
    - Interaction helpers: highlight/focus functions, correlation panel building.
    - File handling and event wiring.

How functions are grouped inside the file
- Utility functions at top (small, pure helpers).
- Parsing functions next.
- Rendering / UI building functions (grids, popups).
- Downsampling functions.
- Plotting & highlight functions.
- Initialization & event wiring at the bottom.

Where to start when editing
1. Read `docs/code-structure.md` and `docs/overview.md`.
2. Open `src/js/main.js` and search for the function name of interest (the function names are the same as in the original file).
3. Whenever possible, refactor by extracting small modules (e.g., create `src/js/parser.js`, `src/js/plot.js`), export and import them. Tests / manual verification should be added to avoid regressions.

Remember:
- Keep behavior & UI identical unless intentional changes are requested.
- When refactoring to new modules, prefer incremental changes and run the app to verify correctness.
