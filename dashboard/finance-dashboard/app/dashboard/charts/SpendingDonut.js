"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { categoryTotals } from "@/lib/aggregate";
import { sgd, monthLabel } from "@/lib/format";
import { CHART, assignColors, ChartTooltip } from "./theme";

const TOP_N = 6;

export default function SpendingDonut({ transactions, month, months, onMonthChange }) {
  const all = categoryTotals(transactions, month).filter((c) => c.total > 0);

  const top = all.slice(0, TOP_N);
  const rest = all.slice(TOP_N);
  const otherTotal = rest.reduce((sum, c) => sum + c.total, 0);
  const slices = assignColors(
    otherTotal > 0 ? [...top, { category: "Other", total: otherTotal }] : top
  );
  const total = all.reduce((sum, c) => sum + c.total, 0);

  const idx = months.indexOf(month);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < months.length - 1;

  return (
    <div className="card">
      <div className="chart-head">
        <p className="label">Where it went</p>
        <div className="month-nav">
          <button
            type="button"
            className="month-arrow"
            disabled={!canPrev}
            onClick={() => canPrev && onMonthChange(months[idx - 1])}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="month-nav-label">{monthLabel(month)}</span>
          <button
            type="button"
            className="month-arrow"
            disabled={!canNext}
            onClick={() => canNext && onMonthChange(months[idx + 1])}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="dim" style={{ fontSize: 14, margin: "12px 0 0" }}>
          No spending recorded.
        </p>
      ) : (
        <>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="total"
                  nameKey="category"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {slices.map((s) => (
                    <Cell key={s.category} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <span className="dim" style={{ fontSize: 11 }}>Total</span>
              <span className="numeric" style={{ fontSize: 18, fontWeight: 600 }}>{sgd(total)}</span>
            </div>
          </div>

          <div className="donut-legend">
            {slices.map((s) => (
              <div className="row" key={s.category}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="legend-dot" style={{ background: s.color }} />
                  {s.category}
                  <span className="dim" style={{ fontSize: 12 }}>
                    {total ? Math.round((s.total / total) * 100) : 0}%
                  </span>
                </span>
                <span className="numeric">{sgd(s.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
