"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { categoryTrendSeries } from "@/lib/aggregate";
import { sgdCompact, monthShort, monthLabel } from "@/lib/format";
import { CHART, getCategoryColor, ChartTooltip } from "./theme";

const axis = { stroke: CHART.textDim, fontSize: 11, tickLine: false };

export default function CategoryTrendChart({ transactions, months }) {
  const { rows, categories } = categoryTrendSeries(transactions, months, 6);

  if (categories.length === 0) return null;

  return (
    <div className="card">
      <p className="label">Spending by category over time</p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={CHART.border} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
            <YAxis tickFormatter={sgdCompact} width={48} {...axis} />
            <Tooltip content={<ChartTooltip />} labelFormatter={monthLabel} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend wrapperStyle={{ fontSize: 11, color: CHART.textDim }} iconType="circle" iconSize={8} />
            {categories.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="spend"
                fill={getCategoryColor(cat)}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
