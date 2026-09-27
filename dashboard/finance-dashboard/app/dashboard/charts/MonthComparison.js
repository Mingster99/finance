"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { categoryTotals } from "@/lib/aggregate";
import { sgdCompact, monthLabel } from "@/lib/format";
import { CHART, ChartTooltip } from "./theme";

const axis = { stroke: CHART.textDim, fontSize: 11, tickLine: false };

export default function MonthComparison({ transactions, month, months }) {
  const idx = months.indexOf(month);
  const prevMonth = idx > 0 ? months[idx - 1] : null;

  if (!prevMonth) return null;

  const current = new Map(categoryTotals(transactions, month).map((c) => [c.category, c.total]));
  const previous = new Map(categoryTotals(transactions, prevMonth).map((c) => [c.category, c.total]));

  const categories = [...new Set([...current.keys(), ...previous.keys()])];
  const rows = categories
    .map((category) => ({
      category,
      current: Math.max(0, current.get(category) || 0),
      previous: Math.max(0, previous.get(category) || 0),
    }))
    .filter((r) => r.current > 0 || r.previous > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 6);

  if (rows.length === 0) return null;

  return (
    <div className="card">
      <p className="label">
        {monthLabel(month)} vs {monthLabel(prevMonth)}
      </p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 46)}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
            barGap={2}
          >
            <XAxis type="number" tickFormatter={sgdCompact} {...axis} />
            <YAxis
              type="category"
              dataKey="category"
              width={92}
              tick={{ fill: CHART.textDim, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend wrapperStyle={{ fontSize: 11, color: CHART.textDim }} iconType="circle" iconSize={8} />
            <Bar dataKey="previous" name={monthLabel(prevMonth)} fill={CHART.textDim} radius={[0, 3, 3, 0]} maxBarSize={14} />
            <Bar dataKey="current" name={monthLabel(month)} fill={CHART.accent} radius={[0, 3, 3, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
