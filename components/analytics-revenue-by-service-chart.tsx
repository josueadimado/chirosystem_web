"use client";

/**
 * Vertical bar chart showing revenue broken down by service for the current month.
 * Extracted as a standalone component so recharts can be dynamically imported
 * and excluded from the main analytics page bundle until it is needed.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_TEAL = "#0d9488";

function formatMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (Number.isNaN(n)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export interface RevenueByServiceItem {
  name: string;
  revenue: string;
  percentage: number;
}

export function AnalyticsRevenueByServiceChart({ data }: { data: RevenueByServiceItem[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No paid visit revenue recorded this month yet.</p>;
  }

  const chartData = data.map((s) => ({
    name: s.name.length > 28 ? `${s.name.slice(0, 26)}…` : s.name,
    revenue: parseFloat(s.revenue) || 0,
  }));

  return (
    <>
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11, fill: "#334155" }}
            />
            <Tooltip formatter={(v: number) => formatMoney(v)} />
            <Bar dataKey="revenue" name="Revenue" fill={CHART_TEAL} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        {data.map((s) => (
          <li
            key={s.name}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="font-medium text-slate-800">{s.name}</span>
            <span className="tabular-nums text-slate-600">
              {formatMoney(s.revenue)} · {s.percentage.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
