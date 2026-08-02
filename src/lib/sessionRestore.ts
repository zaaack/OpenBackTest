import { useBacktestStore } from '../store/useBacktestStore';
import { useTradeStore } from '../store/useTradeStore';
import type { TradeState } from '../store/useTradeStore';

const BACKTEST_KEY = 'backtest-state-storage';
const TRADE_KEY = 'trade-state-storage';

function readPersistedState(key: string): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Called after the corresponding K-line data has been loaded. Auto-restores
 * the saved simulation state (trades, position, playback index) only when its
 * symbol matches the loaded data. If there is no matching saved session, the
 * simulation starts fresh.
 */
export function restoreSavedSession(loadedSymbol: string) {
  const savedB = readPersistedState(BACKTEST_KEY);
  const savedT = readPersistedState(TRADE_KEY);

  if (savedB?.symbol && loadedSymbol && savedB.symbol === loadedSymbol && savedT) {
    const data = useBacktestStore.getState().rawData;
    const maxIdx = Math.max(0, data.length - 1);
    useBacktestStore.getState().importState({
      symbol: savedB.symbol,
      currentIndex: Math.min(savedB.currentIndex ?? 0, maxIdx),
      charts: savedB.charts,
      playbackSpeed: savedB.playbackSpeed,
      mode: savedB.mode,
    });
    useTradeStore.getState().importState(savedT as Partial<TradeState>);
    return true;
  }

  // No corresponding saved session -> ensure a clean slate
  useTradeStore.getState().reset();
  return false;
}
