# Finance Parser

Turns Singapore bank exports into the two CSVs your Google Sheet expects.
Runs entirely on your Mac. Nothing is uploaded anywhere.

Replaces the Claude-based parsing step with a deterministic pipeline: the same
input always produces the same output, and your statements never leave the
machine.

---

## First run

Double-click **`run.command`**.

First launch creates a virtual environment and installs Flask — about a minute.
Later launches start immediately. Your browser opens at
`http://127.0.0.1:8765`.

If macOS blocks it: right-click `run.command` → Open → Open. Once only.

If `python3` is missing, run `xcode-select --install` and try again.

---

## Each month

1. Export from each bank (UOB TMRW → Statements → download)
2. Double-click `run.command`
3. Drag the files in, click **Parse**
4. Work through the **Review** table — label each unrecognised description
   once, click **Save rules & re-classify**
5. Download `transactions.csv` and `balances.csv`
6. In Google Sheets: File → Import → **Append to current sheet**, and untick
   *Convert text to numbers, dates and formulas*

Process every account for the same period together. Transfer pairs are matched
across files, so a credit card payment can only be linked if both the bank
export and the card export are in the same run.

---

## Verifying the privacy claim

Turn off wifi and run it. Everything works. That's a stronger guarantee than
reading the code.

The server binds to `127.0.0.1`, not `0.0.0.0`, so it isn't reachable from
other devices on your network. Parsed data lives in memory only — quitting
clears it. The sole things written to disk are `data/merchant_map.csv` when you
save rules, and the CSVs you explicitly download.

---

## What's here

```
run.command              double-click launcher
app.py                   Flask server, localhost only
parser/
  profiles.py            bank column definitions — the only file to edit
  reader.py              xlsx/csv -> grid, header + preamble detection
  normalise.py           ISO dates, one signed amount, FX split
  classify.py            merchant map lookup, pattern suggestions
  enrich.py              txn_id hashing, transfer pairs, closing balance
  pipeline.py            orchestration
  emit.py                CSV output in the sheet's column order
data/
  merchant_map.csv       your rules — BACK THIS UP
  categories.txt         dropdown options in the review table
tests/                   33 tests on synthetic fixtures
```

---

## The merchant map is the valuable file

`data/merchant_map.csv` is the only thing here you can't regenerate. The parser
is a few hundred lines that could be rewritten in an afternoon; three years of
accumulated merchant knowledge cannot.

Keep it in git, or in iCloud, or both.

Match order is exact → prefix → contains → regex, first match wins. Put
specific rules above general ones within the same match type.

### Patterns that are too broad

UOB masks PayNow recipient names, so many descriptions look like
`PAYNOW-FAST OTHR 201109781H` with no merchant information at all. The review
table counts how many other descriptions a proposed pattern would match, and
switches to an exact match on the full text when a pattern is too broad.

Watch for this. A `contains` rule on `PAYNOW-FAST OTHR` would swallow every
PayNow you ever make and categorise them all identically.

---

## Rules the output obeys

**One signed amount.** Withdrawal/Deposit columns collapse into a single
`amount_sgd`: negative is money out. Credit card exports print charges as
positive numbers, so those are flipped — which means a rebate comes out
positive, as income.

**`transfer` means your own accounts only.** PayNow to a hawker, a friend or a
business is `expense`. Only movements between accounts you own — card payments,
wallet and broker top-ups — are transfers. Unrecognised descriptions default to
`expense`, which is the safer error: it overstates spending rather than hiding
it.

**Liabilities are negative.** A card with $2,994.13 outstanding is
`-2994.13`, so net worth is a plain sum with no conditional logic.

**Nothing is guessed.** A description with no matching rule gets `confidence:
low` and no category. The parser never invents a category — that's the trade
for determinism.

**`txn_id` is a real hash.** SHA-256 of date, account, amount and description,
truncated to 12 characters. Identical input always yields an identical ID, so
importing the same export twice is detectable — by the parser and by the
dashboard.

---

## Closing balances

Taken from, in order of reliability:

1. a **Statement Balance** in the file's preamble — how the UOB card works
2. the **running balance** column after the most recent transaction
3. **you**, typed into the browser, when neither exists

For (2) the file's sort direction matters: several rows can share the newest
date, and the true closing balance is the one nearest the top in a descending
export, nearest the bottom in an ascending one. Getting this backwards gives a
balance off by the last transaction of the day.

---

## Adding another bank

See **ADDING_A_BANK.md**. It's one file and roughly fifteen lines.

UOB is verified against real exports. OCBC and DBS profiles are written from
documented layouts and marked unverified — run Inspect on a real export and
correct the aliases before trusting them.

---

## Tests

```bash
python3 -m unittest discover -s tests -v
```

Fixtures are synthetic, so no real statement data is in the repo. Each one
reproduces a quirk found in a real export: descending date order, embedded
newlines in a description cell, a dateless Previous Balance row, positive
charges on a card, omitted years.

---

## Troubleshooting

**"Could not read file: openpyxl is needed…"**
A dependency is missing from the virtualenv. Quit the server and double-click
`run.command` again — it reinstalls whenever `requirements.txt` changes. Or
directly: `./.venv/bin/pip install openpyxl`

**"No header row found with both a date and an amount column"**
The bank's column names aren't in its profile yet. Click **Inspect** on the
file to see the real headings, then add them to `parser/profiles.py`. See
ADDING_A_BANK.md.

**Wrong account assigned to a file**
Rename it with a slug prefix: `uob-one-card__june.xlsx` forces the account to
`uob-one-card`, overriding detection.

**Port 8765 already in use**
Another copy of the server is still running. Quit its Terminal window, or
change `PORT` at the top of `app.py`.

**Received total shows $0.00 even though salary came in**
Unrecognised descriptions default to `expense` regardless of sign. Any positive
deposit that isn't in the merchant map will appear in the review table typed as
expense. Change its type to `income` there and save the rule — it then counts
toward RECEIVED and is remembered for every future run. Common ones to add:
salary GIROs, reimbursements, and ad-hoc transfers received from others.

**Refunds or credits inflating SPENT**
They don't — positive-amount expenses are excluded from the SPENT counter.
Only negative amounts (money actually leaving) count as spending, so a refund
typed as `expense` correctly offsets nothing and doesn't double-count.

**Rebates or refunds showing as spending**
The sign convention for that bank is wrong. See step 3 of ADDING_A_BANK.md —
verify against a rebate row, never a purchase.

---

## The credit card double-count

If you pay your card from your own bank account, the payment appears on **both**
statements: a withdrawal on the bank export and a payment credit on the card
export. Neither is spending — the spending already happened when you swiped.
Counting the payment again doubles it.

Both legs must be `type: transfer`, category `Credit Card Payment`. The rules
covering UOB are:

| Description on | Pattern in the map |
|---|---|
| bank export | `Bill Payment Card payment` |
| card export | `PAYMT THRU E-BANK` |

**A monthly sanity check:** your card payment should equal the previous
statement's balance if you pay in full. If a payment shows up in your spending
totals, it's typed wrong.

### The same trap for your own transfers

Any movement between accounts **you own** is a transfer, not an expense —
top-ups to YouTrip, Moomoo or IBKR, and moves between your own bank accounts.
Only money leaving your household is an expense.

The parser cannot tell these apart, because a `Funds Trf - FAST` to your own
account and one to a friend look identical. Both arrive as `expense`, the safer
default: it overstates spending rather than hiding it. You have to judge each
one in the review table.

Where the description carries a stable identifier — a recipient reference you
recognise — save it as a rule and it's handled from then on. Where it's a
one-off, leave it and fix the row in the sheet.
