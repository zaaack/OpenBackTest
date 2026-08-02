import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Candle, Timeframe, ChartConfig } from '../types';
import { createDebouncedJSONStorage, armPersist } from '../lib/persistStorage';


interface BacktestState {
  rawData: Candle[];
  symbol: string;
  currentIndex: number;
  charts: ChartConfig[];
  isPlaying: boolean;
  playbackSpeed: number; // ms per tick
  isUploading: boolean;
  uploadProgress: number; // 0-100
  mode: 'playback' | 'simulation';
  maxCandles: number; // cap on candles rendered on the chart (perf)

  loadData: (data: Candle[], symbol?: string) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  addChart: (config: ChartConfig) => void;
  removeChart: (id: string) => void;
  setChartTimeframe: (id: string, tf: Timeframe) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
  rewind: () => void;
  fastForward: () => void;
  setMode: (mode: 'playback' | 'simulation') => void;
  setMaxCandles: (n: number) => void;
  getCurrentTickTime: () => number | null;
  importState: (state: Partial<BacktestState>) => void;
  updateLiveCandle: (kline: Candle) => void;
}

export const useBacktestStore = create<BacktestState>()(
  persist(
    (set, get) => ({
  rawData: [],
  symbol: '',
  currentIndex: -1,
  charts: [{ id: 'chart-1', timeframe: '1m' }],
  isPlaying: false,
  playbackSpeed: 500,
  isUploading: false,
  uploadProgress: 0,
  mode: 'playback',
  maxCandles: 0, // 0 = no cap (show all candles)

  loadData: (data: Candle[], symbol?: string) => set({ 
    rawData: data, 
    symbol: symbol ?? '',
    currentIndex: Math.min(100, data.length - 1),
    isPlaying: false,
    isUploading: false,
    uploadProgress: 0
  }),

  setUploading: (uploading: boolean) => set({ isUploading: uploading }),
  setUploadProgress: (progress: number) => set({ uploadProgress: progress }),

  stepForward: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.rawData.length - 1)
  })),

  stepBackward: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0)
  })),

  addChart: (config: ChartConfig) => set((state) => ({
    charts: state.charts.length < 3 ? [...state.charts, config] : state.charts
  })),

  removeChart: (id: string) => set((state) => ({
    charts: state.charts.filter(c => c.id !== id)
  })),

  setChartTimeframe: (id: string, tf: Timeframe) => set((state) => ({
    charts: state.charts.map(c => c.id === id ? { ...c, timeframe: tf } : c)
  })),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),

  setCurrentIndex: (index: number) => set((state) => ({
    currentIndex: Math.max(0, Math.min(index, state.rawData.length - 1))
  })),

  rewind: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 10, 0)
  })),

  fastForward: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 10, state.rawData.length - 1)
  })),

  setMode: (mode: 'playback' | 'simulation') => set({ mode }),

  setMaxCandles: (n: number) => set({ maxCandles: Math.max(0, Math.floor(n)) }),

  getCurrentTickTime: () => {
    const { rawData, currentIndex } = get();
    if (rawData.length === 0 || currentIndex === -1) return null;
    return rawData[currentIndex].time;
  },

  importState: (state: Partial<BacktestState>) => set((prev) => ({ ...prev, ...state })),

  updateLiveCandle: (kline: Candle) => {
    set((state) => {
      const rawData = [...state.rawData];
      if (rawData.length === 0) return state;

      const lastCandle = rawData[rawData.length - 1];
      if (kline.time === lastCandle.time) {
        rawData[rawData.length - 1] = kline;
      } else if (kline.time > lastCandle.time) {
        rawData.push(kline);
      } else if (rawData.length >= 2 && kline.time === rawData[rawData.length - 2].time) {
        rawData[rawData.length - 2] = kline;
      }

      return {
        rawData,
        currentIndex: rawData.length - 1
      };
    });
  }
    }),
    {
      name: 'backtest-state-storage',
      version: 1,
      storage: createDebouncedJSONStorage(),
      // Don't auto-restore on startup; the simulation is re-applied only after
      // the corresponding K-line data has been loaded (see restoreSavedSession).
      skipHydration: true,
      partialize: (state) => ({
        symbol: state.symbol,
        currentIndex: state.currentIndex,
        charts: state.charts,
        playbackSpeed: state.playbackSpeed,
        mode: state.mode,
        maxCandles: state.maxCandles,
      }),
    }
  )
);

// Persist on any low-frequency change (symbol, charts/timeframe, playback
// speed, mode, maxCandles, isPlaying) but NOT on the per-tick `currentIndex`
// update, which would write on every playback frame.
useBacktestStore.subscribe((state, prev) => {
  if (state.currentIndex === prev.currentIndex) {
    armPersist(); // a non-tick field changed
    return;
  }
  if (
    state.symbol !== prev.symbol ||
    state.charts !== prev.charts ||
    state.playbackSpeed !== prev.playbackSpeed ||
    state.mode !== prev.mode ||
    state.maxCandles !== prev.maxCandles ||
    state.isPlaying !== prev.isPlaying
  ) {
    armPersist();
  }
});
