"""
Tests run on synthetic fixtures, never on real statements, so the suite can
live in git. Each fixture reproduces a layout quirk found in a real export.

Run:  python3 -m unittest discover -s tests -v
"""

import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parser import classify, enrich, normalise, pipeline, reader  # noqa: E402

MAP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "data", "merchant_map.csv")

# UOB One Account: metadata rows, Withdrawal/Deposit pair, running balance,
# rows in DESCENDING date order, newline inside the description cell.
UOB_ACCOUNT = b"""Account Type:,One Account
Statement Period:,01 Jun 2026 To 30 Jun 2026
Transaction Date,Transaction Description,Withdrawal,Deposit,Available Balance
2026-06-30,"PAYNOW-FAST
 OTHR Kopi Place",4.50,0.0,1000.00
2026-06-30,"Inward CR - GIRO
 SALARY",0.0,3000.00,1004.50
2026-06-28,NETFLIX.COM SINGAPORE SG,15.98,0.0,900.00
"""

# UOB card: Statement Balance in the preamble, a dateless Previous Balance row,
# positive amounts are charges, negative are rebates.
UOB_CARD = b"""Statement Date:,2026-06-07
Statement Balance:,250.00,SGD
Transaction Date,Posting Date,Description,Foreign Currency Type,Transaction Amount(Foreign),Local Currency Type,Transaction Amount(Local)
,,Previous Balance,,,,100.00
2026-06-05,2026-06-06,SUBWAY SINGAPORE SG,,,SGD,6.80
2026-06-04,2026-06-06,UOB ONE CASH REBATE,,,SGD,-100.00
2026-06-03,2026-06-05,IHERB IHERB.COM NL,USD,20.00,SGD,27.50
"""

# A bank omitting the year, with accounting-style negatives.
YEARLESS = b"""Date,Description,Withdrawals,Deposits
15/03,COLD STORAGE,(42.10),
16/03,INTEREST EARNED,,1.20
17/03/2026,GIANT TAMPINES,20.00,
"""


class TestAmounts(unittest.TestCase):
    def test_blank_is_none_not_zero(self):
        self.assertIsNone(normalise.parse_amount(""))
        self.assertEqual(normalise.parse_amount(0.0), 0.0)

    def test_accounting_negative(self):
        self.assertEqual(normalise.parse_amount("(42.10)"), -42.10)

    def test_thousands_separator(self):
        self.assertEqual(normalise.parse_amount("1,234.56"), 1234.56)

    def test_cr_dr_suffix(self):
        self.assertEqual(normalise.parse_amount("12.00 CR"), 12.00)
        self.assertEqual(normalise.parse_amount("12.00 DR"), -12.00)

    def test_native_negative_float(self):
        self.assertEqual(normalise.parse_amount(-100.0), -100.0)


class TestDates(unittest.TestCase):
    def test_datetime_string_with_time(self):
        self.assertEqual(
            normalise.parse_date("2026-07-27 00:00:00", ["%Y-%m-%d"]),
            "2026-07-27")

    def test_yearless_uses_fallback(self):
        self.assertEqual(
            normalise.parse_date("15/03", ["%d/%m"], fallback_year=2026),
            "2026-03-15")

    def test_year_inferred_from_siblings(self):
        year = normalise.infer_year(["15/03", "17/03/2026"],
                                   ["%d/%m/%Y", "%d/%m"])
        self.assertEqual(year, 2026)


class TestUobAccount(unittest.TestCase):
    def setUp(self):
        rules = classify.load_rules(MAP)
        self.rows, self.meta = pipeline.parse_file(
            UOB_ACCOUNT, "uob-one__test.csv", rules)

    def test_detects_bank_and_type(self):
        self.assertEqual(self.meta["bank"], "UOB")
        self.assertFalse(self.meta["is_card"])

    def test_filename_sets_account(self):
        self.assertEqual(self.meta["account_id"], "uob-one")

    def test_all_rows_parsed(self):
        self.assertEqual(self.meta["row_count"], 3)

    def test_withdrawal_is_negative_deposit_positive(self):
        by_desc = {r["description_raw"]: r["amount_sgd"] for r in self.rows}
        self.assertEqual(by_desc["NETFLIX.COM SINGAPORE SG"], -15.98)
        self.assertEqual(by_desc["Inward CR - GIRO SALARY"], 3000.00)

    def test_embedded_newline_collapsed(self):
        self.assertTrue(
            any(r["description_raw"] == "PAYNOW-FAST OTHR Kopi Place"
                for r in self.rows))

    def test_descending_file_picks_newest_balance(self):
        # Two rows share 2026-06-30; the true closing balance is the one
        # nearest the top of a descending export.
        self.assertEqual(self.meta["closing_balance"], 1000.00)
        self.assertEqual(self.meta["as_of"], "2026-06-30")
        self.assertEqual(self.meta["balance_source"], "running_balance")


class TestUobCard(unittest.TestCase):
    def setUp(self):
        rules = classify.load_rules(MAP)
        self.rows, self.meta = pipeline.parse_file(
            UOB_CARD, "uob-one-card__test.csv", rules)

    def test_detected_as_card(self):
        self.assertTrue(self.meta["is_card"])

    def test_previous_balance_row_skipped(self):
        self.assertEqual(self.meta["row_count"], 3)
        self.assertFalse(any("Previous Balance" in r["description_raw"]
                             for r in self.rows))

    def test_charge_becomes_negative(self):
        subway = next(r for r in self.rows if "SUBWAY" in r["description_raw"])
        self.assertEqual(subway["amount_sgd"], -6.80)

    def test_rebate_becomes_positive(self):
        rebate = next(r for r in self.rows if "REBATE" in r["description_raw"])
        self.assertEqual(rebate["amount_sgd"], 100.00)
        self.assertEqual(rebate["type"], "income")

    def test_foreign_currency_split(self):
        iherb = next(r for r in self.rows if "IHERB" in r["description_raw"])
        self.assertEqual(iherb["currency"], "USD")
        self.assertEqual(iherb["amount"], -20.00)     # native
        self.assertEqual(iherb["amount_sgd"], -27.50)  # charged

    def test_statement_balance_is_negative_liability(self):
        self.assertEqual(self.meta["closing_balance"], -250.00)
        self.assertEqual(self.meta["balance_source"], "statement_balance")
        self.assertEqual(self.meta["as_of"], "2026-06-07")

    def test_posted_date_captured(self):
        subway = next(r for r in self.rows if "SUBWAY" in r["description_raw"])
        self.assertEqual(subway["posted_date"], "2026-06-06")


class TestYearlessDates(unittest.TestCase):
    def test_year_backfilled(self):
        rules = classify.load_rules(MAP)
        rows, meta = pipeline.parse_file(YEARLESS, "mystery__test.csv", rules)
        self.assertEqual(meta["row_count"], 3)
        self.assertTrue(all(r["date"].startswith("2026") for r in rows))


class TestTxnId(unittest.TestCase):
    def test_deterministic(self):
        a = enrich.make_txn_id("2026-07-01", "uob-one", -12.4, "GRAB")
        b = enrich.make_txn_id("2026-07-01", "uob-one", -12.40, "grab")
        self.assertEqual(a, b, "trailing zero and case must not change the id")

    def test_distinct_inputs_differ(self):
        a = enrich.make_txn_id("2026-07-01", "uob-one", -12.40, "GRAB")
        b = enrich.make_txn_id("2026-07-02", "uob-one", -12.40, "GRAB")
        self.assertNotEqual(a, b)


class TestClassify(unittest.TestCase):
    def setUp(self):
        self.rules = [
            {"pattern": "NETFLIX", "match_type": "contains", "merchant": "Netflix",
             "category": "Subscriptions", "type": "expense", "notes": ""},
            {"pattern": "GRAB", "match_type": "prefix", "merchant": "Grab",
             "category": "Transport", "type": "expense", "notes": ""},
        ]

    def test_prefix_ignores_decorative_star(self):
        merchant, _, _, confidence = classify.classify("Grab* A-9E3RX", self.rules)
        self.assertEqual(merchant, "Grab")
        self.assertEqual(confidence, "high")

    def test_miss_is_low_confidence_with_no_category(self):
        merchant, category, txn_type, confidence = classify.classify(
            "SOME NEW SHOP", self.rules)
        self.assertEqual(confidence, "low")
        self.assertEqual(category, "")
        self.assertEqual(txn_type, "expense")

    def test_pattern_suggestion_strips_ids_and_geography(self):
        self.assertEqual(
            classify.suggest_pattern("SUBWAY SINGAPORE SG Ref No: 74103806"),
            "SUBWAY")
        self.assertEqual(
            classify.suggest_pattern("BUS/MRT 864059308 SINGAPORE SG"),
            "BUS/MRT")

    def test_breadth_counts_matches(self):
        descriptions = ["PAYNOW-FAST OTHR 111", "PAYNOW-FAST OTHR 222", "GRAB 1"]
        self.assertEqual(
            classify.breadth("PAYNOW-FAST OTHR", "contains", descriptions), 2)


class TestTransferPairs(unittest.TestCase):
    def test_opposite_legs_across_accounts_are_linked(self):
        rows = [
            {"date": "2026-07-03", "account_id": "uob-one", "amount_sgd": -3000.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 0},
            {"date": "2026-07-05", "account_id": "uob-one-card", "amount_sgd": 3000.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 1},
        ]
        self.assertEqual(enrich.assign_transfer_pairs(rows), 1)
        self.assertEqual(rows[0]["transfer_pair_id"], rows[1]["transfer_pair_id"])

    def test_same_account_is_not_a_pair(self):
        rows = [
            {"date": "2026-07-03", "account_id": "uob-one", "amount_sgd": -50.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 0},
            {"date": "2026-07-03", "account_id": "uob-one", "amount_sgd": 50.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 1},
        ]
        self.assertEqual(enrich.assign_transfer_pairs(rows), 0)

    def test_outside_window_is_not_a_pair(self):
        rows = [
            {"date": "2026-07-01", "account_id": "a", "amount_sgd": -10.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 0},
            {"date": "2026-07-20", "account_id": "b", "amount_sgd": 10.0,
             "type": "transfer", "transfer_pair_id": "", "_row_index": 1},
        ]
        self.assertEqual(enrich.assign_transfer_pairs(rows), 0)


class TestUnknownFormat(unittest.TestCase):
    def test_missing_header_reports_error_not_crash(self):
        rules = classify.load_rules(MAP)
        rows, meta = pipeline.parse_file(b"just,some,junk\n1,2,3\n", "x.csv", rules)
        self.assertEqual(rows, [])
        self.assertIn("No header row", meta["error"])

    def test_corrupt_bytes_report_error(self):
        rules = classify.load_rules(MAP)
        rows, meta = pipeline.parse_file(b"PK\x03\x04garbage", "x.xlsx", rules)
        self.assertEqual(rows, [])
        self.assertIsNotNone(meta["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
