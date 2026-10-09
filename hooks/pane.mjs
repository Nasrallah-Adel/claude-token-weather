// Pure: the rows the weather pane draws, { text, color?, dim?, kind? }.

import { usageParts, colorFor, formatPercent, resetIn } from "./usage-status.mjs";
import { forecastFor, short } from "./readings.mjs";
import { usd } from "./spend.mjs";

const BARS = "▁▂▃▄▅▆▇█";
const LABEL = { five_hour: "5h", seven_day: "7d", spend_limit: "spend" };

/** Readings bucketed to `width` cells, each cell the max of its bucket, scaled to the busiest. */
export function sparkline(readings, width) {
  if (readings.length === 0 || width <= 0) return "";
  const per = Math.ceil(readings.length / width);
  const buckets = Array.from({ length: Math.ceil(readings.length / per) }, (_, i) =>
    Math.max(...readings.slice(i * per, (i + 1) * per).map((r) => r.tokens)));
  const top = Math.max(...buckets, 1);
  return buckets.map((t) => BARS[Math.min(BARS.length - 1, Math.floor((t / top) * (BARS.length - 1)))]).join("");
}

export function bar(percent, width) {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function paneRows(state, opts, size, nowMs) {
  const width = Math.max(10, size.columns);
  return [
    ...headRows(state, opts),
    ...chartRows(state.readings, width),
    ...windowRows(state.usage, width, nowMs),
    ...costRows(state, opts),
  ];
}

function headRows(state, opts) {
  const now = state.live ?? state.readings[state.readings.length - 1];
  if (!now) return [{ text: "no reading yet", dim: true }];
  const f = forecastFor(now.percent);
  const over = now.tokens >= opts.warnTokens ? "  ⚠2x" : "";
  return [{ text: `${f.icon} ${f.word}  ${now.percent}%  ${short(now.tokens)} / ${short(now.window)}${over}`, color: f.color, bold: true }];
}

function chartRows(readings, width) {
  if (readings.length < 2) return [];
  const line = sparkline(readings, width);
  return [
    { text: `turns ${readings.length}  peak ${short(Math.max(...readings.map((r) => r.tokens)))}`, dim: true },
    { text: line, kind: "chart" },
  ];
}

function windowRows(usage, width, nowMs) {
  const limits = (usage?.rateLimits ?? []).filter((w) => w && typeof w.percentUsed === "number");
  if (limits.length === 0) return [];
  const barWidth = Math.max(4, Math.min(20, width - 22));
  return limits.map((w) => {
    const reset = resetIn(w.resetsAt, nowMs);
    const label = (LABEL[w.kind] ?? w.kind).padEnd(5);
    return { text: `${label}${bar(w.percentUsed, barWidth)} ${formatPercent(w.percentUsed)}%${reset ? ` ↻${reset}` : ""}`, color: colorFor(w.percentUsed) };
  });
}

function costRows(state, opts) {
  const cost = usageParts({ cost: state.usage?.cost }, 0)[0];
  const spend = opts.showDailyCost && state.spend && (state.spend.today > 0 || state.spend.week > 0)
    ? `  today ${usd(state.spend.today)}  week ${usd(state.spend.week)}`
    : "";
  const rows = cost ? [{ text: `session ${cost.text}${spend}`, dim: true }] : [];
  const tally = state.agents;
  return opts.showAgents && tally && tally.tokens > 0
    ? [...rows, { text: `agents ${short(tally.tokens)} over ${tally.turns} turns`, dim: true }]
    : rows;
}
