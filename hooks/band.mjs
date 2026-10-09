// Pure: what the band line holds, as parts { text, color?, bold?, dim? } the
// entry module turns into Text elements, and the Buttons it adds.

import { usageParts, contextColor, rateTag } from "./usage-status.mjs";
import { forecastFor, chart, trendWord, short, HISTORY_BAND } from "./readings.mjs";
import { usd } from "./spend.mjs";

export const CHART_MIN_COLUMNS = 60;
export const BUTTONS_MIN_COLUMNS = 110;
const SEP = "  · ";
// Buttons as drawn, "[ compact ]" and so on, two spaces before each.
export const BUTTON_CELLS = 4 * 2 + "[ compact ]".length + "[ context ]".length + "[ cost ]".length + "[ clear ]".length;

export const BUTTONS = Object.freeze([
  { key: "compact", label: "compact", hotkey: "c" },
  { key: "context", label: "context", hotkey: "x" },
  { key: "cost", label: "cost", hotkey: "d" },
  { key: "clear", label: "clear", hotkey: "n" },
]);

/** The band's text parts, in order, for a state with at least one reading. */
export function bandParts(state, opts, columns, nowMs) {
  const readings = state.readings;
  // The live reading moves with every model request and command; the chart keeps one bar per turn.
  const now = state.live ?? readings[readings.length - 1];
  const f = forecastFor(now.percent);
  const size = contextColor(now.tokens, opts.warnTokens, opts.dangerTokens);
  const tag = rateTag(now.tokens, opts.warnTokens);
  // `drop`: the order a part gives way when the band is too narrow (lowest first); none: never.
  const head = [
    { text: `${f.icon}  ${f.word}`, color: f.color, bold: true },
    { text: `  ${now.percent}% of context`, drop: 9, instead: `  ${now.percent}%` },
    { text: "  " },
    { text: short(now.tokens), color: size, bold: true },
    { text: ` / ${short(now.window)}`, dim: true, drop: 8 },
    ...(tag ? [{ text: ` ${tag}`, color: size, bold: true, drop: 7 }] : []),
  ];
  const trend = trendWord(readings);
  const graph = columns >= CHART_MIN_COLUMNS
    ? [
        { text: "   last turns ", dim: true, drop: 5 },
        { text: chart(readings, HISTORY_BAND), color: f.color, drop: 5 },
        ...(trend ? [{ text: `  ${trend}`, dim: true, drop: 4 }] : []),
      ]
    : [];
  const tail = [
    ...usageParts(state.usage, nowMs).map((p) => ({ text: p.text, color: p.color, bold: Boolean(p.color), drop: 6 })),
    ...spendPart(state.spend, opts),
    ...agentsPart(state.agents, opts),
  ].flatMap((p) => [{ text: SEP, dim: true, drop: p.drop }, p]);
  return [...head, ...graph, ...tail];
}

/** The parts that fit in `columns` cells, `reserve` of them kept for the buttons: parts give way by their `drop` rank. */
export function fitParts(parts, columns, reserve) {
  const room = Math.max(0, columns - reserve);
  const width = (list) => list.reduce((n, p) => n + [...p.text].length, 0);
  const ranks = [...new Set(parts.filter((p) => p.drop).map((p) => p.drop))].sort((a, b) => a - b);
  return ranks.reduce((kept, rank) => {
    if (width(kept) <= room) return kept;
    return kept.flatMap((p) => (p.drop !== rank ? [p] : p.instead ? [{ ...p, text: p.instead, drop: undefined, instead: undefined }] : []));
  }, parts);
}

function spendPart(spend, opts) {
  if (!opts.showDailyCost || !spend || (spend.today <= 0 && spend.week <= 0)) return [];
  return [{ text: `today ${usd(spend.today)} · wk ${usd(spend.week)}`, dim: true, drop: 2 }];
}

function agentsPart(tally, opts) {
  if (!opts.showAgents || !tally || tally.tokens <= 0) return [];
  return [{ text: `agents ${short(tally.tokens)}`, dim: true, drop: 1 }];
}

/** The Buttons to draw after the line: none when off, narrow, or while a turn runs. */
export function buttonSpecs(opts, columns, isWorking) {
  if (!opts.buttons || isWorking || columns < BUTTONS_MIN_COLUMNS) return [];
  return BUTTONS.map((b) => ({ ...b }));
}

// Parts of this rank or above (the windows, the cost, the count) outrank the buttons.
const KEEP_OVER_BUTTONS = 6;

/**
 * The line and the buttons laid out in `columns`: beside each other when they fit with the
 * windows and the cost, else the buttons on a row of their own (`row: "below"`). A band
 * shorter than its tree scrolls, so the second row is never dropped for want of rows.
 */
export function layoutBand(parts, columns, specs, padding = 2) {
  if (specs.length === 0) return { parts: fitParts(parts, columns, padding), buttons: [], row: "same" };
  const withButtons = fitParts(parts, columns, padding + BUTTON_CELLS);
  const kept = withButtons.filter((p) => p.drop >= KEEP_OVER_BUTTONS).length;
  const wanted = parts.filter((p) => p.drop >= KEEP_OVER_BUTTONS).length;
  if (kept >= wanted) return { parts: withButtons, buttons: specs, row: "same" };
  return { parts: fitParts(parts, columns, padding), buttons: specs, row: "below" };
}
