/**
 * Shared formatters. Kept in one place so charts, tooltips and the summary
 * cards all render money and months identically.
 */

/** SGD with no cents — the granularity that matters at a glance. */
export const sgd = (value) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

/** Compact SGD for dense chart axes, e.g. "S$1.2k", "S$34k". */
export const sgdCompact = (value) => {
  const n = value ?? 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}S$${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${sign}S$${Math.round(abs)}`;
};

/**
 * Parse a month value to a Date at the first of that month, or null.
 * Accepts "YYYY-MM" as well as a Google Sheets date serial (a plain number or
 * numeric string like 46204) in case the sheet stored the cell as a date.
 */
const parseMonth = (month) => {
  if (month === null || month === undefined || month === "") return null;

  // Date serial: 5–6 digit number (real month keys always contain a dash).
  if (typeof month === "number" || /^\d{5,6}$/.test(String(month))) {
    const serial = Number(month);
    if (Number.isFinite(serial)) {
      const utc = new Date(Math.round((serial - 25569) * 86400000));
      if (Number.isNaN(utc.getTime())) return null;
      // Rebuild in local time so the month label can't slip across a TZ offset.
      return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), 1);
    }
  }

  const [year, m] = String(month).split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "2025-03" -> "March 2025". Falls back to the raw value if unparseable. */
export const monthLabel = (month) => {
  const date = parseMonth(month);
  if (!date) return month ? String(month) : "—";
  return date.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
};

/**
 * Parse a transaction date to a UTC timestamp (ms) for sorting, or NaN.
 * The sheet returns dates as Singapore day-first "D/M/YY" (e.g. "4/5/26" =
 * 4 May 2026), which must NOT be string-sorted — "9/9/26" would sort after
 * "26/9/26". Also tolerates ISO "YYYY-MM-DD" in case the source changes.
 */
export const parseTxnDate = (value) => {
  if (!value) return NaN;
  const s = String(value).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // day-first D/M/YY(YY)
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
};

/** "4/5/26" or "2026-05-04" -> "4 May 2026". */
export const dateLabel = (value) => {
  const t = parseTxnDate(value);
  if (Number.isNaN(t)) return value ? String(value) : "";
  return new Date(t).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** "2025-03" -> "Mar" — short label for chart axes. */
export const monthShort = (month) => {
  const date = parseMonth(month);
  if (!date) return month ? String(month) : "";
  return date.toLocaleDateString("en-SG", { month: "short" });
};
