import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import App from "../App";

// Mock recharts so ResponsiveContainer works in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <svg>{children}</svg>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock("axios");

const mockData = [
  {
    timestamp: "2024-07-15T07:03:00",
    product_id: "uberX",
    display_name: "UberX",
    low_estimate: "8.50",
    high_estimate: "10.00",
    surge_multiplier: "1.0",
    distance_miles: "12.3",
    duration_seconds: "1800",
  },
];

const mockConfig = {
  start_latitude: 37.7749,
  start_longitude: -122.4194,
  end_latitude: 37.3382,
  end_longitude: -121.8863,
  start_time: "07:00",
  end_time: "09:00",
  interval_minutes: 1,
};

const mockStatus = {
  running: true,
  interval_minutes: 1,
  next_run: "2024-07-15T07:04:00",
};

beforeEach(() => {
  axios.get.mockImplementation((url) => {
    if (url === "/api/data") return Promise.resolve({ data: mockData });
    if (url === "/api/config") return Promise.resolve({ data: mockConfig });
    if (url === "/api/status") return Promise.resolve({ data: mockStatus });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App", () => {
  it("renders the page title", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Uber Price Dashboard")).toBeInTheDocument()
    );
  });

  it("renders the subtitle", async () => {
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Historic price estimates for your route")
      ).toBeInTheDocument()
    );
  });

  it("shows scheduler running status badge after data loads", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/scheduler running/i)).toBeInTheDocument()
    );
  });

  it("shows the interval badge after data loads", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/every 1 min/i)).toBeInTheDocument()
    );
  });

  it("shows the row count in the table heading", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/1 rows/i)).toBeInTheDocument()
    );
  });

  it("shows 'Loading…' for settings before config arrives, then renders the form", async () => {
    // Delay the config response
    let resolveConfig;
    axios.get.mockImplementation((url) => {
      if (url === "/api/data") return Promise.resolve({ data: [] });
      if (url === "/api/config")
        return new Promise((res) => { resolveConfig = res; });
      if (url === "/api/status") return Promise.resolve({ data: mockStatus });
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    render(<App />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveConfig({ data: mockConfig });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save settings/i })).toBeInTheDocument()
    );
  });

  it("shows the error screen when all API calls fail", async () => {
    axios.get.mockRejectedValue(new Error("network error"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/could not reach the backend/i)).toBeInTheDocument()
    );
  });

  it("shows a Retry button on the error screen", async () => {
    axios.get.mockRejectedValue(new Error("network error"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );
  });

  it("clicking Retry re-fetches data", async () => {
    const user = userEvent.setup();
    axios.get.mockRejectedValue(new Error("network error"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    );

    // Restore working mocks before clicking retry
    axios.get.mockImplementation((url) => {
      if (url === "/api/data") return Promise.resolve({ data: [] });
      if (url === "/api/config") return Promise.resolve({ data: mockConfig });
      if (url === "/api/status") return Promise.resolve({ data: mockStatus });
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(screen.getByText("Uber Price Dashboard")).toBeInTheDocument()
    );
  });

  it("clicking 'Scrape Now' calls POST /api/scrape/now", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { ok: true, message: "Scrape completed." } });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /scrape now/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /scrape now/i }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith("/api/scrape/now")
    );
  });

  it("displays the scrape result message after manual scrape", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({ data: { ok: true, message: "Scrape completed." } });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /scrape now/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /scrape now/i }));

    await waitFor(() =>
      expect(screen.getByText("Scrape completed.")).toBeInTheDocument()
    );
  });

  it("shows 'Scraping…' while the scrape request is in flight", async () => {
    const user = userEvent.setup();
    let resolveScrape;
    axios.post.mockImplementation(
      () => new Promise((res) => { resolveScrape = res; })
    );

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /scrape now/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /scrape now/i }));
    expect(screen.getByRole("button", { name: /scraping/i })).toBeDisabled();

    resolveScrape({ data: { ok: true, message: "Done." } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /scrape now/i })).not.toBeDisabled()
    );
  });
});
