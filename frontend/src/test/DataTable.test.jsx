import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable from "../components/DataTable";

const makeRow = (overrides = {}) => ({
  timestamp: "2024-07-15T07:03:00",
  product_id: "uberX",
  display_name: "UberX",
  low_estimate: "8.50",
  high_estimate: "10.00",
  surge_multiplier: "1.0",
  distance_miles: "12.3",
  duration_seconds: "1800",
  ...overrides,
});

describe("DataTable", () => {
  it("shows empty-state message when no data is passed", () => {
    render(<DataTable data={[]} />);
    expect(screen.getByText(/no data recorded yet/i)).toBeInTheDocument();
  });

  it("shows empty-state message when data prop is undefined", () => {
    render(<DataTable />);
    expect(screen.getByText(/no data recorded yet/i)).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<DataTable data={[makeRow()]} />);
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Surge")).toBeInTheDocument();
    expect(screen.getByText("Distance (mi)")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
  });

  it("renders display_name when available", () => {
    render(<DataTable data={[makeRow({ display_name: "Uber Black" })]} />);
    expect(screen.getByText("Uber Black")).toBeInTheDocument();
  });

  it("falls back to product_id when display_name is absent", () => {
    render(<DataTable data={[makeRow({ display_name: "" })]} />);
    expect(screen.getByText("uberX")).toBeInTheDocument();
  });

  it("formats low and high estimates with a $ prefix", () => {
    render(<DataTable data={[makeRow({ low_estimate: "8.50", high_estimate: "10.00" })]} />);
    expect(screen.getByText("$8.50")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
  });

  it("shows — for missing low/high estimates", () => {
    render(
      <DataTable
        data={[makeRow({ low_estimate: "", high_estimate: "" })]}
      />
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("converts duration_seconds to minutes", () => {
    render(<DataTable data={[makeRow({ duration_seconds: "3600" })]} />);
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  it("shows — for missing duration_seconds", () => {
    render(<DataTable data={[makeRow({ duration_seconds: "" })]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("displays distance_miles value", () => {
    render(<DataTable data={[makeRow({ distance_miles: "7.5" })]} />);
    expect(screen.getByText("7.5")).toBeInTheDocument();
  });

  it("renders surge multiplier with × suffix", () => {
    render(<DataTable data={[makeRow({ surge_multiplier: "2.1" })]} />);
    expect(screen.getByText("2.1×")).toBeInTheDocument();
  });

  it("does not render pagination when 20 or fewer rows", () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow({ product_id: `p${i}` }));
    render(<DataTable data={rows} />);
    expect(screen.queryByText(/page 1 of/i)).not.toBeInTheDocument();
  });

  it("renders pagination when more than 20 rows", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ product_id: `p${i}`, display_name: `Product ${i}` })
    );
    render(<DataTable data={rows} />);
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
  });

  it("next-page button advances to page 2", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ product_id: `p${i}`, display_name: `Product ${i}` })
    );
    render(<DataTable data={rows} />);

    const nextBtn = screen.getByText("›");
    await user.click(nextBtn);
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
  });

  it("previous-page button is disabled on the first page", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ product_id: `p${i}`, display_name: `Product ${i}` })
    );
    render(<DataTable data={rows} />);
    expect(screen.getByText("‹")).toBeDisabled();
  });

  it("next-page button is disabled on the last page", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ product_id: `p${i}`, display_name: `Product ${i}` })
    );
    render(<DataTable data={rows} />);

    await user.click(screen.getByText("›"));
    expect(screen.getByText("›")).toBeDisabled();
  });
});
