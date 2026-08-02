import { useEffect, useRef } from 'react';
import type { Chart, OverlayEvent } from 'klinecharts';
import { useTradeStore } from '../store/useTradeStore';

/**
 * Binary search the (ascending, time-sorted) data list for the candle that
 * contains `timestamp` (greatest ts <= timestamp). Far cheaper than the old
 * linear scan, which mattered because this used to run every playback tick.
 */
function findContainingCandle(
  dataList: Array<{ timestamp?: number; high: number; low: number }>,
  timestamp: number,
): { high: number; low: number } | undefined {
  let lo = 0;
  let hi = dataList.length - 1;
  let res: { high: number; low: number } | undefined;
  let nearest = dataList[0];
  let best = Infinity;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ts = dataList[mid].timestamp ?? 0;
    const diff = Math.abs(ts - timestamp);
    if (diff < best) {
      best = diff;
      nearest = dataList[mid];
    }
    if (ts <= timestamp) {
      res = dataList[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res ?? nearest;
}

export function useTradeOverlays(chartRef: React.MutableRefObject<Chart | null>) {
  const { 
    position, entryPrice, activePositionSize, takeProfit, stopLoss, 
    tradeHistory, showTradeHistory 
  } = useTradeStore();
  const setTakeProfit = useTradeStore(state => state.setTakeProfit);
  const setStopLoss = useTradeStore(state => state.setStopLoss);

  const isDraggingRef = useRef(false);

  // Position / TP / SL lines. Re-syncs ONLY on a trade or a manual edit
  // (position / entry / TP / SL change) — NOT on every playback tick. The PnL
  // label is read once at sync time via getState, so it intentionally does not
  // move live with the price (no per-tick overlay churn).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const unrealizedPnL = useTradeStore.getState().unrealizedPnL;

    if (position !== 'flat' && entryPrice !== null) {
      const pnlPrefix = unrealizedPnL >= 0 ? '+' : '';
      const pnlText = `${pnlPrefix}${unrealizedPnL.toFixed(2)}`;
      const positionText = `${position === 'long' ? '' : '-'} ${activePositionSize} @ ${entryPrice.toFixed(2)} | PnL: ${pnlText}`;

      const overlayData = {
        id: 'positionLine_overlay',
        name: 'positionLine',
        extendData: {
          text: positionText,
          color: position === 'long' ? '#008a63ff' : '#bb2b2bff'
        },
        points: [{ value: entryPrice }]
      };

      if (chart.getOverlayById('positionLine_overlay')) {
        chart.overrideOverlay(overlayData);
      } else {
        chart.createOverlay(overlayData);
      }
    } else {
      chart.removeOverlay({ id: 'positionLine_overlay' });
    }

    const calcPnL = (val: number) => {
      if (position === 'long') return (val - entryPrice!) * activePositionSize;
      if (position === 'short') return (entryPrice! - val) * activePositionSize;
      return 0;
    };

    const handleDrag = (event: OverlayEvent, type: string) => {
      const val = event.overlay.points[0]?.value;
      if (val === undefined) return false;
      const pnl = calcPnL(val);
      const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);

      chart.overrideOverlay({
        id: event.overlay.id,
        extendData: `${type}: ${val.toFixed(2)} (${pnlStr})`
      });
      return false;
    };

    if (!isDraggingRef.current) {
      if (takeProfit !== null) {
        const tpPnl = calcPnL(takeProfit);
        const tpPnlStr = tpPnl >= 0 ? `+${tpPnl.toFixed(2)}` : tpPnl.toFixed(2);
        const tpData = {
          id: 'tpLine_overlay',
          name: 'tpLine',
          extendData: `TP: ${takeProfit.toFixed(2)} (${tpPnlStr})`,
          points: [{ value: takeProfit }],
          onPressedMoving: (event: OverlayEvent) => {
            isDraggingRef.current = true;
            handleDrag(event, 'TP');
            return false;
          },
          onPressedMoveEnd: (event: OverlayEvent) => {
            isDraggingRef.current = false;
            const val = event.overlay.points[0]?.value;
            if (val !== undefined) setTakeProfit(val);
            return false;
          }
        };

        if (chart.getOverlayById('tpLine_overlay')) {
          chart.overrideOverlay(tpData);
        } else {
          chart.createOverlay(tpData);
        }
      } else {
        chart.removeOverlay({ id: 'tpLine_overlay' });
      }

      if (stopLoss !== null) {
        const slPnl = calcPnL(stopLoss);
        const slPnlStr = slPnl >= 0 ? `+${slPnl.toFixed(2)}` : slPnl.toFixed(2);
        const slData = {
          id: 'slLine_overlay',
          name: 'slLine',
          extendData: `SL: ${stopLoss.toFixed(2)} (${slPnlStr})`,
          points: [{ value: stopLoss }],
          onPressedMoving: (event: OverlayEvent) => {
            isDraggingRef.current = true;
            handleDrag(event, 'SL');
            return false;
          },
          onPressedMoveEnd: (event: OverlayEvent) => {
            isDraggingRef.current = false;
            const val = event.overlay.points[0]?.value;
            if (val !== undefined) setStopLoss(val);
            return false;
          }
        };

        if (chart.getOverlayById('slLine_overlay')) {
          chart.overrideOverlay(slData);
        } else {
          chart.createOverlay(slData);
        }
      } else {
        chart.removeOverlay({ id: 'slLine_overlay' });
      }
    }
  }, [chartRef, position, entryPrice, activePositionSize, takeProfit, stopLoss, setTakeProfit, setStopLoss]);

  // Trade-history markers. Re-sync ONLY when trades or visibility change — not
  // on every playback tick (unrealizedPnL / currentIndex). Markers are pinned
  // to a timestamp, so KLineCharts shows/hides them as the window scrolls
  // without us needing to recreate them each frame.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.removeOverlay({ groupId: 'trade_history_group' });
    if (showTradeHistory && tradeHistory.length > 0) {
      const dataList = chart.getDataList();
      tradeHistory.forEach(trade => {
        const timestamp = trade.time * 1000;
        const candle = findContainingCandle(dataList, timestamp);
        chart.createOverlay({
          id: `trade_${trade.id}`,
          name: 'tradeArrow',
          groupId: 'trade_history_group',
          extendData: {
            type: trade.type,
            high: candle?.high,
            low: candle?.low,
          },
          points: [{ timestamp, value: trade.price }]
        });
      });
    }
  }, [chartRef, tradeHistory, showTradeHistory]);
}
