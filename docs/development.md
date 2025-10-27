# Development guide

This file tells you how to develop, test manually and contribute.

## Pre-requisites

- Node 18+ (or latest LTS)
- npm

## Common commands

- Install: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build`
- Preview production build: `npm run preview`
- Lint: `npm run lint` (basic)
- Format: `npm run format`

## Editing JS

- The main code lives in `src/js/main.js`. It's intentionally a single module to start with so reviewers can see the original logic in one place.
- When you split functionality into separate modules:
  - Create files in `src/js/` (e.g. `parser.js`, `plot.js`, `ui.js`, `utils.js`).
  - Export only what's needed and import in `main.js`.
  - Confirm UI behavior manually after each change.

## Manual QA checklist (after changes)

- Load a sample merged file — ensure `load-status` updates and timeline shows.
- Click GC entries in the "GC Correlation" panel — ensure the correlation works.
- Ensure the "Downsampling" controls operate exactly as before (bucket vs lttb, toggle original).
- Inspect one GC pair and open the popups to verify counts and simulated compaction numbers.

## Adding tests

- Unit tests are not included in this initial modernization. For future:
  - Add a `tests/` folder and use a test runner (e.g., vitest or mocha).
  - Start by unit-testing parser functions (parse heap lines, parse GC blocks, parse page usages).

## Pull requests and code review

- Describe why you changed code (keep PRs small).
- If refactoring, include a short "before/after" behavior checklist.
- Keep UI behavior unchanged unless explicitly intended.

## Style & lint

- This repository includes ESLint/Prettier dev dependencies. Use `npm run lint` and `npm run format` before opening PRs.
