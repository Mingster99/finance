"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cashFlowSeries,
  findDuplicates,
  missingBalances,
  latestTransactionMonth,
} from "@/lib/aggregate";
import { useFinanceData } from "@/lib/useFinanceData";
import { sgd, monthLabel } from "@/lib/format";
import ToggleGroup from "./ToggleGroup";
import NetWorthChart from "./charts/NetWorthChart";
import CashFlowChart from "./charts/CashFlowChart";
import SpendingDonut from "./charts/SpendingDonut";
import SavingsRate from "./charts/SavingsRate";
import CategoryTrendChart from "./charts/CategoryTrendChart";
import MonthComparison from "./charts/MonthComparison";

const RANGES = [
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 12, label: "12M" },
  { value: 0, label: "All" },
];

export default function Dashboard() {
  const { data, loading, error, reload } = useFinanceData();
  const [range, setRange] = useState(6);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const transactions = data?.transactions;

  // Every month that has transactions, ascending. Drives the donut/comparison
  // navigation and the category-trend range.
  const txnMonths = useMemo(() => {
    if (!transactions) return [];
    return [...new Set(transactions.map((t) => t.month).filter(Boolean))].sort();
  }, [transactions]);

  // Default the selected month to the latest once data arrives.
  useEffect(() => {
    if (transactions && selectedMonth === null) {
      setSelectedMonth(latestTransactionMonth(transactions));
    }
  }, [transactions, selectedMonth]);

  if (loading) {
    return <p className="dim">Loading…</p>;
  }

  if (error) {
    return (
      <div className="banner banner-error">
        <strong>Could not load your data.</strong>
        <br />
        {error}
        <br />
        <br />
        <button className="btn btn-quiet" onClick={reload} style={{ fontSize: 13, padding: "8px 14px" }}>
          Try again
        </button>
      </div>
    );
  }

  const { balances, accounts } = data;

  const monthLimit = range || null;
  const trendMonths = monthLimit ? txnMonths.slice(-monthLimit) : txnMonths;
  const month = selectedMonth || latestTransactionMonth(transactions);

  const cashFlow = cashFlowSeries(transactions);
  const cashFlowMonth = cashFlow.find((m) => m.month === month);

  const duplicates = findDuplicates(transactions);
  const missing = missingBalances(balances, accounts);

  return (
    <>
      {duplicates.length > 0 && (
        <div className="banner banner-error">
          <strong>{duplicates.length} duplicate transaction{duplicates.length === 1 ? "" : "s"} detected.</strong>
          <br />
          A statement was probably imported twice. Duplicated IDs:{" "}
          {duplicates.slice(0, 5).map((d) => d.txn_id).join(", ")}
          {duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : ""}.
        </div>
      )}

      {missing.accounts.length > 0 && (
        <div className="banner banner-warning">
          <strong>No {monthLabel(missing.month)} balance for {missing.accounts.join(", ")}.</strong>
          <br />
          Net worth is carrying the last known figure forward for these accounts.
        </div>
      )}

      <div className="range-bar">
        <span className="label" style={{ margin: 0 }}>Range</span>
        <ToggleGroup options={RANGES} value={range} onChange={setRange} ariaLabel="Time range" />
      </div>

      <NetWorthChart balances={balances} accounts={accounts} monthLimit={monthLimit} />

      <SavingsRate cashFlowMonth={cashFlowMonth} month={month} />

      <CashFlowChart transactions={transactions} monthLimit={monthLimit} />

      <SpendingDonut
        transactions={transactions}
        month={month}
        months={txnMonths}
        onMonthChange={setSelectedMonth}
      />

      <CategoryTrendChart transactions={transactions} months={trendMonths} />

      <MonthComparison transactions={transactions} month={month} months={txnMonths} />

      <div className="card">
        <p className="label">Accounts</p>
        {accounts
          .filter((a) => a.active && a.include_in_net_worth)
          .map((account) => {
            const rows = balances
              .filter((b) => b.account_id === account.account_id)
              .sort((a, b) => a.month.localeCompare(b.month));
            const latest = rows[rows.length - 1];
            return (
              <div className="row" key={account.account_id}>
                <span>{account.display_name || account.account_id}</span>
                <span className={`numeric ${(latest?.balance_sgd ?? 0) < 0 ? "negative" : ""}`}>
                  {latest ? sgd(latest.balance_sgd) : "—"}
                </span>
              </div>
            );
          })}
      </div>

      <p className="dim" style={{ fontSize: 12, textAlign: "center", marginTop: 20 }}>
        {transactions.length} transactions · updated{" "}
        {new Date(data.fetchedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
      </p>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button className="btn btn-quiet" onClick={reload} style={{ fontSize: 13, padding: "10px 18px" }}>
          Refresh
        </button>
      </div>
    </>
  );
}
