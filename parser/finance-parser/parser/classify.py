"""
Merchant map lookup — a direct port of Step 4 of SKILL.md.

Match precedence is exact, then prefix, then contains, then regex. The first
match wins, so specific rules must sit above general ones within the same
match type. Nothing is guessed: a description with no matching rule comes back
as low confidence with no category, for you to label.
"""

import csv
import os
import re

MATCH_ORDER = ["exact", "prefix", "contains", "regex"]

FIELDNAMES = ["pattern", "match_type", "merchant", "category", "type", "notes"]

UNKNOWN_CATEGORY = ""
UNKNOWN_TYPE = "expense"  # safest default: counts as spending until corrected


def load_rules(path):
    """Read merchant_map.csv into a list of rule dicts."""
    if not os.path.exists(path):
        return []

    with open(path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        rules = []
        for row in reader:
            pattern = (row.get("pattern") or "").strip()
            if not pattern:
                continue
            rules.append({
                "pattern": pattern,
                "match_type": (row.get("match_type") or "contains").strip().lower(),
                "merchant": (row.get("merchant") or "").strip(),
                "category": (row.get("category") or "").strip(),
                "type": (row.get("type") or "expense").strip().lower(),
                "notes": (row.get("notes") or "").strip(),
            })
        return rules


def append_rules(path, new_rules):
    """
    Append confirmed rules to merchant_map.csv, skipping any pattern that is
    already present so repeated saves can't create duplicates.
    """
    existing = {r["pattern"].lower() for r in load_rules(path)}
    to_write = [r for r in new_rules
                if r.get("pattern") and r["pattern"].lower() not in existing]

    if not to_write:
        return 0

    file_exists = os.path.exists(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        if not file_exists:
            writer.writeheader()
        for rule in to_write:
            writer.writerow({
                "pattern": rule.get("pattern", ""),
                "match_type": rule.get("match_type", "contains"),
                "merchant": rule.get("merchant", ""),
                "category": rule.get("category", ""),
                "type": rule.get("type", "expense"),
                "notes": rule.get("notes", ""),
            })

    return len(to_write)


def _matches(description, rule):
    haystack = description.lower()
    pattern = rule["pattern"].lower()

    match_type = rule["match_type"]
    if match_type == "exact":
        return haystack == pattern
    if match_type == "prefix":
        # Trailing '*' in a pattern is decorative — 'GRAB *' means starts-with.
        return haystack.startswith(pattern.rstrip("* ").strip())
    if match_type == "contains":
        return pattern in haystack
    if match_type == "regex":
        try:
            return re.search(rule["pattern"], description, re.IGNORECASE) is not None
        except re.error:
            return False
    return False


def classify(description, rules):
    """
    Return (merchant, category, type, confidence).
    A miss yields the cleaned description as the merchant and low confidence.
    """
    description = description or ""

    for match_type in MATCH_ORDER:
        for rule in rules:
            if rule["match_type"] != match_type:
                continue
            if _matches(description, rule):
                return (
                    rule["merchant"] or description,
                    rule["category"],
                    rule["type"] or "expense",
                    "high",
                )

    return (description, UNKNOWN_CATEGORY, UNKNOWN_TYPE, "low")

# Tokens that carry no merchant information and only ever appear as noise.
GEOGRAPHY_TOKENS = {"singapore", "sg", "s'pore", "spore"}


def suggest_pattern(description):
    """
    Propose a reusable pattern for an unmatched description.

    Bank narratives carry per-transaction noise: reference numbers, terminal
    IDs, order codes. Those are stripped so the pattern still matches next
    month. Where a description contains nothing but noise (a masked PayNow,
    for instance) the result will be broad — check the breadth count before
    saving it.
    """
    text = re.sub(r"\s+", " ", str(description or "").replace("\n", " ")).strip()
    if not text:
        return ""

    # Everything after a reference marker is per-transaction.
    text = re.split(r"(?i)\bref(?:erence)?\s*(?:no|num|number)?\s*[:.]",
                    text)[0].strip()

    kept = []
    for token in text.split(" "):
        bare = token.strip()
        if not bare:
            continue

        lowered = bare.lower().strip(".,;:")

        # Pure numbers and long alphanumeric IDs are transaction-specific.
        if re.fullmatch(r"[-+]?[0-9][0-9,.\-]*", bare):
            continue
        if len(bare) >= 6 and any(c.isdigit() for c in bare):
            continue
        if lowered in GEOGRAPHY_TOKENS:
            continue

        kept.append(bare)
        if len(kept) >= 4:
            break

    return " ".join(kept) if kept else text


def breadth(pattern, match_type, descriptions):
    """
    How many of the given descriptions a proposed rule would match. Shown in
    the UI so an over-broad pattern is visible before it is saved.
    """
    if not pattern:
        return 0

    rule = {"pattern": pattern, "match_type": (match_type or "contains").lower()}
    return sum(1 for description in descriptions if _matches(description, rule))
