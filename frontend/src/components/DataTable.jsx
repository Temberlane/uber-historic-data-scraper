import React, { useState } from "react";

const PAGE_SIZE = 20;

const styles = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.82rem",
  },
  th: {
    textAlign: "left",
    padding: "0.4rem 0.6rem",
    background: "#f5f5f7",
    borderBottom: "1px solid #e5e7eb",
    fontWeight: 600,
    color: "#374151",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "0.35rem 0.6rem",
    borderBottom: "1px solid #f3f4f6",
    color: "#1d1d1f",
    whiteSpace: "nowrap",
  },
  surge: (val) => ({
    fontWeight: val > 1 ? 700 : 400,
    color: val > 1.5 ? "#b91c1c" : val > 1 ? "#d97706" : "inherit",
  }),
  pagination: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.75rem",
    alignItems: "center",
    fontSize: "0.82rem",
  },
  btn: (active) => ({
    padding: "0.25rem 0.6rem",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: active ? "#0071e3" : "#fff",
    color: active ? "#fff" : "#374151",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  }),
};

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function DataTable({ data }) {
  const [page, setPage] = useState(0);

  if (!data || data.length === 0) {
    return (
      <p style={{ color: "#6e6e73", fontSize: "0.9rem" }}>No data recorded yet.</p>
    );
  }

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>Low</th>
              <th style={styles.th}>High</th>
              <th style={styles.th}>Surge</th>
              <th style={styles.th}>Distance (mi)</th>
              <th style={styles.th}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => {
              const surge = parseFloat(row.surge_multiplier) || 1;
              const durationMin = row.duration_seconds
                ? Math.round(row.duration_seconds / 60)
                : "—";
              return (
                <tr key={i}>
                  <td style={styles.td}>{fmtTs(row.timestamp)}</td>
                  <td style={styles.td}>{row.display_name || row.product_id}</td>
                  <td style={styles.td}>
                    {row.low_estimate ? `$${row.low_estimate}` : "—"}
                  </td>
                  <td style={styles.td}>
                    {row.high_estimate ? `$${row.high_estimate}` : "—"}
                  </td>
                  <td style={{ ...styles.td, ...styles.surge(surge) }}>
                    {surge.toFixed(1)}×
                  </td>
                  <td style={styles.td}>{row.distance_miles || "—"}</td>
                  <td style={styles.td}>
                    {durationMin !== "—" ? `${durationMin} min` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.btn(false)}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ‹
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
            return (
              <button key={p} style={styles.btn(p === page)} onClick={() => setPage(p)}>
                {p + 1}
              </button>
            );
          })}
          <button
            style={styles.btn(false)}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
          >
            ›
          </button>
          <span style={{ color: "#6e6e73" }}>
            Page {page + 1} of {totalPages}
          </span>
        </div>
      )}
    </>
  );
}
