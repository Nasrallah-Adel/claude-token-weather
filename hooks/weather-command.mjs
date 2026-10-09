// Pure: the text /weather prints. The entry module gathers the view and
// dispatches the subcommands.

import { usageParts } from "./usage-status.mjs";
import { forecastFor, short, trendWord, HISTORY_BAND } from "./readings.mjs";
import { usd, isoWeek } from "./spend.mjs";

export const SUBCOMMANDS = Object.freeze(["report", "reset", "pane", "compact", "ledger", "help"]);

export const HELP = [
  "/weather           the forecast, windows, spend, agents, context categories",
  "/weather reset     forget the readings and re-arm the toasts and actions",
  "/weather pane      open or close the weather pane",
  "/weather compact   compact now, with the compactFocus instructions",
  "/weather ledger    spend by day over the stored sessions",
].join("\n");

export function parseWeatherArgs(args) {
  const word = (args ?? "").trim().toLowerCase();
  if (word === "") return "report";
  return SUBCOMMANDS.includes(word) ? word : "help";
}

/** The report for a view { readings, usage, spend, agents, categories?, model? }. */
export function weatherReport(view, opts, nowMs) {
  return [
    ...headline(view),
    ...recentTurns(view.readings),
    ...windows(view.usage, nowMs),
    ...spend(view, opts),
    ...agents(view.agents),
    ...categories(view.categories),
    ...thresholds(opts),
  ].join("\n");
}

function headline(view) {
  const now = view.live ?? view.readings[view.readings.length - 1];
  if (!now) return ["token weather: no reading yet (the first API response brings one)"];
  const f = forecastFor(now.percent);
  const model = view.model ? `  ${view.model}` : "";
  return [`${f.icon} ${f.word}  ${now.percent}% of context  ${short(now.tokens)} / ${short(now.window)}${model}`];
}

function recentTurns(readings) {
  if (readings.length < 2) return [];
  const shown = readings.slice(-HISTORY_BAND);
  const rows = shown.map((r, i) => {
    const prior = shown.slice(0, i + 1);
    const trend = i === 0 ? "" : `  ${trendWord(prior)}`;
    return `  ${String(short(r.tokens)).padStart(7)}${trend}`;
  });
  return ["", `last turns (${shown.length})`, ...rows];
}

function windows(usage, nowMs) {
  const parts = usageParts({ rateLimits: usage?.rateLimits ?? [] }, nowMs);
  return parts.length ? ["", "windows", ...parts.map((p) => `  ${p.text}`)] : [];
}

function spend(view, opts) {
  const session = view.usage?.cost?.usd;
  const rows = [
    ...(typeof session === "number" ? [`  session ${usd(session)}`] : []),
    ...(opts.showDailyCost && view.spend ? [`  today ${usd(view.spend.today)}`, `  week ${usd(view.spend.week)}`] : []),
  ];
  return rows.length ? ["", "cost", ...rows] : [];
}

function agents(tally) {
  if (!tally || tally.tokens <= 0) return [];
  const rows = Object.entries(tally.agents).slice(-20).map(([id, a]) => `  ${id}  ${short(a.tokens)}  ${a.turns} turns  ${a.model ?? ""}`.trimEnd());
  return ["", `agents ${short(tally.tokens)} over ${tally.turns} turns`, ...rows];
}

function categories(list) {
  const used = (list ?? []).filter((c) => c.kind === "used" && c.tokens > 0);
  return used.length ? ["", "context", ...used.map((c) => `  ${c.name}  ${short(c.tokens)}`)] : [];
}

function thresholds(opts) {
  const off = (on, text) => (on ? text : "off");
  return [
    "",
    "thresholds",
    `  warn ${short(opts.warnTokens)}  danger ${short(opts.dangerTokens)}`,
    `  compact at ${off(opts.compactAt > 0, short(opts.compactAt))}${opts.compactAt > 0 && opts.compactConfirm ? " (asks first)" : ""}`,
    `  rate guard ${off(opts.guardRateLimit > 0, `${opts.guardRateLimit}%`)}`,
    `  cost cap ${off(opts.costLimitUsd > 0, usd(opts.costLimitUsd))}`,
    `  downshift ${off(opts.downshiftModel !== "", `to ${opts.downshiftModel} at ${opts.downshiftAt}%`)}`,
    `  notify ${opts.notify ? "on" : "off"}  sound ${opts.sound}  suggest /compact ${opts.suggestCompact ? "on" : "off"}`,
  ];
}

/** Spend rows by day, newest first, then the week's total. */
export function ledgerReport(entries, nowMs) {
  const rows = entries.filter((e) => e && typeof e.usd === "number");
  if (rows.length === 0) return "no spend recorded yet";
  const byDay = rows.reduce((acc, e) => ({ ...acc, [e.day]: { usd: (acc[e.day]?.usd ?? 0) + e.usd, sessions: (acc[e.day]?.sessions ?? 0) + 1 } }), {});
  const week = isoWeek(nowMs);
  const weekTotal = rows.filter((e) => e.week === week).reduce((sum, e) => sum + e.usd, 0);
  const days = Object.entries(byDay).sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, d]) => `${day}  ${usd(d.usd)}  ${d.sessions} session${d.sessions === 1 ? "" : "s"}`);
  return [...days, "", `week ${week}  ${usd(weekTotal)}`].join("\n");
}
