"""
Derived fields: transaction IDs, month keys and transfer pairs.

The txn_id here is a real hash, which is the main upgrade over the
Claude-based skill: identical input always produces an identical ID, so
duplicate detection works across separate runs and across months, not just
within one batch.
"""

import hashlib
from datetime import date, timedelta

TRANSFER_TYPE = "transfer"
PAIR_TOLERANCE = 0.01      # cents of rounding slack when matching legs
PAIR_WINDOW_DAYS = 3


def make_txn_id(iso_date, account_id, amount_sgd, description_raw):
    """
    Deterministic 12-character ID. Amount is formatted to 2dp first so that
    14.2 and 14.20 hash identically.
    """
    payload = "|".join([
        str(iso_date or ""),
        str(account_id or ""),
        f"{float(amount_sgd or 0):.2f}",
        str(description_raw or "").strip().upper(),
    ])
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return digest[:12]


def month_of(iso_date):
    return str(iso_date)[:7] if iso_date else ""


def _to_date(iso_date):
    try:
        year, month, day = (int(part) for part in str(iso_date).split("-"))
        return date(year, month, day)
    except (ValueError, AttributeError):
        return None


def assign_transfer_pairs(rows):
    """
    Link both legs of an internal transfer so the dashboard can exclude the
    pair together. A pair is two transfer rows in DIFFERENT accounts with equal
    absolute amounts, opposite signs, within PAIR_WINDOW_DAYS of each other.

    Mutates rows in place and returns the number of pairs found.
    """
    candidates = [
        row for row in rows
        if row.get("type") == TRANSFER_TYPE
        and not row.get("transfer_pair_id")
        and row.get("amount_sgd") is not None
    ]

    outflows = sorted(
        [r for r in candidates if r["amount_sgd"] < 0],
        key=lambda r: (r.get("date") or "", r.get("account_id") or ""),
    )
    inflows = [r for r in candidates if r["amount_sgd"] > 0]

    counter = {}
    pairs = 0

    for outflow in outflows:
        out_date = _to_date(outflow.get("date"))
        if out_date is None:
            continue

        for inflow in inflows:
            if inflow.get("transfer_pair_id"):
                continue
            if inflow.get("account_id") == outflow.get("account_id"):
                continue

            in_date = _to_date(inflow.get("date"))
            if in_date is None:
                continue

            if abs(abs(inflow["amount_sgd"]) - abs(outflow["amount_sgd"])) > PAIR_TOLERANCE:
                continue
            if abs((in_date - out_date).days) > PAIR_WINDOW_DAYS:
                continue

            anchor = min(out_date, in_date).isoformat()
            counter[anchor] = counter.get(anchor, 0) + 1
            pair_id = f"tp-{anchor}-{counter[anchor]:02d}"

            outflow["transfer_pair_id"] = pair_id
            inflow["transfer_pair_id"] = pair_id
            pairs += 1
            break

    return pairs


def find_duplicates(rows):
    """Group rows by txn_id and report any id appearing more than once."""
    counts = {}
    for row in rows:
        txn_id = row.get("txn_id")
        if txn_id:
            counts[txn_id] = counts.get(txn_id, 0) + 1
    return [{"txn_id": k, "count": v} for k, v in counts.items() if v > 1]


def detect_order(rows):
    """
    'ascending', 'descending' or 'unknown' — which way the file lists dates.
    Matters because banks differ, and it decides which of several rows sharing
    the newest date holds the true closing balance.
    """
    dated = [(r.get("_row_index"), r.get("date")) for r in rows if r.get("date")]
    if len(dated) < 2:
        return "unknown"

    dated.sort(key=lambda pair: pair[0])
    first, last = dated[0][1], dated[-1][1]

    if first < last:
        return "ascending"
    if first > last:
        return "descending"
    return "unknown"


def closing_balance(rows):
    """
    The running balance after the most recent transaction.

    Several rows can share the newest date, so file order breaks the tie: in a
    descending export the newest row is nearest the top, in an ascending one it
    is nearest the bottom. Getting this backwards yields a balance that is off
    by the last transaction of the day.

    Returns (balance, as_of_iso) or (None, None).
    """
    candidates = [
        row for row in rows
        if row.get("_balance") is not None and row.get("date")
    ]
    if not candidates:
        return None, None

    newest = max(row["date"] for row in candidates)
    same_day = [row for row in candidates if row["date"] == newest]

    order = detect_order(rows)
    if order == "descending":
        chosen = min(same_day, key=lambda r: r.get("_row_index", 0))
    else:
        chosen = max(same_day, key=lambda r: r.get("_row_index", 0))

    return chosen["_balance"], newest
