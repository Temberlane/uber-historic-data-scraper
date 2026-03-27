/**
 * main.jsx mounts the React application into the DOM.
 * This smoke test confirms that the module imports and that App renders
 * into a root element without throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import axios from "axios";

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

beforeEach(() => {
  // Provide stub API responses so the App tree renders without errors
  axios.get.mockImplementation((url) => {
    if (url === "/api/data") return Promise.resolve({ data: [] });
    if (url === "/api/config")
      return Promise.resolve({
        data: {
          start_latitude: 37.7749,
          start_longitude: -122.4194,
          end_latitude: 37.3382,
          end_longitude: -121.8863,
          start_time: "07:00",
          end_time: "09:00",
          interval_minutes: 1,
        },
      });
    if (url === "/api/status")
      return Promise.resolve({
        data: { running: true, interval_minutes: 1, next_run: null },
      });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(() => {
  vi.clearAllMocks();
  // Remove the root element created between tests
  const root = document.getElementById("root");
  if (root) root.remove();
});

describe("main.jsx", () => {
  it("mounts App into a #root element without throwing", async () => {
    const div = document.createElement("div");
    div.id = "root";
    document.body.appendChild(div);

    // Dynamically import main so the DOM element is in place first
    await import("../main.jsx");

    // After mounting, the root element should contain rendered content
    await waitFor(() => {
      expect(document.getElementById("root")).not.toBeNull();
      expect(document.getElementById("root").innerHTML).not.toBe("");
    });
  });
});
