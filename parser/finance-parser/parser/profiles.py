"""
Bank profiles — the only file you edit to support a new bank.

A profile answers five questions about an export:
  1 how do I recognise it?          signatures
  2 what are its columns called?    aliases
  3 what metadata sits above the header?  preamble_keys
  4 which way do amounts point?     sign
  5 how are its dates written?      date_formats

Everything downstream works from canonical field names, never a bank's own
headings, so adding a bank touches nothing but this file.

See ADDING_A_BANK.md for the workflow.
"""

# Canonical fields the pipeline understands.
FIELDS = [
    "date", "posted_date", "description",
    "debit", "credit", "amount",
    "amount_local", "currency_local",
    "amount_foreign", "currency_foreign",
    "balance",
]

# Sign conventions:
#   "debit_credit"       separate columns; debit is money out
#   "positive_is_charge" one column where a positive number is a charge
#                        (credit card style) — the sign is flipped
#   "signed"             one column whose sign is already correct
SIGN_DEBIT_CREDIT = "debit_credit"
SIGN_POSITIVE_IS_CHARGE = "positive_is_charge"
SIGN_SIGNED = "signed"

CARD_TOKENS = [
    "statement balance", "posting date", "credit card", "card no",
    "card number", "cardholder", "minimum payment", "previous balance",
]

PROFILES = {
    "UOB": {
        "signatures": ["uob", "united overseas", "tmrw", "one account",
                       "one card"],
        "aliases": {
            "date": ["transaction date", "date", "txn date"],
            "posted_date": ["posting date", "post date", "value date"],
            "description": ["transaction description", "description",
                            "details", "narrative"],
            "debit": ["withdrawal", "withdrawals", "debit", "debit amount"],
            "credit": ["deposit", "deposits", "credit", "credit amount"],
            "amount": ["transaction amount", "amount", "amount sgd"],
            # Verified against real exports July 2026.
            "amount_local": ["transaction amount local"],
            "currency_local": ["local currency type"],
            "amount_foreign": ["transaction amount foreign"],
            "currency_foreign": ["foreign currency type"],
            "balance": ["available balance", "balance", "ledger balance"],
        },
        "preamble_keys": {
            "account_type": ["account type"],
            "statement_period": ["statement period"],
            "statement_date": ["statement date"],
            "statement_balance": ["statement balance"],
        },
        "sign": {"account": SIGN_DEBIT_CREDIT,
                 "card": SIGN_POSITIVE_IS_CHARGE},
        "date_formats": ["%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%d-%m-%Y",
                         "%d %B %Y", "%d %b %y", "%d/%m/%y"],
    },

    # Unverified — written from documented layouts, not a real file. Run
    # Inspect on a real export and correct the aliases if anything is missed.
    "OCBC": {
        "signatures": ["ocbc", "velocity"],
        "aliases": {
            "date": ["transaction date", "date", "txn date"],
            "posted_date": ["value date", "posting date", "post date"],
            "description": ["description", "transaction description",
                            "details", "narrative", "remarks"],
            "debit": ["withdrawals sgd", "withdrawals", "withdrawal",
                      "debit", "debit amount"],
            "credit": ["deposits sgd", "deposits", "deposit",
                       "credit", "credit amount"],
            "amount": ["amount", "amount sgd", "transaction amount"],
            "amount_local": ["transaction amount local", "amount sgd"],
            "currency_local": ["local currency type", "currency"],
            "amount_foreign": ["transaction amount foreign",
                               "foreign amount"],
            "currency_foreign": ["foreign currency type",
                                 "foreign currency"],
            "balance": ["balance", "available balance", "running balance"],
        },
        "preamble_keys": {
            "account_type": ["account type", "account name"],
            "statement_period": ["statement period", "period"],
            "statement_date": ["statement date"],
            "statement_balance": ["statement balance", "total amount due"],
        },
        "sign": {"account": SIGN_DEBIT_CREDIT,
                 "card": SIGN_POSITIVE_IS_CHARGE},
        # OCBC is known to omit the year on some exports; the yearless
        # formats sit last and the year is inferred from the rest of the file.
        "date_formats": ["%Y-%m-%d", "%d/%m/%Y", "%d %b %Y", "%d-%m-%Y",
                         "%d/%m/%y", "%d %b", "%d/%m"],
    },

    # Unverified — see note on OCBC.
    "DBS": {
        "signatures": ["dbs", "posb", "digibank"],
        "aliases": {
            "date": ["transaction date", "date", "txn date", "value date"],
            "posted_date": ["posting date", "post date"],
            # DBS splits long narratives across Ref1/Ref2/Ref3.
            "description": ["transaction ref1", "transaction ref2",
                            "transaction ref3", "transaction ref",
                            "reference", "description",
                            "transaction description", "details"],
            "debit": ["debit amount", "withdrawal", "withdrawals",
                      "debit"],
            "credit": ["credit amount", "deposit", "deposits", "credit"],
            "amount": ["amount", "transaction amount", "amount sgd"],
            "amount_local": ["transaction amount local", "amount sgd"],
            "currency_local": ["local currency type", "currency"],
            "amount_foreign": ["transaction amount foreign",
                               "foreign amount"],
            "currency_foreign": ["foreign currency type",
                                 "foreign currency"],
            "balance": ["balance", "available balance", "ledger balance"],
        },
        "preamble_keys": {
            "account_type": ["account type", "account"],
            "statement_period": ["statement period", "period"],
            "statement_date": ["statement date"],
            "statement_balance": ["statement balance", "total amount due"],
        },
        "sign": {"account": SIGN_DEBIT_CREDIT,
                 "card": SIGN_POSITIVE_IS_CHARGE},
        "date_formats": ["%d %b %Y", "%Y-%m-%d", "%d/%m/%Y", "%d %B %Y",
                         "%d-%m-%Y", "%d %b %y", "%d/%m/%y"],
    },
}

# Used when no signature matches: every alias from every profile, so a
# well-formed export from an unknown bank still parses.
GENERIC_PROFILE = {
    "signatures": [],
    "aliases": {
        field: sorted({
            alias
            for profile in PROFILES.values()
            for alias in profile["aliases"].get(field, [])
        })
        for field in FIELDS
    },
    "preamble_keys": {
        key: sorted({
            alias
            for profile in PROFILES.values()
            for alias in profile["preamble_keys"].get(key, [])
        })
        for key in ["account_type", "statement_period", "statement_date",
                    "statement_balance"]
    },
    "sign": {"account": SIGN_DEBIT_CREDIT, "card": SIGN_POSITIVE_IS_CHARGE},
    "date_formats": ["%Y-%m-%d", "%d/%m/%Y", "%d %b %Y", "%d-%m-%Y",
                     "%d %B %Y", "%d/%m/%y", "%d %b %y", "%d/%m"],
}

# Default account slugs per (bank, is_card). Override per file by naming it
# 'slug__whatever.xlsx', or in the browser before parsing.
DEFAULT_SLUGS = {
    ("UOB", False): "uob-one",
    ("UOB", True): "uob-one-card",
    ("OCBC", False): "ocbc-360",
    ("OCBC", True): "ocbc-card",
    ("DBS", False): "dbs-multiplier",
    ("DBS", True): "dbs-card",
}


def profile_for(bank):
    return PROFILES.get(bank, GENERIC_PROFILE)


def sign_convention(profile, is_card):
    sign = profile.get("sign", {})
    if isinstance(sign, str):
        return sign
    return sign.get("card" if is_card else "account", SIGN_DEBIT_CREDIT)
