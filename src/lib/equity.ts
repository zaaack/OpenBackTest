import type { Candle } from '../types';
import type { Trade } from '../store/useTradeStore';

export interface EquityPoint {
  time: number; // unix timestamp in seconds
  equity: number;
}

/**
 * Reconstruct a per-candle equity (fund) curve by replaying the trade history
 * against the candle closes.
 *
 * `tradeHistory` only records executed trades, so it is a complete and
 * self-contained source of truth for balance changes (fees + realized PnL).
 * The curve is **realized-only**: `balance` already includes fees and realized
 * PnL, so each point is just `balance`. It steps only when a trade executes
 * (position opens/closes) and does NOT move with mark-to-market — i.e. it
 * updates on position close rather than on every price tick.
 */
export function buildEquitySeries(
  rawData: Candle[],
  tradeHistory: Trade[],
  initialBalance: number,
  contractSize: number,
): EquityPoint[] {
  const series: EquityPoint[] = [];
  if (rawData.length === 0) return series;

  let balance = initialBalance;
  let pos: { side: 'long' | 'short'; entry: number; qty: number } | null = null;

  // Stable sort by time keeps insertion order for trades sharing a timestamp
  // (e.g. a flip emits a close trade then an open trade at the same time).
  const trades = [...tradeHistory].sort((a, b) => a.time - b.time);

  let ti = 0;
  for (let i = 0; i < rawData.length; i++) {
    const candle = rawData[i];
    const t = candle.time;

    while (ti < trades.length && trades[ti].time <= t) {
      const tr = trades[ti];
      const qty = tr.quantity;
      balance -= tr.fee; // fees always reduce balance

      if (!pos) {
        pos = { side: tr.type === 'buy' ? 'long' : 'short', entry: tr.price, qty };
      } else if (pos.side === 'long') {
        if (tr.type === 'buy') {
          // Average up
          const newQty = pos.qty + qty;
          pos.entry = (pos.entry * pos.qty + tr.price * qty) / newQty;
          pos.qty = newQty;
        } else {
          // Sell (netting)
          if (qty < pos.qty) {
            balance += (tr.price - pos.entry) * qty * contractSize;
            pos.qty -= qty;
          } else if (qty === pos.qty) {
            balance += (tr.price - pos.entry) * qty * contractSize;
            pos = null;
          } else {
            balance += (tr.price - pos.entry) * pos.qty * contractSize;
            pos = { side: 'short', entry: tr.price, qty: qty - pos.qty };
          }
        }
      } else {
        // short
        if (tr.type === 'sell') {
          // Average down
          const newQty = pos.qty + qty;
          pos.entry = (pos.entry * pos.qty + tr.price * qty) / newQty;
          pos.qty = newQty;
        } else {
          // Buy (netting)
          if (qty < pos.qty) {
            balance += (pos.entry - tr.price) * qty * contractSize;
            pos.qty -= qty;
          } else if (qty === pos.qty) {
            balance += (pos.entry - tr.price) * qty * contractSize;
            pos = null;
          } else {
            balance += (pos.entry - tr.price) * pos.qty * contractSize;
            pos = { side: 'long', entry: tr.price, qty: qty - pos.qty };
          }
        }
      }
      ti++;
    }

    // Realized-only equity: `balance` already includes fees + realized PnL.
    // No unrealized (mark-to-market) term, so the curve only changes on a trade.
    series.push({ time: t, equity: balance });
  }

  return series;
}
