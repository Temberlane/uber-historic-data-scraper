"""
Uber Historic Data Scraper – Flask Backend
------------------------------------------
Provides a REST API consumed by the React dashboard and embeds an
APScheduler instance so a single `python app.py` starts both the
web server and the background scraper.

Endpoints
---------
GET  /api/data          Return all CSV rows as JSON (newest first).
GET  /api/config        Return current scraper configuration.
POST /api/config        Update configuration and reschedule the scraper.
GET  /api/status        Return whether the embedded scheduler is running.
POST /api/scrape/now    Trigger an immediate scrape (outside time window).
"""

import csv
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Paths & bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR.parent / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Ensure the scraper module is importable even when the backend is started
# from a different working directory.
SCRAPER_DIR = BASE_DIR.parent / "scraper"
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

from scraper import (  # noqa: E402 – import after path fixup
    CSV_FILE,
    CSV_HEADERS,
    CONFIG_FILE,
    DEFAULT_CONFIG,
    _ensure_csv_headers,
    load_config,
    save_config,
    scrape_once,
)

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__, static_folder=str(BASE_DIR.parent / "frontend" / "dist"), static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---------------------------------------------------------------------------
# APScheduler
# ---------------------------------------------------------------------------

scheduler = BackgroundScheduler(daemon=True)
_current_interval: int = 1  # minutes


def _reschedule(interval_minutes: int) -> None:
    """Replace the existing scrape job with a new interval."""
    global _current_interval
    scheduler.remove_all_jobs()
    scheduler.add_job(
        scrape_once,
        trigger="interval",
        minutes=interval_minutes,
        id="scrape_job",
        replace_existing=True,
    )
    _current_interval = interval_minutes
    log.info("Scraper rescheduled to every %d minute(s).", interval_minutes)


# ---------------------------------------------------------------------------
# API – data
# ---------------------------------------------------------------------------


@app.route("/api/data")
def get_data():
    """Return all rows from rides.csv as a JSON array (newest first)."""
    if not CSV_FILE.exists():
        return jsonify([])

    rows = []
    with CSV_FILE.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    rows.reverse()  # newest first
    return jsonify(rows)


# ---------------------------------------------------------------------------
# API – config
# ---------------------------------------------------------------------------


@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify(load_config())


@app.route("/api/config", methods=["POST"])
def post_config():
    """Update the scraper config.  Only supplied keys are overwritten."""
    body = request.get_json(silent=True) or {}

    # Validate numeric fields
    float_fields = ("start_latitude", "start_longitude", "end_latitude", "end_longitude")
    int_fields = ("interval_minutes", "seat_count")

    config = load_config()
    errors = {}

    for field in float_fields:
        if field in body:
            try:
                config[field] = float(body[field])
            except (TypeError, ValueError):
                errors[field] = "Must be a number."

    for field in int_fields:
        if field in body:
            try:
                config[field] = int(body[field])
            except (TypeError, ValueError):
                errors[field] = "Must be an integer."

    for time_field in ("start_time", "end_time"):
        if time_field in body:
            val = str(body[time_field]).strip()
            try:
                datetime.strptime(val, "%H:%M")
                config[time_field] = val
            except ValueError:
                errors[time_field] = "Must be HH:MM (24-hour)."

    if errors:
        return jsonify({"errors": errors}), 400

    save_config(config)

    # Reschedule if the interval changed
    new_interval = max(1, config.get("interval_minutes", 1))
    if new_interval != _current_interval:
        _reschedule(new_interval)

    return jsonify(config)


# ---------------------------------------------------------------------------
# API – scraper status & manual trigger
# ---------------------------------------------------------------------------


@app.route("/api/status")
def get_status():
    job = scheduler.get_job("scrape_job")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    return jsonify(
        {
            "running": scheduler.running,
            "interval_minutes": _current_interval,
            "next_run": next_run,
        }
    )


@app.route("/api/scrape/now", methods=["POST"])
def scrape_now():
    """Trigger a scrape immediately, bypassing the time-window check."""
    try:
        scrape_once()
        return jsonify({"ok": True, "message": "Scrape completed."})
    except Exception as exc:  # noqa: BLE001
        log.error("Manual scrape failed: %s", exc)
        return jsonify({"ok": False, "message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Serve React SPA (production build)
# ---------------------------------------------------------------------------


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    dist_dir = Path(app.static_folder)
    target = dist_dir / path
    if path and target.exists():
        return app.send_static_file(path)
    index = dist_dir / "index.html"
    if index.exists():
        return app.send_static_file("index.html")
    return jsonify({"message": "React build not found. Run `npm run build` inside frontend/."}), 404


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _ensure_csv_headers()

    config = load_config()
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)

    interval = max(1, int(config.get("interval_minutes", 1)))
    _reschedule(interval)
    scheduler.start()
    log.info("APScheduler started. First scrape will run in %d minute(s).", interval)

    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() in ("true", "1")
    log.info("Flask backend listening on http://0.0.0.0:%d", port)
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
