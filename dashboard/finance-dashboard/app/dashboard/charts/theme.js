/**
 * Chart theming. Colours mirror the CSS variables in globals.css so charts
 * sit naturally in the dark surface. Recharts needs concrete values (it can't
 * read CSS vars for SVG fills), so the hexes are duplicated here on purpose —
 * keep them in sync with :root.
 */
import { sgd } from "@/lib/format";

export const CHART = {
  bg: "#f5f1ea",
  surface: "#ffffff",
  border: "#e7e1d6",
  text: "#1c1815",
  textDim: "#857b6d",
  positive: "#2f7d5b", // deep green
  negative: "#c0553f", // terracotta
  warning: "#c79a3e",  // ochre
  accent: "#5b7f9e",   // dusty blue (net line, highlights)
};

/**
 * Stable palette for categories. Assigned by getCategoryColor so a category
 * keeps the same colour across the donut and the trend chart. Muted, earthy
 * tones tuned for the cream background.
 */
export const CATEGORY_PALETTE = [
  "#2f7d5b", // green
  "#c0553f", // terracotta
  "#c79a3e", // ochre
  "#5b7f9e", // dusty blue
  "#9b7ba0", // mauve
  "#cbb892", // sand
  "#7a9b8e", // sage
  "#b06a4f", // clay
  "#8a8f5c", // olive
  "#a98b6a", // taupe
];

export const OTHER_COLOR = "#b8ad97";

/** Deterministic colour for a category name (stable across renders/charts). */
export function getCategoryColor(name) {
  if (name === "Other" || name === "Uncategorised") return OTHER_COLOR;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

/** Assign colours to an ordered category list, cycling the palette in order. */
export function assignColors(categories) {
  return categories.map((c, i) => ({
    ...c,
    color: c.category === "Other" ? OTHER_COLOR : CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
  }));
}

/** Shared dark tooltip for all charts. Formats every numeric value as SGD. */
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: CHART.surface,
        border: `1px solid ${CHART.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: CHART.text,
        boxShadow: "0 6px 20px rgba(28,24,21,0.12)",
      }}
    >
      {label != null && (
        <div style={{ color: CHART.textDim, marginBottom: 4 }}>{label}</div>
      )}
      {payload.map((entry, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: entry.color || entry.stroke || CHART.text }}>
            {entry.name}
          </span>
          <span
            className="numeric"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {sgd(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
