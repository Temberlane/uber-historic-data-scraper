import React, { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom SVG pin icons (no asset import issues)
function makePinIcon(color, letter) {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:28px;height:44px">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 44" width="28" height="44">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 30 14 30S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
        <circle cx="14" cy="14" r="7" fill="white"/>
        <text x="14" y="18" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}" font-family="system-ui,sans-serif">${letter}</text>
      </svg>
    </div>`,
    iconSize: [28, 44],
    iconAnchor: [14, 44],
    popupAnchor: [0, -44],
  });
}

const ORIGIN_ICON = makePinIcon("#22c55e", "A");
const DEST_ICON = makePinIcon("#ef4444", "B");

async function geocode(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
    );
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name };
    }
  } catch {}
  return null;
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    const data = await res.json();
    if (data.display_name) {
      // Shorten to first 3 parts for readability
      return data.display_name.split(",").slice(0, 3).join(",").trim();
    }
  } catch {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Fly to a new target inside the map
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 12));
    }
  }, [target]);
  return null;
}

// Handle clicks on the map
function ClickHandler({ active, onPlace }) {
  useMapEvents({
    click(e) {
      onPlace(active, e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function AddressBar({ label, color, value, onChange, onSearch, onFocus, active, searching }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
      }}>
        {label}
      </div>
      <input
        type="text"
        placeholder={`Search ${label === "A" ? "origin" : "destination"} address…`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        style={{
          flex: 1, padding: "0.38rem 0.6rem",
          border: `1.5px solid ${active ? color : "#d1d5db"}`,
          borderRadius: 7, fontSize: "0.82rem", outline: "none",
          boxSizing: "border-box",
        }}
      />
      <button
        type="button"
        onClick={onSearch}
        disabled={searching}
        style={{
          padding: "0.38rem 0.7rem", border: "none", borderRadius: 7,
          background: color, color: "#fff", fontWeight: 600,
          fontSize: "0.78rem", cursor: searching ? "default" : "pointer",
          flexShrink: 0, opacity: searching ? 0.6 : 1,
        }}
      >
        {searching ? "…" : "Go"}
      </button>
    </div>
  );
}

export default function MapPicker({ originLat, originLng, destLat, destLng, onOriginChange, onDestChange }) {
  const [active, setActive] = useState("origin");
  const [originAddr, setOriginAddr] = useState(
    originLat && originLng ? `${parseFloat(originLat).toFixed(4)}, ${parseFloat(originLng).toFixed(4)}` : ""
  );
  const [destAddr, setDestAddr] = useState(
    destLat && destLng ? `${parseFloat(destLat).toFixed(4)}, ${parseFloat(destLng).toFixed(4)}` : ""
  );
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);

  const hasOrigin = originLat != null && originLng != null;
  const hasDest = destLat != null && destLng != null;

  const defaultCenter = hasOrigin
    ? [parseFloat(originLat), parseFloat(originLng)]
    : [37.7749, -122.4194];

  const handleSearch = async (type) => {
    const query = type === "origin" ? originAddr : destAddr;
    if (!query.trim()) return;
    setSearching(true);
    const result = await geocode(query);
    setSearching(false);
    if (!result) return;
    const { lat, lng } = result;
    if (type === "origin") {
      onOriginChange(lat, lng);
      setOriginAddr(result.name.split(",").slice(0, 3).join(",").trim());
    } else {
      onDestChange(lat, lng);
      setDestAddr(result.name.split(",").slice(0, 3).join(",").trim());
    }
    setFlyTarget({ lat, lng, ts: Date.now() });
  };

  const handleMapPlace = useCallback(
    async (type, lat, lng) => {
      if (type === "origin") {
        onOriginChange(lat, lng);
        const name = await reverseGeocode(lat, lng);
        setOriginAddr(name);
      } else {
        onDestChange(lat, lng);
        const name = await reverseGeocode(lat, lng);
        setDestAddr(name);
      }
    },
    [onOriginChange, onDestChange]
  );

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[
          { key: "origin", label: "Set Origin (A)", color: "#22c55e" },
          { key: "dest", label: "Set Destination (B)", color: "#ef4444" },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            style={{
              flex: 1, padding: "0.38rem", border: "none", borderRadius: 7,
              background: active === key ? color : "#e5e7eb",
              color: active === key ? "#fff" : "#374151",
              fontWeight: 600, cursor: "pointer", fontSize: "0.78rem",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Address bars */}
      <AddressBar
        label="A"
        color="#22c55e"
        value={originAddr}
        onChange={setOriginAddr}
        onSearch={() => handleSearch("origin")}
        onFocus={() => setActive("origin")}
        active={active === "origin"}
        searching={searching}
      />
      <AddressBar
        label="B"
        color="#ef4444"
        value={destAddr}
        onChange={setDestAddr}
        onSearch={() => handleSearch("dest")}
        onFocus={() => setActive("dest")}
        active={active === "dest"}
        searching={searching}
      />

      {/* Hint */}
      <p style={{ margin: "0 0 6px", fontSize: "0.72rem", color: "#9ca3af" }}>
        Click the map to place the active marker
      </p>

      {/* Map */}
      <div style={{ height: 280, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <MapContainer center={defaultCenter} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler active={active} onPlace={handleMapPlace} />
          {flyTarget && <FlyTo target={flyTarget} />}
          {hasOrigin && (
            <Marker
              position={[parseFloat(originLat), parseFloat(originLng)]}
              icon={ORIGIN_ICON}
            />
          )}
          {hasDest && (
            <Marker
              position={[parseFloat(destLat), parseFloat(destLng)]}
              icon={DEST_ICON}
            />
          )}
          {hasOrigin && hasDest && (
            <Polyline
              positions={[
                [parseFloat(originLat), parseFloat(originLng)],
                [parseFloat(destLat), parseFloat(destLng)],
              ]}
              color="#6b7280"
              dashArray="6 10"
              weight={2}
            />
          )}
        </MapContainer>
      </div>

      {/* Coordinate readout */}
      {(hasOrigin || hasDest) && (
        <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "#9ca3af" }}>
          {hasOrigin && `A: ${parseFloat(originLat).toFixed(4)}, ${parseFloat(originLng).toFixed(4)}`}
          {hasOrigin && hasDest && "  →  "}
          {hasDest && `B: ${parseFloat(destLat).toFixed(4)}, ${parseFloat(destLng).toFixed(4)}`}
        </p>
      )}
    </div>
  );
}
