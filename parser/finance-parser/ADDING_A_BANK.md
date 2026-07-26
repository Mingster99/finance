# Adding a bank

Adding OCBC, DBS, or anything else means editing **one file**: `parser/profiles.py`.
No new parser, no new module, no changes to the pipeline, the UI, or the output.

The reason it's this cheap: nothing downstream of `profiles.py` knows a bank
exists. The pipeline works in canonical field names — `date`, `description`,
`debit`, `credit`, `balance` — and a profile is just a translation table from
one bank's column headings into those names.

---

## The workflow

### 1. Export a real file and press Inspect

Start the parser, drop the file in, click **Inspect** instead of Parse. You get:

```
mydbs.csv
  bank: DBS  |  card: false  |  header row: 4
  Mapped:   {"date": ["Transaction Date"], "debit": ["Debit Amount"]}
  Unmapped: ["Reference", "Statement Code", "Balance After"]
  Preamble: {"account_type": "Autosave"}
```

Two lines matter. **Mapped** is what already works. **Unmapped** is every
column the profile didn't recognise — that list is your to-do.

If `bank:` comes back empty, the signature tokens didn't match either.

### 2. Add the missing aliases

In `profiles.py`, find the bank's entry and add each unmapped heading to the
right canonical field. Aliases are compared with punctuation and case stripped,
so write them in lower case with spaces:

```python
"DBS": {
    "signatures": ["dbs", "posb", "digibank"],
    "aliases": {
        "date": ["transaction date", "date"],
        "description": ["transaction ref1", "reference"],   # <- added
        "debit": ["debit amount", "withdrawal"],
        "credit": ["credit amount", "deposit"],
        "balance": ["balance", "balance after"],            # <- added
    },
    ...
}
```

`Transaction Amount(Local)` becomes the alias `transaction amount local`.
`Withdrawals (SGD)` becomes `withdrawals sgd`.

A field can list several aliases and several will match at once — that's how
DBS's Ref1/Ref2/Ref3 narrative gets joined into one description.

### 3. Check the sign convention

This is the part most likely to be silently wrong, because a wrong sign still
produces a plausible-looking number.

| The export has | Use |
|---|---|
| Separate Withdrawal / Deposit columns | `SIGN_DEBIT_CREDIT` |
| One column where a purchase is a positive number | `SIGN_POSITIVE_IS_CHARGE` |
| One column already negative for money out | `SIGN_SIGNED` |

Bank accounts and cards from the same bank usually differ, so it's a dict:

```python
"sign": {"account": SIGN_DEBIT_CREDIT, "card": SIGN_POSITIVE_IS_CHARGE},
```

**Verify with a refund or rebate, not a purchase.** Under
`positive_is_charge`, a `-100.00` rebate must come out as `+100.00`. If your
rebates are negative in the output, the convention is wrong.

### 4. Add date formats if needed

Formats are tried in order, first match wins:

```python
"date_formats": ["%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"],
```

If a bank omits the year — OCBC does on some exports — put `"%d/%m"` **last**.
The parser reads the year from whichever rows do carry one and backfills the
rest, so a yearless format must never sit ahead of a complete one.

### 5. Name the preamble keys

Metadata rows above the header are read as `Key: | Value` pairs:

```python
"preamble_keys": {
    "statement_date": ["statement date"],
    "statement_balance": ["statement balance", "total amount due"],
},
```

`statement_balance` matters most: for a credit card it becomes the closing
balance directly, stored negative as a liability. That's more reliable than
deriving it from a running balance column, and it's how the UOB card works.

### 6. Add a default slug

```python
DEFAULT_SLUGS = {
    ("OCBC", False): "ocbc-360",
    ("OCBC", True): "ocbc-card",
}
```

### 7. Add a fixture and a test

Copy a handful of rows from the real export into `tests/test_pipeline.py` as a
byte string — change the amounts and merchant names, keep the structure. Then
assert the things that break silently:

- a withdrawal is negative and a deposit positive
- a rebate or refund is positive
- the closing balance is right, and negative for a card
- rows without a date are skipped

This is the step worth not skipping. When the bank changes its export format in
two years, a failing test tells you immediately; without one you get quietly
wrong numbers in your dashboard.

Run: `python3 -m unittest discover -s tests -v`

---

## Escape hatches

**Wrong account detected.** Rename the file `slug__anything.xlsx` — a `slug__`
prefix overrides detection entirely. `ocbc-360__june.csv` forces `ocbc-360`.

**Bank not recognised at all.** The generic profile pools every alias from
every bank, so a conventional export often parses anyway. Check Inspect to
confirm the columns landed correctly before trusting the output.

**Only one broken file.** Each file is parsed independently and its error is
reported in the Files table. One unreadable export never stops the others.
