'use client';

import { useLocale } from 'next-intl';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface FollowerSeries {
  readonly id: string;
  /** Legend and tooltip label, e.g. "YouTube @asha". */
  readonly label: string;
  readonly platform: 'YOUTUBE' | 'INSTAGRAM';
  readonly points: readonly { readonly day: string; readonly followers: number }[];
}

// Colour follows the platform, never its position (validated pair, dataviz reference slots 1–2).
const PLATFORM_COLORS = { YOUTUBE: '#2a78d6', INSTAGRAM: '#eb6834' } as const;
const INK_MUTED = '#898781';
const GRIDLINE = '#e1e0d9';

/** UC-C7: followers per day, one 2px line per account, one shared axis, with hover tooltip. */
export function FollowersChart({ series }: { series: readonly FollowerSeries[] }) {
  const locale = useLocale();
  const numberFormat = new Intl.NumberFormat(`${locale}-IN`, { notation: 'compact' });
  const days = [
    ...new Set(series.flatMap((entry) => entry.points.map((point) => point.day))),
  ].sort();
  const rows = days.map((day) => ({
    day,
    ...Object.fromEntries(
      series.map((entry) => [
        entry.id,
        entry.points.find((point) => point.day === day)?.followers ?? null,
      ]),
    ),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRIDLINE} vertical={false} />
          <XAxis dataKey="day" tick={{ fill: INK_MUTED, fontSize: 12 }} minTickGap={32} />
          <YAxis
            tick={{ fill: INK_MUTED, fontSize: 12 }}
            tickFormatter={(value: number) => numberFormat.format(value)}
            width={56}
          />
          <Tooltip formatter={(value) => numberFormat.format(Number(value))} />
          {series.length > 1 ? <Legend /> : null}
          {series.map((entry) => (
            <Line
              key={entry.id}
              type="monotone"
              dataKey={entry.id}
              name={entry.label}
              stroke={PLATFORM_COLORS[entry.platform]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
