import { google } from "googleapis";

/**
 * Ranges match the schema in the PRD. Column letters are fixed — if you
 * add a column to the sheet, widen the range here too.
 */
const RANGES = {
  transactions: "transactions!A:P",
  balances: "balances!A:E",
  accounts: "accounts!A:G",
  categories: "categories!A:D",
};

function serviceAccountCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!encoded) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set");
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not valid base64-encoded JSON"
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account key is missing client_email or private_key");
  }

  return parsed;
}

function sheetsClient() {
  const creds = serviceAccountCredentials();

  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth: jwt });
}

/**
 * Turn a 2D array of cells into objects keyed by the header row.
 * Blank rows are dropped; trailing empty cells are tolerated.
 */
function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];

  const [header, ...body] = rows;
  const keys = header.map((h) => String(h ?? "").trim());

  return body
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const obj = {};
      keys.forEach((key, i) => {
        if (key) obj[key] = row[i] ?? "";
      });
      return obj;
    });
}

/** Coerce a sheet cell to a number. Returns 0 for anything unparseable. */
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Sheets checkboxes and TRUE/FALSE text both land here. */
function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().toUpperCase() === "TRUE";
}

/**
 * Normalise a month cell to "YYYY-MM". The parser emits it as text, but if the
 * cell gets typed as a date in the sheet, UNFORMATTED_VALUE hands back a serial
 * number (days since 1899-12-30) instead — which would otherwise reach the UI
 * as an unparseable string and render as "Invalid Date". Also tolerates a full
 * date string like "2026-07-01".
 */
function toMonth(value) {
  if (value === null || value === undefined || value === "") return "";

  // Google Sheets date serial → the first of that month, in UTC.
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(Math.round((value - 25569) * 86400000));
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  }

  const text = String(value).trim();
  const ym = text.match(/^(\d{4})-(\d{2})/); // "2026-07" or "2026-07-01"
  if (ym) return `${ym[1]}-${ym[2]}`;

  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  return text;
}

/**
 * Which spreadsheet a given user reads. `SHEET_MAP` is a JSON object of
 * `{ "email": "sheetId" }`; `SHEET_ID` is the fallback for anyone unmapped,
 * which keeps the original single-sheet setup working. The email always comes
 * from the authenticated session (never user input), so a user can only ever
 * be routed to their own sheet. Each mapped sheet must be shared with the
 * service account for reads to succeed.
 */
export function sheetIdForEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();

  const raw = process.env.SHEET_MAP;
  if (raw) {
    try {
      const map = JSON.parse(raw);
      for (const [key, value] of Object.entries(map)) {
        if (key.trim().toLowerCase() === normalized && value) return value;
      }
    } catch {
      // A malformed SHEET_MAP falls through to the single-sheet SHEET_ID.
    }
  }

  return process.env.SHEET_ID || null;
}

/**
 * Reads all four tabs in a single API call and normalises types.
 * Everything downstream can assume numbers are numbers.
 */
export async function fetchSheetData(spreadsheetId) {
  if (!spreadsheetId) throw new Error("No spreadsheet id provided");

  const sheets = sheetsClient();

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: Object.values(RANGES),
    // Without this, amounts arrive as "$1,234.56" strings.
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const [transactions, balances, accounts, categories] = (
    response.data.valueRanges || []
  ).map((range) => rowsToObjects(range.values));

  return {
    transactions: (transactions || []).map((row) => ({
      ...row,
      amount_sgd: toNumber(row.amount_sgd),
      amount: toNumber(row.amount),
      date: String(row.date ?? ""),
      month: toMonth(row.month),
    })),
    balances: (balances || []).map((row) => ({
      ...row,
      balance_sgd: toNumber(row.balance_sgd),
      month: toMonth(row.month),
    })),
    accounts: (accounts || []).map((row) => ({
      ...row,
      is_liability: toBoolean(row.is_liability),
      include_in_net_worth: toBoolean(row.include_in_net_worth),
      active: toBoolean(row.active),
    })),
    categories: (categories || []).map((row) => ({
      ...row,
      sort_order: toNumber(row.sort_order),
    })),
  };
}
