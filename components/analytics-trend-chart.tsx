"use client";

import { HelpTip } from "@/components/help-tip";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendChartSeries = {
  dataKey: string;
  name: string;
  color: string;
};

export type TrendPeriodOption = {
  value: number;
  label: string;
};

type AnalyticsTrendChartProps = {
  title: string;
  help: React.ReactNode;
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TrendChartSeries[];
  periodLabel?: string;
  periodValue: number;
  periodOptions: TrendPeriodOption[];
  onPeriodChange: (value: number) => void;
  valueFormatter?: (value: number) => string;
  yTickFormatter?: (value: number) => string;
  /** Compact line chart height (default 200px). */
  height?: number;
  panelClassName?: string;
  loading?: boolean;
};

export function AnalyticsTrendChart({
  title,
  help,
  data,
  xKey,
  series,
  periodLabel = "Period",
  periodValue,
  periodOptions,
  onPeriodChange,
  valueFormatter,
  yTickFormatter,
  height = 200,
  panelClassName = "admin-panel",
  loading = false,
}: AnalyticsTrendChartProps) {
  const formatVal = valueFormatter ?? ((v: number) => String(v));

  return (
    <section className={cn(panelClassName, "relative")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold leading-snug text-foreground">{title}</h3>
          <HelpTip label={title} align="center">
            {help}
          </HelpTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{periodLabel}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPeriodChange(opt.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  periodValue === opt.value
                    ? "bg-white text-[#0d5c2e] shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:bg-white/60",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative w-full min-w-0" style={{ height }}>
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 text-sm text-slate-500">
            Updating chart…
          </div>
        ) : null}
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No data for this period yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (Number.isNaN(n)) return "";
                  if (yTickFormatter) return yTickFormatter(n);
                  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
                  return String(n);
                }}
              />
              <Tooltip
                formatter={(value: number) => formatVal(value)}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {series.map((s) => (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
