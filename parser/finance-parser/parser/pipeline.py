"""
Orchestration: file bytes in, transactions and balances out.

    1 read      xlsx or csv -> grid of cells
    2 detect    which bank, bank account or card
    3 adapt     find header, map columns, read preamble metadata
    4 normalise ISO dates, one signed amount, FX split
    5 classify  merchant map lookup
    6 enrich    txn_id, month, transfer pairs, closing balance
    7 emit      CSV (see emit.py)
"""

import os
import re

from . import classify, enrich, normalise, reader
from .profiles import DEFAULT_SLUGS, profile_for, sign_convention

# 'uob-one-card__june.xlsx' names its own account — the escape hatch when
# auto-detection guesses wrong.
FILENAME_ACCOUNT_RE = re.compile(r"^([a-z0-9][a-z0-9-]{1,40})__", re.IGNORECASE)


def account_id_for(filename, bank, is_card, overrides=None):
    if overrides and overrides.get(filename):
        return overrides[filename]

    match = FILENAME_ACCOUNT_RE.match(os.path.basename(filename or ""))
    if match:
        return match.group(1).lower()

    return DEFAULT_SLUGS.get((bank, is_card), "unknown-account")


def parse_file(raw_bytes, filename, rules, account_overrides=None):
    """
    Parse one export. Returns (rows, meta). A broken file reports its problem
    in meta['error'] rather than raising, so one bad file can't stop the batch.
    """
    try:
        grid = reader.read_grid(raw_bytes, filename)
    except Exception as error:
        return [], {"filename": filename, "error": f"Could not read file: {error}",
                    "row_count": 0, "skipped": 0}

    bank = reader.detect_bank(grid, filename)
    is_card = reader.detect_is_card(grid, filename)
    profile = profile_for(bank)
    convention = sign_convention(profile, is_card)

    header_index, mapping = reader.find_header(grid, profile)
    preamble = reader.read_preamble(grid, header_index, profile)
    account_id = account_id_for(filename, bank, is_card, account_overrides)

    meta = {
        "filename": os.path.basename(filename or ""),
        "bank": bank,
        "is_card": is_card,
        "account_id": account_id,
        "row_count": 0,
        "skipped": 0,
        "unparsed_dates": 0,
        "has_balance_column": "balance" in mapping,
        "statement_date": preamble.get("statement_date", ""),
        "statement_period": preamble.get("statement_period", ""),
        "account_type": preamble.get("account_type", ""),
        "closing_balance": None,
        "balance_source": None,
        "as_of": None,
        "error": None,
    }

    if header_index is None:
        meta["error"] = (
            "No header row found with both a date and an amount column. "
            "Use Inspect to see the columns, then add them to profiles.py."
        )
        return [], meta

    body = grid[header_index + 1:]
    date_columns = mapping.get("date", [])
    fallback_year = normalise.infer_year(
        [normalise.cell(row, date_columns) for row in body],
        profile["date_formats"],
    )

    rows = []
    for offset, raw_row in enumerate(body):
        if reader.is_noise_row(raw_row, mapping):
            meta["skipped"] += 1
            continue

        iso_date = normalise.parse_date(
            normalise.raw_cell(raw_row, date_columns),
            profile["date_formats"], fallback_year,
        )
        if not iso_date:
            meta["unparsed_dates"] += 1
            meta["skipped"] += 1
            continue

        amount_sgd = normalise.signed_amount(raw_row, mapping, convention)
        if amount_sgd is None:
            meta["skipped"] += 1
            continue

        description_raw = normalise.clean_description(
            normalise.cell(raw_row, mapping.get("description", []))
        )

        posted_date = normalise.parse_date(
            normalise.raw_cell(raw_row, mapping.get("posted_date", [])),
            profile["date_formats"], fallback_year,
        ) or ""

        native_amount, native_currency = normalise.foreign_amount(
            raw_row, mapping, convention
        )
        currency = native_currency or normalise.local_currency(raw_row, mapping)
        amount_native = native_amount if native_amount is not None else amount_sgd

        merchant, category, txn_type, confidence = classify.classify(
            description_raw, rules
        )
        if amount_sgd > 0 and not is_card and txn_type == "expense":
            txn_type = "income"

        rows.append({
            "txn_id": enrich.make_txn_id(
                iso_date, account_id, amount_sgd, description_raw
            ),
            "date": iso_date,
            "merchant": merchant,
            "amount_sgd": round(amount_sgd, 2),
            "category": category,
            "type": txn_type,
            "notes": "",
            "account_id": account_id,
            "month": enrich.month_of(iso_date),
            "posted_date": posted_date,
            "currency": currency,
            "amount": round(amount_native, 2),
            "description_raw": description_raw,
            "transfer_pair_id": "",
            "confidence": confidence,
            "source_file": meta["filename"],
            "_balance": normalise.parse_amount(
                normalise.raw_cell(raw_row, mapping.get("balance", []))
            ),
            "_row_index": offset,
        })

    meta["row_count"] = len(rows)
    _resolve_balance(meta, preamble, profile, rows, is_card)
    return rows, meta


def _resolve_balance(meta, preamble, profile, rows, is_card):
    """
    Where a closing balance comes from, in order of reliability:

      1 a Statement Balance in the preamble (credit cards) — the amount owed,
        stored NEGATIVE because it is a liability
      2 the running balance column after the most recent transaction
      3 nothing, in which case the UI asks you to type it
    """
    statement_balance = normalise.parse_amount(preamble.get("statement_balance"))

    if statement_balance is not None:
        as_of = normalise.parse_date(
            preamble.get("statement_date"), profile["date_formats"]
        )
        balance = -abs(statement_balance) if is_card else statement_balance
        meta["closing_balance"] = round(balance, 2)
        meta["balance_source"] = "statement_balance"
        meta["as_of"] = as_of or (max((r["date"] for r in rows), default=None))
        return

    balance, as_of = enrich.closing_balance(rows)
    if balance is not None:
        meta["closing_balance"] = round(balance, 2)
        meta["balance_source"] = "running_balance"
        meta["as_of"] = as_of


def parse_batch(files, merchant_map_path, account_overrides=None):
    """
    files: list of (filename, raw_bytes)

    Transfer pairs are matched across every file in the batch, so process all
    accounts for a month together.
    """
    rules = classify.load_rules(merchant_map_path)

    all_rows, metas = [], []
    for filename, raw_bytes in files:
        rows, meta = parse_file(raw_bytes, filename, rules, account_overrides)
        all_rows.extend(rows)
        metas.append(meta)

    pairs = enrich.assign_transfer_pairs(all_rows)

    balances, needs_balance = [], []
    for meta in metas:
        if meta.get("error"):
            continue
        if meta["closing_balance"] is None or not meta["as_of"]:
            needs_balance.append({
                "account_id": meta["account_id"],
                "filename": meta["filename"],
                "suggested_month": _suggest_month(meta, all_rows),
            })
            continue

        balances.append({
            "month": meta["as_of"][:7],
            "account_id": meta["account_id"],
            "balance_sgd": meta["closing_balance"],
            "source": "statement",
            "as_of": meta["as_of"],
            "derived_from": meta["balance_source"],
        })

    return {
        "rows": all_rows,
        "files": metas,
        "unknowns": collect_unknowns(all_rows),
        "balances": balances,
        "duplicates": enrich.find_duplicates(all_rows),
        "transfer_pairs": pairs,
        "accounts_needing_balance": needs_balance,
    }


def _suggest_month(meta, rows):
    account_rows = [r for r in rows if r["account_id"] == meta["account_id"]]
    if not account_rows:
        return ""
    return max(r["month"] for r in account_rows)


def collect_unknowns(rows):
    """
    Low-confidence rows grouped by raw description, so each distinct merchant
    is labelled once rather than once per transaction.
    """
    groups = {}
    for row in rows:
        if row.get("confidence") != "low":
            continue

        key = row["description_raw"]
        group = groups.setdefault(key, {
            "description_raw": key,
            "suggested_pattern": classify.suggest_pattern(key),
            "count": 0,
            "total": 0.0,
            "example_date": row["date"],
            "accounts": set(),
        })
        group["count"] += 1
        group["total"] = round(group["total"] + row["amount_sgd"], 2)
        group["accounts"].add(row["account_id"])

    descriptions = list(groups.keys())
    unknowns = []
    for group in groups.values():
        group["accounts"] = sorted(group["accounts"])
        group["breadth"] = classify.breadth(
            group["suggested_pattern"], "contains", descriptions
        )
        unknowns.append(group)

    unknowns.sort(key=lambda g: abs(g["total"]), reverse=True)
    return unknowns


def reclassify(rows, merchant_map_path):
    """Re-run classification in place after new rules are saved."""
    rules = classify.load_rules(merchant_map_path)
    for row in rows:
        merchant, category, txn_type, confidence = classify.classify(
            row["description_raw"], rules
        )
        is_card = row.get("account_id", "").endswith("-card")
        if row.get("amount_sgd", 0) > 0 and not is_card and txn_type == "expense":
            txn_type = "income"
        row.update({
            "merchant": merchant,
            "category": category,
            "type": txn_type,
            "confidence": confidence,
            "transfer_pair_id": "",
        })
    enrich.assign_transfer_pairs(rows)
    return rows
