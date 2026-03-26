import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import PriceChart from "./components/PriceChart";
import DataTable from "./components/DataTable";
import Settings from "./components/Settings";

const POLL_INTERVAL_MS = 60_000; // refresh data every 60 s

const styles = {
  app: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    maxWidth: 1200,
    margin: "0 auto",
    padding: "1.5rem",
    background: "#f5f5f7",
    minHeight: "100vh",
    color: "#1d1d1f",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1.5rem",
  },
  logo: { fontSize: "2rem" },
  title: { margin: 0, fontSize: "1.6rem", fontWeight: 700 },
  subtitle: { margin: 0, fontSize: "0.9rem", color: "#6e6e73" },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: "1.25rem",
    alignItems: "start",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "1.25rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: {
    margin: "0 0 1rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#1d1d1f",
  },
  statusBar: {
    display: "flex",
    gap: "1rem",
    marginBottom: "1rem",
    flexWrap: "wrap",
  },
  badge: (color) => ({
    padding: "0.25rem 0.75rem",
    borderRadius: 20,
    fontSize: "0.8rem",
    fontWeight: 600,
    background: color === "green" ? "#d1fae5" : color === "red" ? "#fee2e2" : "#e5e7eb",
    color: color === "green" ? "#065f46" : color === "red" ? "#991b1b" : "#374151",
  }),
  scrapeBtn: {
    padding: "0.45rem 1rem",
    borderRadius: 8,
    border: "none",
    background: "#0071e3",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    marginLeft: "auto",
  },
  errorMsg: {
    color: "#b91c1c",
    fontSize: "0.85rem",
    marginTop: "0.5rem",
  },
};

export default function App() {
  const [data, setData] = useState([]);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [loadError, setLoadError] = useState("");

  // ---- data fetching -------------------------------------------------------

  const fetchAll = useCallback(async () => {
    try {
      const [dataRes, configRes, statusRes] = await Promise.all([
        axios.get("/api/data"),
        axios.get("/api/config"),
        axios.get("/api/status"),
      ]);
      setData(dataRes.data);
      setConfig(configRes.data);
      setStatus(statusRes.data);
      setLoadError("");
    } catch (err) {
      setLoadError("Could not reach the backend. Is the Flask server running?");
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchAll]);

  // ---- manual scrape -------------------------------------------------------

  const handleScrapeNow = async () => {
    setScraping(true);
    setScrapeMsg("");
    try {
      const res = await axios.post("/api/scrape/now");
      setScrapeMsg(res.data.message || "Done.");
      await fetchAll();
    } catch (err) {
      setScrapeMsg(err.response?.data?.message || "Scrape failed.");
    } finally {
      setScraping(false);
    }
  };

  // ---- config save ---------------------------------------------------------

  const handleSaveConfig = async (newConfig) => {
    try {
      const res = await axios.post("/api/config", newConfig);
      setConfig(res.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, errors: err.response?.data?.errors || {} };
    }
  };

  // ---- render --------------------------------------------------------------

  if (loadError) {
    return (
      <div style={styles.app}>
        <div style={{ ...styles.card, marginTop: "3rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "#b91c1c" }}>{loadError}</p>
          <button style={styles.scrapeBtn} onClick={fetchAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>🚗</span>
        <div>
          <h1 style={styles.title}>Uber Price Dashboard</h1>
          <p style={styles.subtitle}>Historic price estimates for your route</p>
        </div>
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        {status && (
          <>
            <span style={styles.badge(status.running ? "green" : "red")}>
              {status.running ? "● Scheduler running" : "● Scheduler stopped"}
            </span>
            <span style={styles.badge("gray")}>
              Every {status.interval_minutes} min
            </span>
            {status.next_run && (
              <span style={styles.badge("gray")}>
                Next: {new Date(status.next_run).toLocaleTimeString()}
              </span>
            )}
          </>
        )}
        <button
          style={{ ...styles.scrapeBtn, opacity: scraping ? 0.6 : 1 }}
          onClick={handleScrapeNow}
          disabled={scraping}
        >
          {scraping ? "Scraping…" : "Scrape Now"}
        </button>
      </div>
      {scrapeMsg && <p style={styles.errorMsg}>{scrapeMsg}</p>}

      {/* Main grid */}
      <div style={styles.grid}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Price Over Time</h2>
            <PriceChart data={data} />
          </div>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Recent Estimates ({data.length} rows)</h2>
            <DataTable data={data} />
          </div>
        </div>

        {/* Right column – settings */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Settings</h2>
          {config ? (
            <Settings config={config} onSave={handleSaveConfig} />
          ) : (
            <p style={{ color: "#6e6e73", fontSize: "0.9rem" }}>Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
