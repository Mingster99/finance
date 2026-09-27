"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { netWorthSeries, netWorthSummary, netWorthByClass } from "@/lib/aggregate";
import { sgd, sgdCompact, monthShort, monthLabel } from "@/lib/format";
import { CHART, CATEGORY_PALETTE, ChartTooltip } from "./theme";
import ToggleGroup from "../ToggleGroup";

const VIEWS = [
  { value: "total", label: "Total" },
  { value: "accounts", label: "By account" },
  { value: "class", label: "Assets vs debt" },
];

const axis = { stroke: CHART.textDim, fontSize: 11, tickLine: false };

export default function NetWorthChart({ balances, accounts, monthLimit }) {
  const [view, setView] = useState("total");

  const summary = netWorthSummary(balances, accounts);
  const limit = (series) => (monthLimit ? series.slice(-monthLimit) : series);

  return (
    <div className="card">
      <div className="chart-head">
        <div>
          <p className="label">Net worth</p>
          <p className="figure numeric" style={{ fontSize: 50, lineHeight: 1 }}>
            {sgd(summary.current)}
          </p>
          {summary.change !== null && (
            <p className={`delta numeric ${summary.change >= 0 ? "positive" : "negative"}`}>
              {summary.change >= 0 ? "+" : "−"}
              {sgd(Math.abs(summary.change))} vs last month · as of {monthLabel(summary.month)}
            </p>
          )}
        </div>
      </div>

      <ToggleGroup options={VIEWS} value={view} onChange={setView} ariaLabel="Net worth view" />

      <div className="chart-body">
        {view === "total" && <TotalArea data={limit(netWorthSeries(balances, accounts))} />}
        {view === "accounts" && (
          <AccountsArea data={limit(netWorthSeries(balances, accounts))} accounts={accounts} />
        )}
        {view === "class" && <ClassArea data={limit(netWorthByClass(balances, accounts))} />}
      </div>
    </div>
  );
}

function TotalArea({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.positive} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.positive} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
        <YAxis tickFormatter={sgdCompact} width={48} {...axis} />
        <Tooltip content={<ChartTooltip />} labelFormatter={monthLabel} />
        <Area
          type="monotone"
          dataKey="total"
          name="Net worth"
          stroke={CHART.positive}
          strokeWidth={2.5}
          fill="url(#nwFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AccountsArea({ data, accounts }) {
  // Which account_ids actually appear in the (carried-forward) series.
  const ids = new Set();
  data.forEach((d) => Object.keys(d.byAccount || {}).forEach((id) => ids.add(id)));
  const nameById = Object.fromEntries(
    accounts.map((a) => [a.account_id, a.display_name || a.account_id])
  );
  const rows = data.map((d) => ({ month: d.month, ...d.byAccount }));
  const idList = [...ids];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={CHART.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
        <YAxis tickFormatter={sgdCompact} width={48} {...axis} />
        <Tooltip content={<ChartTooltip />} labelFormatter={monthLabel} />
        {idList.map((id, i) => (
          <Area
            key={id}
            type="monotone"
            dataKey={id}
            name={nameById[id] || id}
            stackId="nw"
            stroke={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
            fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
            fillOpacity={0.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ClassArea({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={CHART.border} vertical={false} />
        <XAxis dataKey="month" tickFormatter={monthShort} {...axis} />
        <YAxis tickFormatter={sgdCompact} width={48} {...axis} />
        <Tooltip content={<ChartTooltip />} labelFormatter={monthLabel} />
        <Area
          type="monotone"
          dataKey="assets"
          name="Assets"
          stroke={CHART.positive}
          fill={CHART.positive}
          fillOpacity={0.35}
        />
        <Area
          type="monotone"
          dataKey="liabilities"
          name="Debt"
          stroke={CHART.negative}
          fill={CHART.negative}
          fillOpacity={0.35}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
