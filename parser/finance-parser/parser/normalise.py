"""
Dates and amounts into one canonical shape.

Two PRD rules are enforced here:
  * dates become ISO YYYY-MM-DD
  * whatever columns the bank used collapse into ONE signed amount,
    negative for money out
"""

import re
from collections import Counter
from datetime import date, datetime

from .profiles import (SIGN_DEBIT_CREDIT, SIGN_POSITIVE_IS_CHARGE,
                       SIGN_SIGNED)

YEARLESS_FORMATS = {"%d/%m", "%d %b", "%d %B", "%d-%m"}


def parse_amount(value):
    """
    Returns a float, or None for an empty cell. None and 0.0 are different:
    banks write 0.0 in the unused one of a Withdrawal/Deposit pair.

    '1,234.56'  -> 1234.56
    '(45.00)'   -> -45.00     accounting negative
    '12.00 CR'  -> 12.00
    '12.00 DR'  -> -12.00
    """
    if value is None:
        return None

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    text = str(value).strip()
    if text == "":
        return None

    negative = False

    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1]

    upper = text.upper().replace(" ", "")
    if upper.endswith("DR"):
        negative = True
        text = text[:-2]
    elif upper.endswith("CR"):
        text = text[:-2]

    cleaned = re.sub(r"[^0-9.\-]", "", text)
    leading_minus = cleaned.startswith("-")
    cleaned = cleaned.replace("-", "")

    if cleaned in ("", "."):
        return None

    try:
        amount = float(cleaned)
    except ValueError:
        return None

    if leading_minus:
        amount = -amount
    return -abs(amount) if negative else amount


def parse_date(value, formats, fallback_year=None):
    """ISO date string, or None. Accepts datetime objects from xlsx directly."""
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    text = str(value).strip()
    if text == "":
        return None

    # '2026-07-27 00:00:00' or '14/07/2026 09:31' -> drop the time
    text = re.split(r"\s+\d{1,2}:\d{2}", text)[0].strip()

    for fmt in formats:
        try:
            parsed = datetime.strptime(text, fmt)
        except ValueError:
            continue

        if fmt in YEARLESS_FORMATS:
            if fallback_year is None:
                continue
            parsed = parsed.replace(year=fallback_year)

        return parsed.date().isoformat()

    return None


def infer_year(raw_dates, formats):
    """
    For exports with yearless dates, take the year from whichever rows do
    carry one. Falls back to the current year.
    """
    dated = [
        parse_date(raw, [f for f in formats if f not in YEARLESS_FORMATS])
        for raw in raw_dates
    ]
    years = [int(iso[:4]) for iso in dated if iso]
    if years:
        return Counter(years).most_common(1)[0][0]
    return date.today().year


def cell(row, columns, joiner=" "):
    """Read one or more columns and join the non-empty values."""
    if not columns:
        return ""
    values = []
    for column in columns:
        if column < len(row):
            text = str(row[column]).strip()
            if text:
                values.append(text)
    return joiner.join(values)


def raw_cell(row, columns):
    """First non-empty raw value (not stringified) from the given columns."""
    for column in columns:
        if column < len(row):
            value = row[column]
            if value is not None and str(value).strip() != "":
                return value
    return None


def signed_amount(row, mapping, convention):
    """
    Collapse the bank's columns into one signed number.

    debit_credit        Withdrawal -> negative, Deposit -> positive
    positive_is_charge  credit card: flip the sign, so a 6.80 purchase
                        becomes -6.80 and a -100.00 rebate becomes +100.00
    signed              trust the column as-is
    """
    if convention == SIGN_DEBIT_CREDIT:
        debit = parse_amount(raw_cell(row, mapping.get("debit", [])))
        credit = parse_amount(raw_cell(row, mapping.get("credit", [])))

        if debit not in (None, 0):
            return -abs(debit)
        if credit not in (None, 0):
            return abs(credit)
        # Both zero or absent — fall through to a single amount column.

    amount = parse_amount(raw_cell(row, mapping.get("amount_local", [])))
    if amount is None:
        amount = parse_amount(raw_cell(row, mapping.get("amount", [])))

    if amount is None:
        # Last resort: a debit/credit pair that was both zero.
        debit = parse_amount(raw_cell(row, mapping.get("debit", [])))
        credit = parse_amount(raw_cell(row, mapping.get("credit", [])))
        if debit is not None or credit is not None:
            return 0.0
        return None

    if convention == SIGN_POSITIVE_IS_CHARGE:
        return -amount

    return amount


def foreign_amount(row, mapping, convention):
    """
    (native_amount, currency) for a foreign-currency transaction.
    Returns (None, None) when the row is in local currency.
    """
    native = parse_amount(raw_cell(row, mapping.get("amount_foreign", [])))
    currency = cell(row, mapping.get("currency_foreign", [])).upper() or None

    if native is None or not currency:
        return None, None

    if convention == SIGN_POSITIVE_IS_CHARGE:
        native = -native

    return native, currency


def local_currency(row, mapping, default="SGD"):
    return (cell(row, mapping.get("currency_local", [])).upper() or default)


def clean_description(text):
    """
    Collapse whitespace, including the embedded newlines UOB puts inside a
    single description cell. The wording itself is preserved verbatim.
    """
    return re.sub(r"\s+", " ", str(text or "").replace("\n", " ")).strip()
