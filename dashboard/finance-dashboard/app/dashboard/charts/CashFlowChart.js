"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { cashFlowSeries } from "@/lib/aggregate";
import { sgdCompact, monthShort, monthLabel } from "@/lib/format";
import { CHART, ChartTooltip } from "./theme";

const axis = { stroke: CHART.textDim, fontSize: 11, tickLine: false };

export default function CashFlowChart({ transactions, monthLimit }) {
  const series = cashFlowSeries(transactions);
  const data = monthLimit ? series.slice(-monthLimit) : series;

  return (
    <div className="card">
      <p className="label">Money in vs out</p>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={CHART.border} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
            <YAxis tickFormatter={sgdCompact} width={48} {...axis} />
            <Tooltip content={<ChartTooltip />} labelFormatter={monthLabel} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: CHART.textDim }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="income" name="In" fill={CHART.positive} radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenses" name="Out" fill={CHART.negative} radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={{ r: 2, fill: CHART.accent }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
