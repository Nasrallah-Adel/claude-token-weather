// Pure helpers for the usage part of the band: no $ calls, so they test on their own.
//
// usageParts({ rateLimits, cost }, nowMs) ->
//   [{ text: "5h 23% ↻2h10m", color: "green" }, { text: "7d 41% ↻3d4h", color: "green" }, { text: "$1.23" }]
// Empty when there is nothing to show (no window reading, no cost).
// A window is green below WARN_PERCENT, yellow below DANGER_PERCENT, red from there.

const WINDOW_LABEL = {
  five_hour: "5h",
  seven_day: "7d",
  spend_limit: "spend",
};

const WINDOW_ORDER = ["five_hour", "seven_day", "spend_limit"];
const WARN_PERCENT = 50;
const DANGER_PERCENT = 80;
// Context size, in tokens: green below WARN, yellow below DANGER, red from there.
export const CONTEXT_WARN_TOKENS = 200_000;
export const CONTEXT_DANGER_TOKENS = 300_000;

export function contextColor(tokens) {
  if (tokens >= CONTEXT_DANGER_TOKENS) return "red";
  if (tokens >= CONTEXT_WARN_TOKENS) return "yellow";
  return "green";
}

export function usageParts(usage, nowMs) {
  const windows = windowParts(usage?.rateLimits ?? [], nowMs);
  const cost = costPart(usage?.cost);
  return cost ? [...windows, cost] : windows;
}

function windowParts(rateLimits, nowMs) {
  return [...rateLimits]
    .filter((w) => w && typeof w.percentUsed === "number")
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((w) => windowPart(w, nowMs));
}

function rank(kind) {
  const i = WINDOW_ORDER.indexOf(kind);
  return i === -1 ? WINDOW_ORDER.length : i;
}

function windowPart(w, nowMs) {
  const label = WINDOW_LABEL[w.kind] ?? w.kind;
  const pct = `${formatPercent(w.percentUsed)}%`;
  const reset = resetIn(w.resetsAt, nowMs);
  const text = reset ? `${label} ${pct} ↻${reset}` : `${label} ${pct}`;
  return { text, color: colorFor(w.percentUsed) };
}

export function colorFor(percentUsed) {
  if (percentUsed >= DANGER_PERCENT) return "red";
  if (percentUsed >= WARN_PERCENT) return "yellow";
  return "green";
}

export function formatPercent(p) {
  const n = Math.max(0, p);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function resetIn(resetsAt, nowMs) {
  if (!resetsAt) return undefined;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return undefined;
  const left = Math.max(0, Math.round((at - nowMs) / 60_000));
  const days = Math.floor(left / 1440);
  const hours = Math.floor((left % 1440) / 60);
  const mins = left % 60;
  if (days > 0) return hours > 0 ? `${days}d${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

function costPart(cost) {
  if (!cost || typeof cost.usd !== "number") return undefined;
  return { text: `$${cost.usd.toFixed(2)}` };
}
