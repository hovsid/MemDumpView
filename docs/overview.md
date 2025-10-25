# Heap Dump Viewer — Overview (for beginners)

This document explains the big picture and the major parts of the project.

Goal

- Visualize heap usage timeline and page dump / GC pairs.
- Keep original content and UX unchanged while enabling future engineers to work comfortably.

Major pieces

- index.html — The original page content and structure (moved to `src/index.html`).
- styles.css — All CSS rules (extracted so it's easier to edit).
- src/js/main.js — The JavaScript logic (ES module) extracted from the inline `<script>` in the original file. It keeps the original code intact, but now lives as a module to allow further splitting.
- docs/ — Guides for each code area and how to run and extend the project.

How to run locally

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open: http://localhost:5173

When the server is running you can:

- Load a merged heap dump file with the "Load Merged File" button.
- Inspect GC pairs and see heap timeline + simulated compaction.

Why code was moved to a module

- Keeps the HTML content identical while placing code into JS files under version control.
- Makes it easier to add unit tests and incremental refactors.
