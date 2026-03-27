import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "../components/Settings";

const defaultConfig = {
  start_latitude: 37.7749,
  start_longitude: -122.4194,
  end_latitude: 37.3382,
  end_longitude: -121.8863,
  start_time: "07:00",
  end_time: "09:00",
  interval_minutes: 1,
};

describe("Settings", () => {
  it("renders all form fields with values from config prop", () => {
    render(<Settings config={defaultConfig} onSave={vi.fn()} />);

    expect(screen.getByDisplayValue("37.7749")).toBeInTheDocument();
    expect(screen.getByDisplayValue("-122.4194")).toBeInTheDocument();
    expect(screen.getByDisplayValue("37.3382")).toBeInTheDocument();
    expect(screen.getByDisplayValue("-121.8863")).toBeInTheDocument();
    expect(screen.getByDisplayValue("07:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
  });

  it("renders section labels", () => {
    render(<Settings config={defaultConfig} onSave={vi.fn()} />);
    expect(screen.getByText(/start location/i)).toBeInTheDocument();
    expect(screen.getByText(/end location/i)).toBeInTheDocument();
    expect(screen.getByText(/schedule/i)).toBeInTheDocument();
  });

  it("renders the Save Settings button", () => {
    render(<Settings config={defaultConfig} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save settings/i })).toBeInTheDocument();
  });

  it("calls onSave with updated form values when submitted", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<Settings config={defaultConfig} onSave={onSave} />);

    const intervalInput = screen.getByDisplayValue("1");
    await user.clear(intervalInput);
    await user.type(intervalInput, "5");

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const calledWith = onSave.mock.calls[0][0];
    expect(String(calledWith.interval_minutes)).toBe("5");
  });

  it("shows '✓ Settings saved' after a successful save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<Settings config={defaultConfig} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() =>
      expect(screen.getByText(/✓ settings saved/i)).toBeInTheDocument()
    );
  });

  it("displays field-level errors returned by onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      ok: false,
      errors: { start_latitude: "Must be a number." },
    });
    render(<Settings config={defaultConfig} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() =>
      expect(screen.getByText("Must be a number.")).toBeInTheDocument()
    );
  });

  it("shows 'Saving…' label while the save is in progress", async () => {
    const user = userEvent.setup();
    let resolveSave;
    const onSave = vi.fn(
      () => new Promise((resolve) => { resolveSave = resolve; })
    );
    render(<Settings config={defaultConfig} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();

    resolveSave({ ok: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save settings/i })).not.toBeDisabled()
    );
  });

  it("syncs form fields when config prop changes", async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <Settings config={defaultConfig} onSave={onSave} />
    );
    expect(screen.getByDisplayValue("37.7749")).toBeInTheDocument();

    rerender(
      <Settings
        config={{ ...defaultConfig, start_latitude: 40.7128 }}
        onSave={onSave}
      />
    );
    expect(screen.getByDisplayValue("40.7128")).toBeInTheDocument();
  });

  it("clears field error when the user edits that field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      ok: false,
      errors: { interval_minutes: "Must be an integer." },
    });
    render(<Settings config={defaultConfig} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(screen.getByText("Must be an integer.")).toBeInTheDocument()
    );

    const intervalInput = screen.getByDisplayValue("1");
    await user.clear(intervalInput);
    await user.type(intervalInput, "2");

    expect(screen.queryByText("Must be an integer.")).not.toBeInTheDocument();
  });
});
