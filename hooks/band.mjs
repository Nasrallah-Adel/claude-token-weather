// Pure: what the band line holds, as parts { text, color?, bold?, dim? } the
// entry module turns into Text elements, and the Buttons it adds.

import { usageParts, contextColor, rateTag } from "./usage-status.mjs";
import { forecastFor, chart, trendWord, short, HISTORY_BAND } from "./readings.mjs";
import { usd } from "./spend.mjs";

export const CHART_MIN_COLUMNS = 60;
export const BUTTONS_MIN_COLUMNS = 110;
const SEP = "  · ";

export const BUTTONS = Object.freeze([
  { key: "compact", label: "compact", hotkey: "c" },
  { key: "context", label: "context", hotkey: "x" },
  { key: "cost", label: "cost", hotkey: "d" },
  { key: "clear", label: "clear", hotkey: "n" },
]);

/** The band's text parts, in order, for a state with at least one reading. */
export function bandParts(state, opts, columns, nowMs) {
  const readings = state.readings;
  const now = readings[readings.length - 1];
  const f = forecastFor(now.percent);
  const size = contextColor(now.tokens, opts.warnTokens, opts.dangerTokens);
  const tag = rateTag(now.tokens, opts.warnTokens);
  const head = [
    { text: `${f.icon}  ${f.word}`, color: f.color, bold: true },
    { text: `  ${now.percent}% of context` },
    { text: "  " },
    { text: short(now.tokens), color: size, bold: true },
    { text: ` / ${short(now.window)}`, dim: true },
    ...(tag ? [{ text: ` ${tag}`, color: size, bold: true }] : []),
  ];
  const trend = trendWord(readings);
  const graph = columns >= CHART_MIN_COLUMNS
    ? [
        { text: "   last turns ", dim: true },
        { text: chart(readings, HISTORY_BAND), color: f.color },
        ...(trend ? [{ text: `  ${trend}`, dim: true }] : []),
      ]
    : [];
  const tail = [
    ...usageParts(state.usage, nowMs).map((p) => ({ text: p.text, color: p.color, bold: Boolean(p.color) })),
    ...spendPart(state.spend, opts),
    ...agentsPart(state.agents, opts),
  ].flatMap((p) => [{ text: SEP, dim: true }, p]);
  return [...head, ...graph, ...tail];
}

function spendPart(spend, opts) {
  if (!opts.showDailyCost || !spend || (spend.today <= 0 && spend.week <= 0)) return [];
  return [{ text: `today ${usd(spend.today)} · wk ${usd(spend.week)}`, dim: true }];
}

function agentsPart(tally, opts) {
  if (!opts.showAgents || !tally || tally.tokens <= 0) return [];
  return [{ text: `agents ${short(tally.tokens)}`, dim: true }];
}

/** The Buttons to draw after the line: none when off, narrow, or while a turn runs. */
export function buttonSpecs(opts, columns, isWorking) {
  if (!opts.buttons || isWorking || columns < BUTTONS_MIN_COLUMNS) return [];
  return BUTTONS.map((b) => ({ ...b }));
}
