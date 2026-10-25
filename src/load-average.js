/** Format the load-average payload defensively for display. */
export function formatLoadAverage(value) {
  if (!Array.isArray(value)) return "—";
  return value.map(sample =>
    typeof sample === "number" && Number.isFinite(sample) && sample >= 0 ? sample : "—"
  ).join(" / ");
}
