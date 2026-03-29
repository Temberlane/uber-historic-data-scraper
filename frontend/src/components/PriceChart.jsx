import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const PRODUCT_COLORS = [
  "#0071e3",
  "#34c759",
  "#ff9f0a",
  "#ff3b30",
  "#af52de",
  "#5856d6",
];

// Pixels wide per data point — controls how stretched the chart is
const PX_PER_POINT = 48;
const MIN_WIDTH = 700;

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function reshapeData(rows) {
  if (!rows || rows.length === 0) return { chartData: [], products: [] };

  const productSet = new Set();
  const byTimestamp = {};

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
    chartData: Object.values(byTimestamp),
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

  const chartWidth = Math.max(MIN_WIDTH, chartData.length * PX_PER_POINT);
  // Show a tick roughly every 20 points to avoid crowding
  const tickInterval = Math.max(0, Math.floor(chartData.length / 20) - 1);

  return (
    <div
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        cursor: "grab",
        paddingBottom: 4,
      }}
    >
      <div style={{ width: chartWidth }}>
        <LineChart
          width={chartWidth}
          height={280}
          data={chartData}
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `$${v}`}
            width={45}
          />
          <Tooltip
            formatter={(value, name) => [`$${parseFloat(value).toFixed(2)}`, name]}
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
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
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
      </div>
    </div>
  );
}
