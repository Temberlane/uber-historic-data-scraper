"""
Uber Price Scraper – Web Scraping Edition
-----------------------------------------
Scrapes the Uber mobile product-selection page with Playwright and appends
results to a CSV file on a configurable schedule.

Environment variables (see .env.example):
  DATA_DIR   – Directory where rides.csv and config.json are written
               (default: ../data)
  MOCK_MODE  – Set to "true" to generate synthetic data without a real browser
               (useful for demos / CI)
"""

import csv
import json
import logging
import os
import random
import time
from datetime import datetime
from pathlib import Path

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
# Commute URL (hardcoded for 36 Robinson Ave → 285 Coventry Rd, Ottawa)
# ---------------------------------------------------------------------------

COMMUTE_URL = (
    "https://m.uber.com/go/product-selection"
    "?drop%5B0%5D=%7B%22addressLine1%22%3A%22285%20Coventry%20Rd%22%2C%22addressLine2%22%3A"
    "%22Ottawa%2C%20ON%20K1K%22%2C%22id%22%3A%22a76cea35-29c0-5e35-c647-d1b965a5c5e9%22%2C"
    "%22source%22%3A%22SEARCH%22%2C%22latitude%22%3A45.421721%2C%22longitude%22%3A-75.6540312%2C"
    "%22provider%22%3A%22uber_places%22%7D"
    "&pickup=%7B%22addressLine1%22%3A%2236%20Robinson%20Ave%22%2C%22addressLine2%22%3A"
    "%22Ottawa%2C%20ON%20K1N%208N9%22%2C%22id%22%3A%226459d69f-8ebd-c197-8c44-4326c152fc92%22%2C"
    "%22source%22%3A%22SEARCH%22%2C%22latitude%22%3A45.4184721%2C%22longitude%22%3A-75.6662848%2C"
    "%22provider%22%3A%22uber_places%22%7D"
    "&vehicle=1624"
)

# Hardcoded route coordinates (Ottawa commute)
ROUTE_START_LAT = 45.4184721
ROUTE_START_LNG = -75.6662848
ROUTE_END_LAT = 45.421721
ROUTE_END_LNG = -75.6540312

# ---------------------------------------------------------------------------
# Default configuration (written to config.json on first run)
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "start_latitude": ROUTE_START_LAT,
    "start_longitude": ROUTE_START_LNG,
    "end_latitude": ROUTE_END_LAT,
    "end_longitude": ROUTE_END_LNG,
    "start_time": "07:00",
    "end_time": "09:30",
    "interval_minutes": 5,
    "seat_count": 1,
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
# Web scraping via Playwright
# ---------------------------------------------------------------------------


def _scrape_web_prices() -> list[dict]:
    """Launch a headless browser, load the Uber product-selection page,
    intercept internal API responses, and return a list of price estimate dicts.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout  # noqa: PLC0415

    estimates: list[dict] = []
    api_responses: list[tuple[str, object]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.0 Mobile/15E148 Safari/604.1"
            ),
            viewport={"width": 390, "height": 844},
            locale="en-CA",
        )
        page = context.new_page()

        # Capture all JSON responses from Uber domains
        def _on_response(response):
            if "uber.com" not in response.url:
                return
            content_type = response.headers.get("content-type", "")
            if "json" not in content_type:
                return
            try:
                body = response.json()
                api_responses.append((response.url, body))
            except Exception:
                pass

        page.on("response", _on_response)

        try:
            page.goto(COMMUTE_URL, timeout=30_000, wait_until="networkidle")
        except PWTimeout:
            log.warning("Page load timed out – proceeding with partial data")

        # Extra wait to let any lazy-loaded data arrive
        page.wait_for_timeout(2_000)

        # 1) Try to extract prices from intercepted API responses
        for url, body in api_responses:
            found = _parse_uber_api_response(body)
            if found:
                log.info("Extracted %d product(s) from API response: %s", len(found), url)
                estimates = found
                break

        # 2) Fall back to DOM parsing if nothing was captured
        if not estimates:
            log.info("No API response captured – falling back to DOM parsing")
            estimates = _parse_dom_prices(page)

        browser.close()

    return estimates


def _parse_uber_api_response(data: object) -> list[dict]:
    """Recursively walk a JSON payload looking for Uber product + price objects."""
    results: list[dict] = []

    def _walk(obj):
        if isinstance(obj, dict):
            # Heuristic: an object has a display name AND some fare info
            name = (
                obj.get("displayName")
                or obj.get("name")
                or obj.get("vehicleViewDisplayName")
                or obj.get("title")
            )
            fare = obj.get("fare") or obj.get("estimate") or obj.get("fareEstimate") or {}
            if isinstance(fare, dict):
                low = fare.get("low") or fare.get("lowEstimate") or fare.get("minimum")
                high = fare.get("high") or fare.get("highEstimate") or fare.get("maximum")
                currency = fare.get("currencyCode", "CAD")
            else:
                low = None
                high = None
                currency = "CAD"

            # Also check for flat price fields on the object itself
            if not low:
                low = obj.get("lowEstimate") or obj.get("priceMin") or obj.get("minFare")
            if not high:
                high = obj.get("highEstimate") or obj.get("priceMax") or obj.get("maxFare")
            if not currency:
                currency = obj.get("currencyCode", "CAD")

            if name and (low is not None or high is not None):
                try:
                    low_f = float(low) if low is not None else None
                    high_f = float(high) if high is not None else None
                except (TypeError, ValueError):
                    low_f = high_f = None

                if low_f is not None or high_f is not None:
                    results.append(
                        {
                            "product_id": obj.get("productId") or obj.get("id") or str(name).lower().replace(" ", "_"),
                            "display_name": name,
                            "low_estimate": low_f,
                            "high_estimate": high_f,
                            "surge_multiplier": float(obj.get("surgeMultiplier", 1.0)),
                            "duration": obj.get("duration") or obj.get("durationSeconds"),
                            "distance": obj.get("distance") or obj.get("distanceMiles"),
                            "currency_code": currency,
                        }
                    )
                    return  # Don't recurse into this node further

            for value in obj.values():
                _walk(value)

        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(data)
    return results


def _parse_dom_prices(page) -> list[dict]:
    """Parse product prices directly from the rendered DOM."""
    import re  # noqa: PLC0415

    results: list[dict] = []

    # Selectors likely to wrap individual vehicle/product cards
    candidate_selectors = [
        '[data-testid*="vehicle"]',
        '[data-testid*="product"]',
        '[class*="VehicleView"]',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        '[class*="vehicle-card"]',
        '[class*="RideOption"]',
    ]

    for selector in candidate_selectors:
        cards = page.query_selector_all(selector)
        if not cards:
            continue

        for card in cards:
            text = card.inner_text()
            # Match price ranges like "$12–15", "$12 - $15", "CAD 12 - 15"
            price_match = re.search(
                r"[\$£€]?\s*(\d+(?:\.\d+)?)\s*[-–]\s*[\$£€]?\s*(\d+(?:\.\d+)?)", text
            )

            # Try a heading element for the product name
            name_el = card.query_selector('[class*="name"], [class*="title"], h2, h3, h4')
            name = name_el.inner_text().strip() if name_el else ""
            if not name:
                lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
                name = lines[0] if lines else ""

            if not name or not price_match:
                continue

            results.append(
                {
                    "product_id": name.lower().replace(" ", "_"),
                    "display_name": name,
                    "low_estimate": float(price_match.group(1)),
                    "high_estimate": float(price_match.group(2)),
                    "surge_multiplier": 1.0,
                    "duration": None,
                    "distance": None,
                    "currency_code": "CAD",
                }
            )

        if results:
            break

    return results


# ---------------------------------------------------------------------------
# Mock data (used when MOCK_MODE=true)
# ---------------------------------------------------------------------------

_MOCK_PRODUCTS = [
    ("uberX", "UberX"),
    ("uberXL", "UberXL"),
    ("uberBLACK", "Uber Black"),
    ("uberComfort", "Uber Comfort"),
]


def _mock_price_estimates() -> list[dict]:
    """Generate plausible synthetic price estimates for demo / CI purposes."""
    base_prices = {"uberX": 9, "uberXL": 15, "uberBLACK": 24, "uberComfort": 13}
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
                "duration": random.randint(300, 900),
                "distance": round(random.uniform(1.5, 4.0), 1),
                "currency_code": "CAD",
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
            return {**DEFAULT_CONFIG, **saved}
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
        return True
    from datetime import time as dtime  # noqa: PLC0415

    return dtime(start_h, start_m) <= now <= dtime(end_h, end_m)


def scrape_once() -> None:
    """Fetch price estimates and append to CSV (if within the time window)."""
    config = load_config()
    if not _within_window(config):
        log.debug(
            "Outside time window (%s–%s). Skipping.",
            config["start_time"],
            config["end_time"],
        )
        return

    log.info("Scraping Uber prices for Ottawa commute route")

    mock_mode = os.getenv("MOCK_MODE", "false").lower() in ("true", "1", "yes")
    try:
        if mock_mode:
            estimates = _mock_price_estimates()
        else:
            estimates = _scrape_web_prices()
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to scrape prices: %s", exc)
        return

    if not estimates:
        log.warning("No price estimates found.")
        return

    timestamp = datetime.now().isoformat(timespec="seconds")
    rows = [
        {
            "timestamp": timestamp,
            "product_id": e.get("product_id", ""),
            "display_name": e.get("display_name", ""),
            "start_lat": ROUTE_START_LAT,
            "start_lng": ROUTE_START_LNG,
            "end_lat": ROUTE_END_LAT,
            "end_lng": ROUTE_END_LNG,
            "low_estimate": e.get("low_estimate", ""),
            "high_estimate": e.get("high_estimate", ""),
            "surge_multiplier": e.get("surge_multiplier", 1.0),
            "duration_seconds": e.get("duration", ""),
            "distance_miles": e.get("distance", ""),
            "currency_code": e.get("currency_code", "CAD"),
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
    """Run the scraper on a randomized interval (re-read config each cycle)."""
    config = load_config()
    interval = max(1, int(config.get("interval_minutes", 5)))

    log.info(
        "Scheduler started – base interval %d min, randomised ±1 min, "
        "active window %s–%s.",
        interval,
        config["start_time"],
        config["end_time"],
    )

    schedule.every(interval).minutes.do(scrape_once)
    scrape_once()

    while True:
        config = load_config()
        new_interval = max(1, int(config.get("interval_minutes", 5)))
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
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        log.info("Wrote default config to %s", CONFIG_FILE)

    _ensure_csv_headers()
    run_scheduler()
