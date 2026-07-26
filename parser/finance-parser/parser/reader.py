"""
Getting a grid of cells out of a bank export, whatever format it arrives in.

Handles .xlsx / .xls (openpyxl) and .csv / .txt (stdlib csv). Bank exports
put metadata above the header row, so this module also finds the real header
and reads the key/value preamble.
"""

import csv
import io
import re

from .profiles import CARD_TOKENS, PROFILES, profile_for

ENCODINGS = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]

# Rows that are not transactions.
NOISE_TOKENS = [
    "previous balance", "balance b/f", "balance brought", "opening balance",
    "balance c/f", "balance carried", "sub-total", "subtotal",
    "total", "end of", "closing balance", "disclaimer", "please note",
]

MAX_HEADER_SCAN = 40


def normalise_heading(text):
    """'Transaction Amount(Local)' -> 'transaction amount local'"""
    cleaned = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _decode(raw_bytes):
    for encoding in ENCODINGS:
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("latin-1", errors="replace")


def _sniff_delimiter(text):
    sample = "\n".join(text.splitlines()[:MAX_HEADER_SCAN])
    counts = {d: sample.count(d) for d in [",", ";", "\t", "|"]}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _read_csv(raw_bytes):
    text = _decode(raw_bytes)
    reader = csv.reader(io.StringIO(text), delimiter=_sniff_delimiter(text))
    return [list(row) for row in reader]


def _read_xlsx(raw_bytes):
    try:
        import openpyxl
    except ImportError:
        raise RuntimeError(
            "openpyxl is needed to read Excel exports but isn't installed. "
            "Quit the server and double-click run.command again, or run "
            "./.venv/bin/pip install openpyxl"
        )

    workbook = openpyxl.load_workbook(
        io.BytesIO(raw_bytes), data_only=True, read_only=True
    )
    sheet = workbook[workbook.sheetnames[0]]
    rows = [
        ["" if cell is None else cell for cell in row]
        for row in sheet.iter_rows(values_only=True)
    ]
    workbook.close()
    return rows


def read_grid(raw_bytes, filename=""):
    """
    Return a list of rows (lists of cells). Dates may come back as datetime
    objects from xlsx and as strings from csv — normalise.py handles both.
    """
    lower = (filename or "").lower()

    if lower.endswith((".xlsx", ".xlsm", ".xltx")):
        return _read_xlsx(raw_bytes)

    if lower.endswith(".xls"):
        # Banks often label a real xlsx as .xls. Try xlsx first, fall back to
        # csv only if it genuinely isn't a spreadsheet — a missing dependency
        # must surface, not silently produce nonsense.
        try:
            return _read_xlsx(raw_bytes)
        except RuntimeError:
            raise
        except Exception:
            return _read_csv(raw_bytes)

    if raw_bytes[:2] == b"PK":  # any zip container is almost certainly xlsx
        try:
            return _read_xlsx(raw_bytes)
        except RuntimeError:
            raise
        except Exception:
            pass

    return _read_csv(raw_bytes)


def grid_text(rows, limit=MAX_HEADER_SCAN):
    """Flatten the first rows into one searchable string."""
    parts = []
    for row in rows[:limit]:
        parts.extend(str(cell) for cell in row if str(cell).strip())
    return " ".join(parts).lower()


def detect_bank(rows, filename=""):
    haystack = grid_text(rows) + " " + (filename or "").lower()
    for bank, profile in PROFILES.items():
        if any(token in haystack for token in profile["signatures"]):
            return bank
    return None


def detect_is_card(rows, filename=""):
    haystack = grid_text(rows) + " " + (filename or "").lower()
    if "card" in (filename or "").lower():
        return True
    return any(token in haystack for token in CARD_TOKENS)


def find_header(rows, profile):
    """
    Locate the header row: the first row with a date-ish heading AND an
    amount-ish heading. Returns (index, {field: [column indexes]}).
    """
    aliases = profile["aliases"]

    for index, row in enumerate(rows[:MAX_HEADER_SCAN]):
        headings = [normalise_heading(cell) for cell in row]
        mapping = {}

        for field, field_aliases in aliases.items():
            for column, heading in enumerate(headings):
                if heading and heading in field_aliases:
                    mapping.setdefault(field, []).append(column)

        has_date = "date" in mapping
        has_money = any(
            key in mapping
            for key in ("debit", "credit", "amount", "amount_local")
        )

        if has_date and has_money:
            return index, mapping

    return None, {}


def read_preamble(rows, header_index, profile):
    """
    Read the 'Key: | Value' rows above the header into a dict.
    UOB puts Statement Date and Statement Balance here, which is more reliable
    than deriving a closing balance from the transaction rows.
    """
    if header_index is None:
        return {}

    keys = profile.get("preamble_keys", {})
    found = {}

    for row in rows[:header_index]:
        cells = [str(cell).strip() for cell in row]
        if len(cells) < 2 or not cells[0]:
            continue

        label = normalise_heading(cells[0])
        value = next((c for c in cells[1:] if c), "")
        if not value:
            continue

        for canonical, aliases in keys.items():
            if label in aliases:
                found[canonical] = value
                # Keep the raw row so currency suffixes aren't lost.
                found[canonical + "_row"] = cells[1:]

    return found


def is_noise_row(row, mapping):
    """Blank rows, balance-carried rows and footers are not transactions."""
    if not row or all(str(cell).strip() == "" for cell in row):
        return True

    date_columns = mapping.get("date", [])
    has_date = any(
        column < len(row) and str(row[column]).strip()
        for column in date_columns
    )
    if not has_date:
        return True

    joined = " ".join(str(cell).lower() for cell in row)
    return any(token in joined for token in NOISE_TOKENS)


def inspect(raw_bytes, filename=""):
    """
    What the parser sees before interpreting anything. Use this when a file
    won't parse — the output tells you exactly which aliases to add.
    """
    rows = read_grid(raw_bytes, filename)
    bank = detect_bank(rows, filename)
    profile = profile_for(bank)
    header_index, mapping = find_header(rows, profile)
    header_row = rows[header_index] if header_index is not None else None

    mapped, unmapped = {}, []
    if header_row is not None:
        for field, columns in mapping.items():
            mapped[field] = [
                str(header_row[c]) for c in columns if c < len(header_row)
            ]
        claimed = {c for columns in mapping.values() for c in columns}
        unmapped = [
            str(cell) for i, cell in enumerate(header_row)
            if i not in claimed and str(cell).strip()
        ]

    return {
        "filename": filename,
        "detected_bank": bank,
        "looks_like_card": detect_is_card(rows, filename),
        "header_row_index": header_index,
        "header_row": [str(c) for c in header_row] if header_row else None,
        "mapped_columns": mapped,
        "unmapped_columns": unmapped,
        "preamble": {
            k: v for k, v in read_preamble(rows, header_index, profile).items()
            if not k.endswith("_row")
        },
        "total_rows": len(rows),
        "first_rows": [
            [str(c)[:40] for c in row] for row in rows[:8]
        ],
    }
