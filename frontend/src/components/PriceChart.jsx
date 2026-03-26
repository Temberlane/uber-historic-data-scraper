import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Colour palette for different Uber products
const PRODUCT_COLORS = [
  "#0071e3",
  "#34c759",
  "#ff9f0a",
  "#ff3b30",
  "#af52de",
  "#5856d6",
];

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

/**
 * Reshape flat CSV rows into a recharts-friendly array.
 *
 * Each element represents a timestamp and contains keys like:
 *   { time: "07:03", uberX_low: 8.5, uberX_high: 9.2, ... }
 */
function reshapeData(rows) {
  if (!rows || rows.length === 0) return { chartData: [], products: [] };

  const productSet = new Set();
  const byTimestamp = {};

  // rows arrive newest-first from the API – reverse for chronological order
  const chronological = [...rows].reverse();

  for (const row of chronological) {
    const ts = row.timestamp;
    if (!byTimestamp[ts]) {
      byTimestamp[ts] = { timestamp: ts, time: formatTime(ts) };
    }
    const name = row.display_name || row.product_id;
    productSet.add(name);
    byTimestamp[ts][`${name}_low`] = parseFloat(row.low_estimate) || 0;
    byTimestamp[ts][`${name}_high`] = parseFloat(row.high_estimate) || 0;
  }

  return {
    chartData: Object.values(byTimestamp).slice(-120), // last 120 ticks max
    products: [...productSet],
  };
}

export default function PriceChart({ data }) {
  const { chartData, products } = useMemo(() => reshapeData(data), [data]);

  if (chartData.length === 0) {
    return (
      <p style={{ color: "#6e6e73", fontSize: "0.9rem" }}>
        No data yet. Run a scrape to see prices here.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `$${v}`}
          width={45}
        />
        <Tooltip
          formatter={(value, name) => [`$${value}`, name]}
          labelFormatter={(label) => `Time: ${label}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {products.map((product, i) => (
          <React.Fragment key={product}>
            <Line
              type="monotone"
              dataKey={`${product}_low`}
              name={`${product} (low)`}
              stroke={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey={`${product}_high`}
              name={`${product} (high)`}
              stroke={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
            />
          </React.Fragment>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
