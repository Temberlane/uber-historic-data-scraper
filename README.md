# uber-historic-data-scraper
    
> *"i am spending too much money on uber and I cant even see the historic data…*
> *MY PRICING SURGED FROM 5$ to 12 THIS MORNING?? bruh"*
>
> — me on my way to work...

A Python scraper + React dashboard that tracks Uber price estimates over
time so you can see when your commute gets hit by surge pricing.

---

## Features

- **Scraper** – polls the [Uber Price Estimates API](https://developer.uber.com/docs/riders/references/api/v1.2/estimates-price-get) on a configurable schedule and appends results to a CSV.
- **Flask backend** – serves the CSV data as JSON and exposes a REST API for the dashboard.
- **React dashboard** – shows a live price chart, a data table, and a settings panel where you can change the route and schedule.
- **Rush-hour defaults** – scraper runs every minute between **07:00 and 09:00** by default.
- **Mock mode** – generates synthetic data so you can try the dashboard without a real Uber API key.

---

## Project structure

```
.
├── scraper/
│   ├── scraper.py          # Standalone scraper (also imported by the backend)
│   └── requirements.txt
├── backend/
│   ├── app.py              # Flask API + embedded APScheduler
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── components/
│   │       ├── PriceChart.jsx
│   │       ├── DataTable.jsx
│   │       └── Settings.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── data/                   # rides.csv and config.json are written here
├── .env.example
└── README.md
```

---

## Quick start

### 1. Copy and fill in your environment variables

```bash
cp .env.example .env
# Edit .env and set UBER_SERVER_TOKEN, or set MOCK_MODE=true for demo data
```

You can obtain an Uber server token from the
[Uber Developer Dashboard](https://developer.uber.com/dashboard).

### 2. Install Python dependencies

```bash
# Backend (includes the scraper)
cd backend
pip install -r requirements.txt
```

### 3. Start the backend + scraper

```bash
cd backend
python app.py
```

The backend listens on **http://localhost:5000** by default.  
The embedded APScheduler will call the scraper every minute within the
configured time window.

### 4. Install and start the React frontend (development)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### 4a. Build the frontend for production

```bash
cd frontend
npm run build
```

The compiled static files are placed in `frontend/dist/` and are
automatically served by the Flask backend at `http://localhost:5000`.

---

## Running the scraper standalone

```bash
cd scraper
pip install -r requirements.txt
python scraper.py
```

---

## Configuration

The dashboard's **Settings** panel writes changes to `data/config.json`.
You can also edit this file manually before starting the backend.

| Key | Default | Description |
|---|---|---|
| `start_latitude` | `37.7749` | Origin latitude |
| `start_longitude` | `-122.4194` | Origin longitude |
| `end_latitude` | `37.3382` | Destination latitude |
| `end_longitude` | `-121.8863` | Destination longitude |
| `start_time` | `"07:00"` | Window start (24-hour local time) |
| `end_time` | `"09:00"` | Window end (24-hour local time) |
| `interval_minutes` | `1` | How often to scrape (minutes) |
| `seat_count` | `2` | Passengers |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/data` | All CSV rows as JSON (newest first) |
| `GET` | `/api/config` | Current config |
| `POST` | `/api/config` | Update config |
| `GET` | `/api/status` | Scheduler status |
| `POST` | `/api/scrape/now` | Trigger immediate scrape |

---

## CSV schema

`data/rides.csv` columns:

| Column | Description |
|---|---|
| `timestamp` | ISO-8601 time the sample was taken |
| `product_id` | Uber product identifier (e.g. `uberX`) |
| `display_name` | Human-readable name |
| `start_lat` / `start_lng` | Origin coordinates |
| `end_lat` / `end_lng` | Destination coordinates |
| `low_estimate` | Low price estimate (USD) |
| `high_estimate` | High price estimate (USD) |
| `surge_multiplier` | Current surge (1.0 = no surge) |
| `duration_seconds` | Estimated trip duration |
| `distance_miles` | Estimated trip distance |
| `currency_code` | Always `USD` for US routes |
