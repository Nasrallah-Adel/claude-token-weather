// Pure: the context readings the band and the pane draw from, and the lines
// a reading crosses. Nothing here touches $.

export const HISTORY_BAND = 12;
export const HISTORY_PANE = 200;
const BARS = "▁▂▃▄▅▆▇█";

// Forecast bands, by percent of the window used.
// Single-width text symbols, not emoji: they line up in every terminal font.
export const FORECAST = Object.freeze([
  { upTo: 25, icon: "☀", word: "Clear", color: "yellow" },
  { upTo: 50, icon: "☁", word: "Cloudy", color: "cyan" },
  { upTo: 75, icon: "☂", word: "Showers", color: "blue" },
  { upTo: 90, icon: "☇", word: "Storm", color: "magenta" },
  { upTo: Infinity, icon: "↯", word: "Compact soon", color: "red" },
]);

export function forecastFor(percent) {
  return FORECAST.find((band) => percent < band.upTo) ?? FORECAST[FORECAST.length - 1];
}

/** A new readings list with `reading` appended, zero readings dropped, the oldest trimmed past `keep`. */
export function pushReading(readings, reading, keep = HISTORY_PANE) {
  const kept = readings.filter((r) => r.tokens > 0);
  const next = [...kept, reading];
  return next.length > keep ? next.slice(-keep) : next;
}

/** One reading from a $.session.usage() context, or undefined when the window is unknown. */
export function readingFrom(context) {
  if (!context || !context.window) return undefined;
  const tokens = context.tokens ?? 0;
  const percent = Math.round(context.percent ?? (tokens / context.window) * 100);
  return { tokens, window: context.window, percent };
}

/** The lines (by name) that `tokens` crossed upward since `previous`; `0` lines never fire. */
export function crossings(previous, tokens, lines) {
  return Object.entries(lines)
    .filter(([, at]) => at > 0 && previous < at && tokens >= at)
    .map(([name]) => name);
}

/** Bars scale to the busiest reading shown, so growth shows at any fill level. */
export function chart(readings, width = readings.length) {
  const shown = readings.slice(-width);
  const top = Math.max(...shown.map((r) => r.tokens), 1);
  return shown.map((r) => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]).join("");
}

export function trendWord(readings) {
  if (readings.length < 2) return "";
  const delta = readings[readings.length - 1].tokens - readings[readings.length - 2].tokens;
  if (delta > 0) return `▲ +${short(delta)}`;
  if (delta < 0) return `▼ ${short(-delta)}`;
  return "steady";
}

export function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Subagent usage summed into the tally: a new tally, never the old one changed. */
export function addAgentUsage(tally, agentId, usage) {
  const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
    + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
  const was = tally.agents[agentId] ?? { tokens: 0, turns: 0, model: undefined };
  return {
    tokens: tally.tokens + tokens,
    turns: tally.turns + 1,
    agents: { ...tally.agents, [agentId]: { tokens: was.tokens + tokens, turns: was.turns + 1, model: usage?.model ?? was.model } },
  };
}

export const EMPTY_TALLY = Object.freeze({ tokens: 0, turns: 0, agents: Object.freeze({}) });
