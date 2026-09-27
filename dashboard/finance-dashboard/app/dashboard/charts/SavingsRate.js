"use client";

import { savingsRate } from "@/lib/aggregate";
import { sgd, monthLabel } from "@/lib/format";

/**
 * Savings-rate KPI for one month. A simple money-in bar with the spent portion
 * filled, so the leftover (what you kept) reads at a glance. Handles a negative
 * rate — spending more than you earned — by capping the fill and going red.
 */
export default function SavingsRate({ cashFlowMonth, month }) {
  const rate = savingsRate(cashFlowMonth);
  const income = cashFlowMonth?.income ?? 0;
  const expenses = cashFlowMonth?.expenses ?? 0;
  const net = cashFlowMonth?.net ?? 0;
  const overspent = net < 0;

  const spentPct = income > 0 ? Math.min(100, (expenses / income) * 100) : 0;
  const pctLabel = rate === null ? "—" : `${Math.round(rate * 100)}%`;

  return (
    <div className="card">
      <div className="chart-head">
        <p className="label">Savings rate · {monthLabel(month)}</p>
        <p
          className={`figure numeric ${overspent ? "negative" : "positive"}`}
          style={{ fontSize: 34, margin: 0 }}
        >
          {pctLabel}
        </p>
      </div>

      <div className="savings-track" role="img" aria-label={`Spent ${Math.round(spentPct)}% of income`}>
        <div
          className="savings-fill"
          style={{
            width: `${spentPct}%`,
            background: overspent ? "var(--negative)" : "var(--warning)",
          }}
        />
      </div>

      <div className="savings-legend">
        <span className="dim">In {sgd(income)}</span>
        <span className="dim">Out {sgd(expenses)}</span>
        <span className={net >= 0 ? "positive" : "negative"}>
          {net >= 0 ? "Kept " : "Over "}
          {sgd(Math.abs(net))}
        </span>
      </div>
    </div>
  );
}
