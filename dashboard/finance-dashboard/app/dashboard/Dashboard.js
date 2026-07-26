"use client";

import { useEffect, useState } from "react";
import {
  netWorthSummary,
  cashFlowSeries,
  categoryTotals,
  findDuplicates,
  missingBalances,
  latestTransactionMonth,
} from "@/lib/aggregate";

const sgd = (value) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

const monthLabel = (month) => {
  if (!month) return "—";
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/data");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Request failed");
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
        <button className="btn btn-quiet" onClick={load} style={{ fontSize: 13, padding: "8px 14px" }}>
          Try again
        </button>
      </div>
    );
  }

  const { transactions, balances, accounts } = data;

  const netWorth = netWorthSummary(balances, accounts);
  const cashFlow = cashFlowSeries(transactions);
  const currentMonth = latestTransactionMonth(transactions);
  const thisMonth = cashFlow.find((m) => m.month === currentMonth);
  const categories = categoryTotals(transactions, currentMonth).slice(0, 5);
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

      <div className="card">
        <p className="label">Net worth</p>
        <p className="figure numeric">{sgd(netWorth.current)}</p>
        {netWorth.change !== null && (
          <p className={`delta numeric ${netWorth.change >= 0 ? "positive" : "negative"}`}>
            {netWorth.change >= 0 ? "+" : "−"}
            {sgd(Math.abs(netWorth.change)).replace("S$", "S$")} vs last month
          </p>
        )}
        <p className="delta dim">As of {monthLabel(netWorth.month)}</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <p className="label">In</p>
          <p className="figure numeric positive" style={{ fontSize: 22 }}>
            {sgd(thisMonth?.income ?? 0)}
          </p>
        </div>
        <div className="card">
          <p className="label">Out</p>
          <p className="figure numeric negative" style={{ fontSize: 22 }}>
            {sgd(thisMonth?.expenses ?? 0)}
          </p>
        </div>
      </div>

      <div className="card">
        <p className="label">Net this month · {monthLabel(currentMonth)}</p>
        <p
          className={`figure numeric ${(thisMonth?.net ?? 0) >= 0 ? "positive" : "negative"}`}
          style={{ fontSize: 24 }}
        >
          {sgd(thisMonth?.net ?? 0)}
        </p>
      </div>

      <div className="card">
        <p className="label">Top categories · {monthLabel(currentMonth)}</p>
        {categories.length === 0 && <p className="dim" style={{ fontSize: 14, margin: 0 }}>No spending recorded.</p>}
        {categories.map((c) => (
          <div className="row" key={c.category}>
            <span>{c.category}</span>
            <span className="numeric">{sgd(c.total)}</span>
          </div>
        ))}
      </div>

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

      <div className="card">
        <p className="label">Cash flow · last 6 months</p>
        {cashFlow.slice(-6).reverse().map((m) => (
          <div className="row" key={m.month}>
            <span>{monthLabel(m.month)}</span>
            <span className={`numeric ${m.net >= 0 ? "positive" : "negative"}`}>{sgd(m.net)}</span>
          </div>
        ))}
      </div>

      <p className="dim" style={{ fontSize: 12, textAlign: "center", marginTop: 20 }}>
        {transactions.length} transactions · updated{" "}
        {new Date(data.fetchedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
      </p>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button className="btn btn-quiet" onClick={load} style={{ fontSize: 13, padding: "10px 18px" }}>
          Refresh
        </button>
      </div>
    </>
  );
}
