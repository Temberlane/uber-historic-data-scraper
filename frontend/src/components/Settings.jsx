import React, { useState, useEffect } from "react";
import MapPicker from "./MapPicker";

const styles = {
  form: { display: "flex", flexDirection: "column", gap: "0.9rem" },
  section: { display: "flex", flexDirection: "column", gap: "0.45rem" },
  sectionTitle: {
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6e6e73",
    margin: 0,
  },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" },
  label: { display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.85rem" },
  labelText: { color: "#374151", fontWeight: 500 },
  input: (hasError) => ({
    padding: "0.4rem 0.6rem",
    border: `1px solid ${hasError ? "#f87171" : "#d1d5db"}`,
    borderRadius: 7,
    fontSize: "0.85rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  }),
  errorText: { color: "#b91c1c", fontSize: "0.75rem" },
  divider: { borderTop: "1px solid #f3f4f6", margin: "0.25rem 0" },
  saveBtn: (saving) => ({
    padding: "0.5rem 1rem",
    border: "none",
    borderRadius: 8,
    background: saving ? "#9ca3af" : "#0071e3",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: saving ? "default" : "pointer",
    marginTop: "0.25rem",
  }),
  successMsg: { color: "#065f46", fontSize: "0.82rem", fontWeight: 500 },
};

function Field({ label, name, value, onChange, error, type = "number", step }) {
  return (
    <label style={styles.label}>
      <span style={styles.labelText}>{label}</span>
      <input
        style={styles.input(!!error)}
        type={type}
        step={step}
        name={name}
        value={value}
        onChange={onChange}
      />
      {error && <span style={styles.errorText}>{error}</span>}
    </label>
  );
}

export default function Settings({ config, onSave }) {
  const [form, setForm] = useState({ ...config });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({ ...config });
  }, [config]);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((err) => ({ ...err, [e.target.name]: undefined }));
    setSaved(false);
  };

  const handleOriginChange = (lat, lng) => {
    setForm((f) => ({ ...f, start_latitude: lat, start_longitude: lng }));
    setSaved(false);
  };

  const handleDestChange = (lat, lng) => {
    setForm((f) => ({ ...f, end_latitude: lat, end_longitude: lng }));
    setSaved(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setSaved(false);
    const result = await onSave(form);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setErrors(result.errors || {});
    }
  };

  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      {/* Route map picker */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>Route</p>
        <MapPicker
          originLat={form.start_latitude}
          originLng={form.start_longitude}
          destLat={form.end_latitude}
          destLng={form.end_longitude}
          onOriginChange={handleOriginChange}
          onDestChange={handleDestChange}
        />
        {(errors.start_latitude || errors.start_longitude) && (
          <span style={styles.errorText}>
            Invalid origin: {errors.start_latitude || errors.start_longitude}
          </span>
        )}
        {(errors.end_latitude || errors.end_longitude) && (
          <span style={styles.errorText}>
            Invalid destination: {errors.end_latitude || errors.end_longitude}
          </span>
        )}
      </div>

      <hr style={styles.divider} />

      {/* Schedule */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>Schedule</p>
        <div style={styles.row}>
          <Field
            label="Start time"
            name="start_time"
            value={form.start_time ?? "07:00"}
            onChange={handleChange}
            error={errors.start_time}
            type="time"
          />
          <Field
            label="End time"
            name="end_time"
            value={form.end_time ?? "09:00"}
            onChange={handleChange}
            error={errors.end_time}
            type="time"
          />
        </div>
        <Field
          label="Interval (minutes)"
          name="interval_minutes"
          value={form.interval_minutes ?? 1}
          onChange={handleChange}
          error={errors.interval_minutes}
          step="1"
        />
      </div>

      <button type="submit" style={styles.saveBtn(saving)} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
      {saved && <span style={styles.successMsg}>✓ Settings saved</span>}
    </form>
  );
}
