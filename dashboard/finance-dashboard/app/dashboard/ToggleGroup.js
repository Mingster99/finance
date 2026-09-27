"use client";

/**
 * A small segmented control. Options are { value, label } or bare strings.
 * Used for time-range and view-mode toggles. Styling lives in globals.css
 * (.toggle-group / .toggle-pill) so it tracks the theme.
 */
export default function ToggleGroup({ options, value, onChange, ariaLabel }) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  return (
    <div className="toggle-group" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`toggle-pill${item.value === value ? " is-active" : ""}`}
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
