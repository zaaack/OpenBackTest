export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: string;
}

export type Timeframe = '1m' | '3m' | '5m' | '10m' | '12m' | '15m' | '30m' | '1h' | '2h' | '3h' | '4h' | '1d';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '10m': 600,
  '12m': 720,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '3h': 10800,
  '4h': 14400,
  '1d': 86400,
};

export const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '10m', '12m', '15m', '30m', '1h', '2h', '3h', '4h', '1d'];

export interface ChartConfig {
  id: string;
  timeframe: Timeframe;
}
