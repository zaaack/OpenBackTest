# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Summary

OpenBackTest is a **client-side-only** manual trading backtesting tool built with React 19 + Vite. Users import historical candle data (CSV/JSON), replay it on a timeline, manually execute trades, and analyze performance. No backend — everything runs in the browser and state persists to localStorage. It can also stream live data from the Binance Futures API.

## Commands

```sh
npm install            # install deps (pnpm-lock.yaml is also present; pnpm install works too)
npm run dev            # start Vite dev server
npm run build          # type-check (tsc -b) and build to dist/
npm run lint           # eslint . (flat config in eslint.config.js)
npm run preview        # preview the production build
npm run test           # run vitest in watch mode
npm run coverage       # run tests once with v8 coverage report
```

Run a single test file (vitest does not watch when given a path, but be explicit with `run` for CI-style one-shot):

```sh
npx vitest run tests/store/useTradeStore.test.ts
npm run test -- tests/store/useTradeStore.test.ts   # from the script (watch mode)
```

The `build` script runs `tsc -b` (project references via `tsconfig.app.json` / `tsconfig.node.json`), so TypeScript type errors fail the build. Lint uses flat config with `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`.

## Architecture

The codebase follows a **Decoupled Bridge** pattern (the key mental model):

1. **State (pure, chart-agnostic)** — Zustand stores hold raw data and do the math (PnL, aggregation). They never touch the chart.
2. **View (declarative)** — React components handle layout and user input.
3. **Hooks (the bridge)** — watch store state and imperatively drive the KlineCharts engine (`chart.applyNewData()`, `chart.createOverlay()`).
4. **Engine (imperative)** — KlineCharts renders to Canvas; low-level extensions live in `src/lib/chart/`.

### State flow
CSV/JSON → `useBacktestStore` (load + `aggregation.ts` to the active timeframe) → `useChart` detects changes and calls `chart.applyNewData()` → user actions hit `useTradeStore` → `useTradeOverlays` renders TP/SL/position visuals → on finish, trades aggregate into `finishedPositions` → `StatsModal` (uses `src/lib/equity.ts` for the equity curve).

### Key directories
- `src/store/` — Zustand stores: `useBacktestStore` (playback, multi-chart `ChartConfig[]`, `updateLiveCandle`), `useTradeStore` (execution, PnL, `finishedPositions`, session stats), `useBinanceStore` (live connection), `useChartStyleStore` (persisted chart colors), `useConfirmStore`.
- `src/hooks/` — `useChart` (chart lifecycle/resize), `useIndicators` (bridge to indicator API, owns `INDICATORS_LIST`), `useTradeOverlays` (TP/SL visuals), `useContextMenu`, `useDrawingTools`, `useUndoRedo`.
- `src/components/TradingChart/` — chart UI (overlays, context menu, drawing toolbar, indicator menus, candle editor). `ChartGrid.tsx` manages the resizable multi-chart layout (`react-resizable-panels`).
- `src/lib/chart/` — KlineCharts extensions: `customIndicators.ts` (e.g. VPVR), `overlays.ts` (custom overlay registration), `constants.ts` (shared IDs), `utils.ts`.
- `src/services/binance.ts` — REST fetch of symbols/historical klines + live polling (~1.5s).
- `src/utils/aggregation.ts` — resamples 1m raw data into higher timeframes.
- `src/types/` — `index.ts` (Candle/Trade/Timeframe) and `indicatorTypes.ts`.

Dependency order to keep in mind: View → Hooks → Store/Engine. Components should not call KlineCharts directly; route through hooks.

## Testing Rules (important — from the project's agent guidelines)

- **All tests go in the root `tests/` directory** (`tests/store`, `tests/components`, `tests/hooks`). Do **not** add `__tests__` folders or `.test.ts` files inside `src/`.
- Stack: `vitest` + `jsdom` + `@testing-library/react`. Setup file is `tests/setup.ts`.
- For hooks/stores touching canvas or browser APIs, use `renderHook` and `vi.mock()` / `vi.spyOn()`.
- New UI components and stores should ship with test coverage; verify via `npm run coverage`.

## Common Tasks

- **Add an indicator**: define math in `src/lib/chart/customIndicators.ts`, then add its name to `INDICATORS_LIST` in `src/hooks/useIndicators.ts`.
- **Change trading logic**: `src/store/useTradeStore.ts` (execution) and `src/hooks/useTradeOverlays.ts` (visuals).
- **Add a stat metric**: update the `Position`/`finishedPositions` shape in `useTradeStore.ts`, compute in `StatsModal.tsx`, and feed the equity curve via `src/lib/equity.ts`.

## External Data Notes

- **Binance live**: `useBinanceStore` clears the chart, loads history into `useBacktestStore`, and starts polling. `useBacktestStore.updateLiveCandle(kline)` updates the last candle or appends a new one when the timestamp advances.
- **Import third-party trades**: load a JSON mimicking session state (see CODEBASE.md for the exact shape). `finishedPositions.pnl` must be **gross** (pre-fee); `tradeHistory` fees are subtracted to compute net. Load a CSV first, then import the JSON session.
