"use client";

import { useMemo, useState } from "react";
import { useFinanceData } from "@/lib/useFinanceData";
import { sgd, dateLabel, monthLabel, parseTxnDate } from "@/lib/format";

const SORTS = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "amount-desc", label: "Largest amount" },
  { value: "amount-asc", label: "Smallest amount" },
];

const TYPE_LABELS = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
  fee: "Fee",
};

const UNCATEGORISED = "__uncat__";

export default function TransactionsView() {
  const { data, loading, error, reload } = useFinanceData();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [month, setMonth] = useState("all");
  const [account, setAccount] = useState("all");
  const [sort, setSort] = useState("date-desc");

  const transactions = data?.transactions;

  // account_id -> display name, for the account filter and (optionally) rows.
  const accountName = useMemo(() => {
    const map = {};
    (data?.accounts || []).forEach((a) => {
      map[a.account_id] = a.display_name || a.account_id;
    });
    return map;
  }, [data]);

  // Distinct filter options, derived from the data actually present.
  const options = useMemo(() => {
    const txns = transactions || [];
    return {
      types: [...new Set(txns.map((t) => t.type).filter(Boolean))].sort(),
      cats: [...new Set(txns.map((t) => t.category).filter(Boolean))].sort(),
      months: [...new Set(txns.map((t) => t.month).filter(Boolean))].sort().reverse(),
      accounts: [...new Set(txns.map((t) => t.account_id).filter(Boolean))].sort(),
      hasUncategorised: txns.some((t) => !t.category),
    };
  }, [transactions]);

  const filtered = useMemo(() => {
    let rows = transactions || [];
    const q = search.trim().toLowerCase();

    if (q) {
      rows = rows.filter(
        (t) =>
          (t.merchant || "").toLowerCase().includes(q) ||
          (t.description_raw || "").toLowerCase().includes(q)
      );
    }
    if (type !== "all") rows = rows.filter((t) => t.type === type);
    if (category === UNCATEGORISED) rows = rows.filter((t) => !t.category);
    else if (category !== "all") rows = rows.filter((t) => t.category === category);
    if (month !== "all") rows = rows.filter((t) => t.month === month);
    if (account !== "all") rows = rows.filter((t) => t.account_id === account);

    const ts = (t) => {
      const v = parseTxnDate(t.date);
      return Number.isNaN(v) ? -Infinity : v;
    };
    const sorted = [...rows];
    switch (sort) {
      case "date-asc":
        sorted.sort((a, b) => ts(a) - ts(b));
        break;
      case "amount-desc":
        sorted.sort((a, b) => Math.abs(b.amount_sgd) - Math.abs(a.amount_sgd));
        break;
      case "amount-asc":
        sorted.sort((a, b) => Math.abs(a.amount_sgd) - Math.abs(b.amount_sgd));
        break;
      default:
        sorted.sort((a, b) => ts(b) - ts(a));
    }
    return sorted;
  }, [transactions, search, type, category, month, account, sort]);

  const net = useMemo(
    () => filtered.reduce((sum, t) => sum + (t.amount_sgd || 0), 0),
    [filtered]
  );

  if (loading) return <p className="dim">Loading…</p>;

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

  return (
    <>
      <div className="filter-bar">
        <input
          className="search-input"
          type="search"
          placeholder="Search merchant or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
        />

        <div className="filter-row">
          <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="all">All types</option>
            {options.types.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>

          <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {options.cats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {options.hasUncategorised && <option value={UNCATEGORISED}>Uncategorised</option>}
          </select>

          <select className="filter-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="all">All months</option>
            {options.months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>

          <select className="filter-select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="all">All accounts</option>
            {options.accounts.map((a) => (
              <option key={a} value={a}>{accountName[a] || a}</option>
            ))}
          </select>

          <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <p className="filter-summary">
          {filtered.length} transaction{filtered.length === 1 ? "" : "s"} · net{" "}
          <span className={net >= 0 ? "positive" : "negative"}>{sgd(net)}</span>
        </p>
      </div>

      <div className="txn-list">
        {filtered.length === 0 && (
          <p className="dim" style={{ textAlign: "center", padding: "40px 0" }}>
            No transactions match these filters.
          </p>
        )}

        {filtered.map((t, i) => (
          <div className="txn-row" key={t.txn_id || `${t.date}-${t.merchant}-${t.amount_sgd}-${i}`}>
            <div className="txn-top">
              <span className="txn-merchant">{t.merchant || t.description_raw || "—"}</span>
              <span className={`txn-amount numeric ${t.amount_sgd < 0 ? "negative" : "positive"}`}>
                {sgd(t.amount_sgd)}
              </span>
            </div>
            <div className="txn-meta">
              <span>{dateLabel(t.date)}</span>
              <span className="dot">·</span>
              <span>{t.category || "Uncategorised"}</span>
              <span className="dot">·</span>
              <span className="type-chip">{TYPE_LABELS[t.type] || t.type}</span>
            </div>
            {t.description_raw && <div className="txn-desc">{t.description_raw}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
