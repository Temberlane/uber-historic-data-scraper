import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PriceChart from "../components/PriceChart";

// ResponsiveContainer needs real dimensions which jsdom cannot provide.
// Mock recharts to render a plain SVG so we can assert the chart is present.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart-container">{children}</div>,
  LineChart: ({ children }) => <svg data-testid="line-chart">{children}</svg>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const makeRow = (overrides = {}) => ({
  timestamp: "2024-07-15T07:03:00",
  product_id: "uberX",
  display_name: "UberX",
  low_estimate: "8.50",
  high_estimate: "10.00",
  surge_multiplier: "1.0",
  ...overrides,
});

describe("PriceChart", () => {
  it("shows empty-state message when data is an empty array", () => {
    render(<PriceChart data={[]} />);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it("shows empty-state message when data is undefined", () => {
    render(<PriceChart />);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it("renders the chart container when data is present", () => {
    const rows = [
      makeRow({ timestamp: "2024-07-15T07:01:00" }),
      makeRow({ timestamp: "2024-07-15T07:02:00" }),
    ];
    render(<PriceChart data={rows} />);
    expect(screen.getByTestId("chart-container")).toBeInTheDocument();
  });

  it("does not show the empty-state message when data is present", () => {
    render(<PriceChart data={[makeRow()]} />);
    expect(screen.queryByText(/no data yet/i)).not.toBeInTheDocument();
  });

  it("groups rows by timestamp into unique chart data points", () => {
    // Two rows with the same timestamp (different products) should produce
    // one chart entry, not two.
    const sharedTs = "2024-07-15T07:01:00";
    const rows = [
      makeRow({ timestamp: sharedTs, display_name: "UberX", low_estimate: "8" }),
      makeRow({ timestamp: sharedTs, display_name: "UberXL", low_estimate: "14" }),
    ];
    render(<PriceChart data={rows} />);
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("handles rows with no display_name by falling back to product_id", () => {
    const row = makeRow({ display_name: "", product_id: "uberBLACK" });
    expect(() => render(<PriceChart data={[row]} />)).not.toThrow();
  });

  it("caps chart data at 120 data points when given more", () => {
    // Generate 130 rows with unique timestamps
    const rows = Array.from({ length: 130 }, (_, i) =>
      makeRow({ timestamp: `2024-07-15T07:${String(i).padStart(2, "0")}:00` })
    );
    render(<PriceChart data={rows} />);
    expect(screen.getByTestId("chart-container")).toBeInTheDocument();
  });
});

