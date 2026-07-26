"""
Local-only web UI for the finance parser.

Binds to 127.0.0.1 so it is unreachable from any other device, including
others on your own wifi. Makes no outbound network calls whatsoever — you can
verify this by running it with wifi switched off.
"""

import os
import secrets
import webbrowser
from threading import Timer

from flask import Flask, jsonify, request, Response, render_template

from parser import classify, emit, pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MERCHANT_MAP = os.path.join(BASE_DIR, "data", "merchant_map.csv")
CATEGORIES_FILE = os.path.join(BASE_DIR, "data", "categories.txt")

# macOS runs AirPlay Receiver on 5000, which steals the port silently.
PORT = 8765
HOST = "127.0.0.1"

app = Flask(__name__)

# Parsed batches live in memory only, keyed by a random token. Restarting the
# server clears everything — nothing is written to disk except merchant_map.csv
# and the CSVs you explicitly download.
SESSIONS = {}


def load_categories():
    if not os.path.exists(CATEGORIES_FILE):
        return []
    with open(CATEGORIES_FILE, encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip()]


def public_rows(rows):
    """Strip internal fields before sending to the browser."""
    return [{k: v for k, v in row.items() if not k.startswith("_")} for row in rows]


def summarise(result):
    rows = result["rows"]
    spend = sum(abs(r["amount_sgd"]) for r in rows
                if r["type"] in ("expense", "fee"))
    income = sum(r["amount_sgd"] for r in rows if r["type"] == "income")

    return {
        "transactions": len(rows),
        "low_confidence": sum(1 for r in rows if r["confidence"] == "low"),
        "transfer_pairs": result["transfer_pairs"],
        "duplicates": result["duplicates"],
        "spend": round(spend, 2),
        "income": round(income, 2),
        "months": sorted({r["month"] for r in rows if r["month"]}),
    }


@app.after_request
def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/")
def index():
    return render_template("index.html", categories=load_categories())


@app.route("/api/inspect", methods=["POST"])
def api_inspect():
    """Diagnostics for a file that won't parse."""
    from parser import reader

    uploaded = request.files.getlist("files")
    if not uploaded:
        return jsonify({"error": "No files received"}), 400

    return jsonify({
        "reports": [
            reader.inspect(item.read(), item.filename) for item in uploaded
        ]
    })


@app.route("/api/parse", methods=["POST"])
def api_parse():
    uploaded = request.files.getlist("files")
    if not uploaded:
        return jsonify({"error": "No files received"}), 400

    files = [(item.filename, item.read()) for item in uploaded]

    try:
        result = pipeline.parse_batch(files, MERCHANT_MAP)
    except Exception as error:  # a bad file should not take down the server
        return jsonify({"error": f"Parse failed: {error}"}), 500

    token = secrets.token_urlsafe(16)
    SESSIONS[token] = result

    return jsonify({
        "token": token,
        "summary": summarise(result),
        "files": result["files"],
        "unknowns": result["unknowns"],
        "balances": result["balances"],
        "accounts_needing_balance": result["accounts_needing_balance"],
        "rows": public_rows(result["rows"]),
    })


@app.route("/api/rules", methods=["POST"])
def api_rules():
    """Append confirmed rules, then re-classify the batch in place."""
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    rules = payload.get("rules") or []

    result = SESSIONS.get(token)
    if not result:
        return jsonify({"error": "Session expired — parse the files again"}), 400

    written = classify.append_rules(MERCHANT_MAP, rules)
    pipeline.reclassify(result["rows"], MERCHANT_MAP)
    result["unknowns"] = pipeline.collect_unknowns(result["rows"])

    return jsonify({
        "rules_written": written,
        "summary": summarise(result),
        "unknowns": result["unknowns"],
        "rows": public_rows(result["rows"]),
    })


@app.route("/api/balances", methods=["POST"])
def api_balances():
    """Accept manually typed closing balances for accounts with no balance column."""
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    entries = payload.get("balances") or []

    result = SESSIONS.get(token)
    if not result:
        return jsonify({"error": "Session expired — parse the files again"}), 400

    manual = []
    for entry in entries:
        try:
            value = float(entry.get("balance_sgd"))
        except (TypeError, ValueError):
            continue

        month = (entry.get("month") or "").strip()
        as_of = (entry.get("as_of") or "").strip()
        if not month and as_of:
            month = as_of[:7]

        manual.append({
            "month": month,
            "account_id": entry.get("account_id", ""),
            "balance_sgd": value,
            "source": "manual",
            "as_of": as_of,
        })

    detected = [b for b in result["balances"] if b["source"] == "statement"]
    result["balances"] = detected + manual

    return jsonify({"balances": result["balances"]})


@app.route("/api/download/<kind>")
def api_download(kind):
    token = request.args.get("token")
    result = SESSIONS.get(token)
    if not result:
        return jsonify({"error": "Session expired — parse the files again"}), 400

    if kind == "transactions":
        body = emit.transactions_csv(result["rows"])
        filename = "transactions.csv"
    elif kind == "balances":
        body = emit.balances_csv(result["balances"])
        filename = "balances.csv"
    else:
        return jsonify({"error": "Unknown file"}), 404

    return Response(
        body,
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def open_browser():
    webbrowser.open(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    print(f"\n  Finance parser running at http://{HOST}:{PORT}")
    print("  Local only — not reachable from other devices.")
    print("  Press Ctrl+C to stop.\n")
    Timer(1.2, open_browser).start()
    app.run(host=HOST, port=PORT, debug=False)
