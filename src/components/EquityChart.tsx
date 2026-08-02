import { useMemo, useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts';
import { useTradeStore } from '../store/useTradeStore';
import { useBacktestStore } from '../store/useBacktestStore';
import { buildEquitySeries } from '../lib/equity';

const fmtTime = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Recharts is slow at very large point counts, and this chart re-renders every
// playback tick. Cap the rendered points with stride sampling (always keeping
// the latest point) so render cost stays bounded regardless of dataset size.
const MAX_RENDER_POINTS = 1000;
function downsample<T>(points: T[]): T[] {
  if (points.length <= MAX_RENDER_POINTS) return points;
  const step = Math.ceil(points.length / MAX_RENDER_POINTS);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function EquityChart() {
  const rawData = useBacktestStore(state => state.rawData);
  const currentIndex = useBacktestStore(state => state.currentIndex);

  const tradeHistory = useTradeStore(state => state.tradeHistory);
  const initialBalance = useTradeStore(state => state.initialBalance);
  const contractSize = useTradeStore(state => state.contractSize);

  const fullSeries = useMemo(
    () => buildEquitySeries(rawData, tradeHistory, initialBalance, contractSize),
    [rawData, tradeHistory, initialBalance, contractSize],
  );

  // Throttle the rendered playback index to ~1s. Recharts re-rendering the
  // (downsampled) curve every playback tick is wasteful; once per second is
  // plenty for a fund curve and keeps playback smooth.
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const [renderIndex, setRenderIndex] = useState(currentIndex);
  const lastRenderRef = useRef(0);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastRenderRef.current;
    if (elapsed >= 1000) {
      lastRenderRef.current = now;
      setRenderIndex(currentIndexRef.current);
    } else if (!throttleTimer.current) {
      throttleTimer.current = setTimeout(() => {
        lastRenderRef.current = Date.now();
        throttleTimer.current = null;
        setRenderIndex(currentIndexRef.current);
      }, 1000 - elapsed);
    }
  }, [currentIndex]);

  useEffect(() => () => {
    if (throttleTimer.current) clearTimeout(throttleTimer.current);
  }, []);

  // Only reveal the curve up to the (throttled) playback index (mirrors the
  // chart), then downsample so recharts never renders more than
  // MAX_RENDER_POINTS.
  const visibleCount = Math.max(0, Math.min(renderIndex + 1, fullSeries.length));
  const data = downsample(fullSeries.slice(0, visibleCount));

  const currentTime = renderIndex >= 0 && renderIndex < rawData.length
    ? rawData[renderIndex].time
    : undefined;

  const currentEquity = data.length > 0 ? data[data.length - 1].equity : initialBalance;
  const isUp = currentEquity >= initialBalance;
  const stroke = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="w-full flex flex-col bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-slate-400 border-b border-dark-800">
        <span className="font-medium">Equity Curve</span>
        <span style={{ color: stroke }}>
          ${currentEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-32">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={fmtTime}
                tick={{ fill: '#64748b', fontSize: 10 }}
                minTickGap={60}
                stroke="#334155"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
                tick={{ fill: '#64748b', fontSize: 10 }}
                width={64}
                stroke="#334155"
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(label) => fmtTime(Number(label))}
                formatter={(value) => [`$${Number(value as number).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 'Equity']}
              />
              {currentTime !== undefined && (
                <ReferenceLine x={currentTime} stroke="#f59e0b" strokeDasharray="3 3" />
              )}
              <Area
                type="monotone"
                dataKey="equity"
                stroke={stroke}
                strokeWidth={1.5}
                fill="url(#equityFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
            No data
          </div>
        )}
      </div>
    </div>
  );
}
