"""
Uber Price Estimates Scraper
----------------------------
Polls the Uber Price Estimates API (GET /v1.2/estimates/price) on a
configurable schedule and appends the results to a CSV file.

Environment variables (see .env.example):
  UBER_SERVER_TOKEN   – Uber server token (required unless MOCK_MODE=true)
  DATA_DIR            – Directory where rides.csv and config.json are written
                        (default: ../data)
  MOCK_MODE           – Set to "true" to generate synthetic data without a
                        real Uber token (useful for demos / CI)
"""

import csv
import json
import logging
import os
import random
import time
from datetime import datetime
from pathlib import Path

import requests
import schedule
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent.parent / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

CSV_FILE = DATA_DIR / "rides.csv"
CONFIG_FILE = DATA_DIR / "config.json"

# ---------------------------------------------------------------------------
# Default configuration (written to config.json on first run)
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "start_latitude": 37.7749,
    "start_longitude": -122.4194,
    "end_latitude": 37.3382,
    "end_longitude": -121.8863,
    "start_time": "07:00",
    "end_time": "09:00",
    "interval_minutes": 1,
    "seat_count": 2,
}

CSV_HEADERS = [
    "timestamp",
    "product_id",
    "display_name",
    "start_lat",
    "start_lng",
    "end_lat",
    "end_lng",
    "low_estimate",
    "high_estimate",
    "surge_multiplier",
    "duration_seconds",
    "distance_miles",
    "currency_code",
]

# ---------------------------------------------------------------------------
# Uber API
# ---------------------------------------------------------------------------

UBER_BASE_URL = "https://api.uber.com"
UBER_PRICE_ESTIMATES_PATH = "/v1.2/estimates/price"

def _get_server_token() -> str:
    """Return the Uber server token from the environment."""
    token = os.getenv("UBER_SERVER_TOKEN", "").strip()
    if not token:
        raise EnvironmentError(
            "UBER_SERVER_TOKEN is not set. "
            "Set it in your .env file or export it as an environment variable. "
            "Set MOCK_MODE=true to run without a real token."
        )
    return token


def _fetch_price_estimates(config: dict) -> list[dict]:
    """Call the Uber Price Estimates endpoint and return a list of estimate dicts."""
    token = _get_server_token()
    params = {
        "start_latitude": config["start_latitude"],
        "start_longitude": config["start_longitude"],
        "end_latitude": config["end_latitude"],
        "end_longitude": config["end_longitude"],
        "seat_count": config.get("seat_count", 2),
    }
    headers = {
        "Authorization": f"Token {token}",
        "Accept-Language": "en_US",
        "Content-Type": "application/json",
    }
    url = f"{UBER_BASE_URL}{UBER_PRICE_ESTIMATES_PATH}"
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json().get("prices", [])


# ---------------------------------------------------------------------------
# Mock data (used when MOCK_MODE=true)
# ---------------------------------------------------------------------------

_MOCK_PRODUCTS = [
    ("uberX", "UberX"),
    ("uberXL", "UberXL"),
    ("uberBLACK", "Uber Black"),
    ("uberPOOL", "UberPool"),
]


def _mock_price_estimates(config: dict) -> list[dict]:
    """Generate plausible synthetic price estimates for demo / CI purposes."""
    base_prices = {"uberX": 8, "uberXL": 14, "uberBLACK": 22, "uberPOOL": 6}
    estimates = []
    hour = datetime.now().hour
    surge = 1.0
    if 7 <= hour < 9 or 17 <= hour < 19:
        surge = round(random.uniform(1.2, 2.4), 1)

    for product_id, display_name in _MOCK_PRODUCTS:
        base = base_prices[product_id]
        low = round(base * surge * random.uniform(0.9, 1.0), 2)
        high = round(base * surge * random.uniform(1.0, 1.15), 2)
        estimates.append(
            {
                "product_id": product_id,
                "display_name": display_name,
                "low_estimate": low,
                "high_estimate": high,
                "surge_multiplier": surge,
                "duration": random.randint(1800, 4500),
                "distance": round(random.uniform(15, 55), 1),
                "currency_code": "USD",
            }
        )
    return estimates


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _ensure_csv_headers() -> None:
    """Write CSV header row if the file does not yet exist."""
    if not CSV_FILE.exists():
        with CSV_FILE.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
            writer.writeheader()
        log.info("Created CSV file: %s", CSV_FILE)


def _append_rows(rows: list[dict]) -> None:
    """Append a list of estimate dicts to the CSV file."""
    with CSV_FILE.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS, extrasaction="ignore")
        writer.writerows(rows)
    log.debug("Appended %d row(s) to %s", len(rows), CSV_FILE)


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def load_config() -> dict:
    """Load config from config.json, falling back to DEFAULT_CONFIG."""
    if CONFIG_FILE.exists():
        try:
            with CONFIG_FILE.open() as f:
                saved = json.load(f)
            # Merge with defaults so new keys are always present
            merged = {**DEFAULT_CONFIG, **saved}
            return merged
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Failed to read config.json (%s). Using defaults.", exc)
    return dict(DEFAULT_CONFIG)


def save_config(config: dict) -> None:
    """Persist config to config.json."""
    with CONFIG_FILE.open("w") as f:
        json.dump(config, f, indent=2)
    log.info("Config saved to %s", CONFIG_FILE)


# ---------------------------------------------------------------------------
# Core scrape job
# ---------------------------------------------------------------------------

def _within_window(config: dict) -> bool:
    """Return True if the current local time is within the configured window."""
    now = datetime.now().time()
    try:
        start_h, start_m = map(int, config["start_time"].split(":"))
        end_h, end_m = map(int, config["end_time"].split(":"))
    except (KeyError, ValueError):
        return True  # If config is malformed, always run
    from datetime import time as dtime

    start = dtime(start_h, start_m)
    end = dtime(end_h, end_m)
    return start <= now <= end


def scrape_once() -> None:
    """Fetch price estimates and append to CSV (if within the time window)."""
    config = load_config()
    if not _within_window(config):
        log.debug("Outside time window (%s–%s). Skipping.", config["start_time"], config["end_time"])
        return

    log.info(
        "Fetching estimates  start=(%.4f, %.4f)  end=(%.4f, %.4f)",
        config["start_latitude"],
        config["start_longitude"],
        config["end_latitude"],
        config["end_longitude"],
    )

    mock_mode = os.getenv("MOCK_MODE", "false").lower() in ("true", "1", "yes")
    try:
        if mock_mode:
            estimates = _mock_price_estimates(config)
        else:
            estimates = _fetch_price_estimates(config)
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to fetch estimates: %s", exc)
        return

    if not estimates:
        log.warning("API returned no price estimates.")
        return

    timestamp = datetime.now().isoformat(timespec="seconds")
    rows = [
        {
            "timestamp": timestamp,
            "product_id": e.get("product_id", ""),
            "display_name": e.get("display_name", ""),
            "start_lat": config["start_latitude"],
            "start_lng": config["start_longitude"],
            "end_lat": config["end_latitude"],
            "end_lng": config["end_longitude"],
            "low_estimate": e.get("low_estimate", ""),
            "high_estimate": e.get("high_estimate", ""),
            "surge_multiplier": e.get("surge_multiplier", 1.0),
            "duration_seconds": e.get("duration", ""),
            "distance_miles": e.get("distance", ""),
            "currency_code": e.get("currency_code", "USD"),
        }
        for e in estimates
    ]
    _ensure_csv_headers()
    _append_rows(rows)
    log.info("Recorded %d estimate(s) at %s", len(rows), timestamp)


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

def run_scheduler() -> None:
    """Run the scraper on the configured interval (default: every 1 minute)."""
    config = load_config()
    interval = max(1, int(config.get("interval_minutes", 1)))

    log.info(
        "Scheduler started – running every %d minute(s) between %s and %s.",
        interval,
        config["start_time"],
        config["end_time"],
    )

    schedule.every(interval).minutes.do(scrape_once)

    # Run once immediately so we don't wait for the first interval
    scrape_once()

    while True:
        # Reload config on every tick so live changes take effect
        config = load_config()
        new_interval = max(1, int(config.get("interval_minutes", 1)))
        if new_interval != interval:
            log.info("Interval changed %d → %d minute(s). Rescheduling.", interval, new_interval)
            schedule.clear()
            interval = new_interval
            schedule.every(interval).minutes.do(scrape_once)

        schedule.run_pending()
        time.sleep(10)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Initialise config on first run
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        log.info("Wrote default config to %s", CONFIG_FILE)

    _ensure_csv_headers()
    run_scheduler()
