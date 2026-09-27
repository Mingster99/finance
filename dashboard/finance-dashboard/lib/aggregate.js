/**
 * All aggregation lives here so the numbers can be reasoned about in one
 * place. The single rule that matters: spending only ever sums rows where
 * type === "expense". Transfers, credit card payments and CPF moves are
 * real balance movements but they are not spending.
 */

const SPEND_TYPE = "expense";
const INCOME_TYPE = "income";
const REFUND_TYPE = "refund";
const FEE_TYPE = "fee";

/** Sorted list of every month present in a set of rows. */
function monthsIn(rows) {
  return [...new Set(rows.map((r) => r.month).filter(Boolean))].sort();
}

/**
 * Net worth per month, carrying the last known balance forward for any
 * account with no row that month. Without carry-forward, forgetting to
 * log one investment balance would look like the money vanished.
 */
export function netWorthSeries(balances, accounts) {
  const included = new Set(
    accounts.filter((a) => a.include_in_net_worth).map((a) => a.account_id)
  );

  const months = monthsIn(balances);
  const lastKnown = new Map();
  const series = [];

  for (const month of months) {
    for (const row of balances.filter((b) => b.month === month)) {
      lastKnown.set(row.account_id, row.balance_sgd);
    }

    let total = 0;
    const byAccount = {};
    for (const [accountId, value] of lastKnown) {
      if (!included.has(accountId)) continue;
      byAccount[accountId] = value;
      total += value;
    }

    series.push({ month, total, byAccount });
  }

  return series;
}

/**
 * Net worth split into assets (non-liability accounts) and liabilities
 * (accounts flagged is_liability, stored as negative balances) per month.
 * Same carry-forward rule as netWorthSeries. `liabilities` is returned as a
 * positive magnitude so a stacked/paired chart doesn't need to flip signs;
 * `total` stays assets − liabilities.
 */
export function netWorthByClass(balances, accounts) {
  const included = new Set(
    accounts.filter((a) => a.include_in_net_worth).map((a) => a.account_id)
  );
  const liabilityIds = new Set(
    accounts.filter((a) => a.is_liability).map((a) => a.account_id)
  );

  const months = monthsIn(balances);
  const lastKnown = new Map();
  const series = [];

  for (const month of months) {
    for (const row of balances.filter((b) => b.month === month)) {
      lastKnown.set(row.account_id, row.balance_sgd);
    }

    let assets = 0;
    let liabilities = 0;
    for (const [accountId, value] of lastKnown) {
      if (!included.has(accountId)) continue;
      if (liabilityIds.has(accountId)) {
        liabilities += Math.abs(value);
      } else {
        assets += value;
      }
    }

    series.push({ month, assets, liabilities, total: assets - liabilities });
  }

  return series;
}

/** Current net worth plus the change from the previous month. */
export function netWorthSummary(balances, accounts) {
  const series = netWorthSeries(balances, accounts);
  if (series.length === 0) return { current: 0, previous: null, change: null, month: null };

  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;

  return {
    current: latest.total,
    previous: previous ? previous.total : null,
    change: previous ? latest.total - previous.total : null,
    month: latest.month,
  };
}

/**
 * Income and expenses per month. Expenses are returned as a positive
 * number so charts don't need to flip signs.
 */
export function cashFlowSeries(transactions) {
  const byMonth = new Map();

  for (const row of transactions) {
    if (!row.month) continue;

    if (!byMonth.has(row.month)) {
      byMonth.set(row.month, { month: row.month, income: 0, expenses: 0, net: 0 });
    }
    const bucket = byMonth.get(row.month);

    if (row.type === INCOME_TYPE) {
      bucket.income += row.amount_sgd;
    } else if (row.type === SPEND_TYPE || row.type === FEE_TYPE) {
      bucket.expenses += Math.abs(row.amount_sgd);
    } else if (row.type === REFUND_TYPE) {
      // A refund reduces spending rather than counting as income.
      bucket.expenses -= Math.abs(row.amount_sgd);
    }
  }

  return [...byMonth.values()]
    .map((b) => ({ ...b, net: b.income - b.expenses }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Spending grouped by category for one month, largest first.
 * Refunds are netted off their own category so these totals always sum to
 * the same figure as cashFlowSeries().expenses for the month.
 */
export function categoryTotals(transactions, month) {
  const totals = new Map();

  for (const row of transactions) {
    if (row.month !== month) continue;

    const category = row.category || "Uncategorised";
    const current = totals.get(category) || 0;

    if (row.type === SPEND_TYPE || row.type === FEE_TYPE) {
      totals.set(category, current + Math.abs(row.amount_sgd));
    } else if (row.type === REFUND_TYPE) {
      totals.set(category, current - Math.abs(row.amount_sgd));
    }
  }

  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .filter((entry) => entry.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Savings rate for one cashFlowSeries bucket: the share of income kept.
 * Returns null when there's no income (a rate is meaningless then), so the UI
 * can show "—" rather than a misleading 0% or a divide-by-zero.
 */
export function savingsRate(cashFlowMonth) {
  if (!cashFlowMonth || !cashFlowMonth.income) return null;
  return cashFlowMonth.net / cashFlowMonth.income;
}

/**
 * Spend per category across several months, keeping the top N categories
 * (by total spend over the range) and folding everything else into "Other".
 * Each returned row is chart-ready for a stacked bar: { month, <cat>: n, ... }.
 * Uses the same expense/fee/refund rule as categoryTotals.
 */
export function categoryTrendSeries(transactions, months, topN = 6) {
  const monthSet = new Set(months);

  // First pass: total per category over the whole range, to pick the top N.
  const overall = new Map();
  const perMonth = new Map(months.map((m) => [m, new Map()]));

  for (const row of transactions) {
    if (!monthSet.has(row.month)) continue;

    let delta = 0;
    if (row.type === SPEND_TYPE || row.type === FEE_TYPE) {
      delta = Math.abs(row.amount_sgd);
    } else if (row.type === REFUND_TYPE) {
      delta = -Math.abs(row.amount_sgd);
    } else {
      continue;
    }

    const category = row.category || "Uncategorised";
    overall.set(category, (overall.get(category) || 0) + delta);
    const bucket = perMonth.get(row.month);
    bucket.set(category, (bucket.get(category) || 0) + delta);
  }

  const topCategories = [...overall.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([category]) => category);
  const topSet = new Set(topCategories);

  const rows = months.map((month) => {
    const bucket = perMonth.get(month) || new Map();
    const row = { month };
    let other = 0;
    for (const cat of topCategories) row[cat] = 0;
    for (const [category, total] of bucket) {
      if (topSet.has(category)) {
        row[category] = Math.max(0, total);
      } else if (total > 0) {
        other += total;
      }
    }
    if (other > 0) row.Other = other;
    return row;
  });

  const keys = other_present(rows) ? [...topCategories, "Other"] : topCategories;
  return { rows, categories: keys };
}

function other_present(rows) {
  return rows.some((r) => (r.Other || 0) > 0);
}

/**
 * Duplicate txn_ids, which mean a statement was imported twice.
 * Surfaced to the user, never silently removed.
 */
export function findDuplicates(transactions) {
  const counts = new Map();

  for (const row of transactions) {
    const id = row.txn_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([txn_id, count]) => ({ txn_id, count }));
}

/**
 * Accounts in net worth that have no balance row for the latest month.
 * Catches the "forgot to log Moomoo this month" case.
 */
export function missingBalances(balances, accounts) {
  const months = monthsIn(balances);
  if (months.length === 0) return { month: null, accounts: [] };

  const latestMonth = months[months.length - 1];
  const logged = new Set(
    balances.filter((b) => b.month === latestMonth).map((b) => b.account_id)
  );

  const missing = accounts
    .filter((a) => a.active && a.include_in_net_worth && !logged.has(a.account_id))
    .map((a) => a.display_name || a.account_id);

  return { month: latestMonth, accounts: missing };
}

/** Rows the skill wasn't confident about, newest first. */
export function lowConfidenceRows(transactions, limit = 50) {
  return transactions
    .filter((row) => String(row.confidence).toLowerCase() === "low")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

/** The most recent month that has any transactions. */
export function latestTransactionMonth(transactions) {
  const months = monthsIn(transactions);
  return months.length ? months[months.length - 1] : null;
}
