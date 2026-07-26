"""
CSV output in the exact column order the Google Sheet expects.

Human columns first (A-G), machine columns after (H-P). Do not reorder — the
sheet import and the dashboard both depend on this.
"""

import csv
import io

TRANSACTION_COLUMNS = [
    # Human columns
    "txn_id", "date", "merchant", "amount_sgd", "category", "type", "notes",
    # Machine columns
    "account_id", "month", "posted_date", "currency", "amount",
    "description_raw", "transfer_pair_id", "confidence", "source_file",
]

BALANCE_COLUMNS = ["month", "account_id", "balance_sgd", "source", "as_of"]


def _money(value):
    """Two decimal places, or blank. Never scientific notation."""
    if value is None or value == "":
        return ""
    return f"{float(value):.2f}"


def transactions_csv(rows):
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=TRANSACTION_COLUMNS, extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()

    for row in sorted(rows, key=lambda r: (r.get("date") or "", r.get("txn_id") or "")):
        record = {column: row.get(column, "") for column in TRANSACTION_COLUMNS}
        record["amount_sgd"] = _money(row.get("amount_sgd"))
        record["amount"] = _money(row.get("amount"))
        writer.writerow(record)

    return buffer.getvalue()


def balances_csv(balances):
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=BALANCE_COLUMNS, extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()

    for row in sorted(balances, key=lambda r: (r.get("month") or "", r.get("account_id") or "")):
        record = {column: row.get(column, "") for column in BALANCE_COLUMNS}
        record["balance_sgd"] = _money(row.get("balance_sgd"))
        writer.writerow(record)

    return buffer.getvalue()
