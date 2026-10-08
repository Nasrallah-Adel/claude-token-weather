// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Token Weather: a live forecast of the context window, above the prompt.
//
// turn.complete: after each main-loop turn, read the context window's fill
// from $.session.usage() (the same figures the status line shows) and keep
// the last HISTORY readings.
// session.start: take a first reading, so the band shows before any turn.
// ui.render (AbovePrompt): one line: icon, forecast word, percent, tokens
// used of the window, a block-character chart of the recent turns, then the
// account's 5-hour and 7-day windows with their reset countdowns and the
// session cost (from the same $.session.usage() call).
// session.measure: the engine pushes the windows and the cost when one moves.
// $.clock.every(USAGE_TICK_MS): redraw so the countdowns keep counting.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

import { usageParts } from "./usage-status.mjs";

const HISTORY = 12;
const USAGE_TICK_MS = 60_000;
const BARS = "▁▂▃▄▅▆▇█";

// Forecast bands, by percent of the window used.
const FORECAST = [
// Single-width text symbols, not emoji: they line up in every terminal font.
  { upTo: 25, icon: "☀", word: "Clear", color: "yellow" },
  { upTo: 50, icon: "☁", word: "Cloudy", color: "cyan" },
  { upTo: 75, icon: "☂", word: "Showers", color: "blue" },
  { upTo: 90, icon: "☇", word: "Storm", color: "magenta" },
  { upTo: Infinity, icon: "↯", word: "Compact soon", color: "red" },
];

// Readings: { tokens, window, percent }, oldest first.
let readings = [];
// The last { rateLimits, cost } the engine reported.
let usageSnapshot;
let usageTick;

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    // This mod pins nothing under the prompt; clear an entry an earlier build left.
    $.ui.status(undefined);
    readings = [];
    await takeReading($);
    if (usageTick) usageTick.cancel();
    usageTick = $.clock.every(USAGE_TICK_MS, () => $.ui.invalidate("ui.render"));
    return result;
  });

  on("session.measure", ($, e, next) => {
    usageSnapshot = { rateLimits: e.rateLimits, cost: e.cost };
    $.ui.invalidate("ui.render");
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId) {
      return result;
    }
    await takeReading($);
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.hasSurvey || readings.length === 0) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    const own = band(Box, Text, e.bodyColumns ?? 80);
    // The band is one instance: keep whatever the mods beneath draw, under this line.
    const below = await next(e);
    return below ? Box({ flexDirection: "column", children: [own, below] }) : own;
  });
}

async function takeReading($) {
  try {
    const { context, rateLimits, cost } = await $.session.usage();
    usageSnapshot = { rateLimits, cost };
    if (!context || !context.window) {
      return;
    }
    const tokens = context.tokens ?? 0;
    const percent = Math.round(context.percent ?? (tokens / context.window) * 100);
    // The session.start reading is 0 before any response; drop it once real readings arrive.
    readings = readings.filter((r) => r.tokens > 0);
    readings.push({ tokens, window: context.window, percent });
    if (readings.length > HISTORY) {
      readings = readings.slice(-HISTORY);
    }
    $.ui.invalidate("ui.render");
  } catch {
    // No reading this turn; the band keeps the last one.
  }
}

function band(Box, Text, columns) {
  const now = readings[readings.length - 1];
  const f = forecastFor(now.percent);
  const trend = trendWord();
  const parts = [
    Text({ color: f.color, bold: true, children: `${f.icon}  ${f.word}` }),
    Text({ children: `  ${now.percent}% of context` }),
    Text({ dimColor: true, children: `  ${short(now.tokens)} / ${short(now.window)}` }),
  ];
  if (columns >= 60) {
    parts.push(Text({ dimColor: true, children: "   last turns " }));
    parts.push(Text({ color: f.color, children: chart() }));
    if (trend) {
      parts.push(Text({ dimColor: true, children: `  ${trend}` }));
    }
  }
  for (const part of usageParts(usageSnapshot, Date.now())) {
    parts.push(Text({ dimColor: true, children: "  · " }));
    parts.push(Text({ color: part.color, bold: Boolean(part.color), children: part.text }));
  }
  return Box({ flexDirection: "row", paddingX: 1, children: parts });
}

function forecastFor(percent) {
  return FORECAST.find((band) => percent < band.upTo) ?? FORECAST[FORECAST.length - 1];
}

// Bars scale to the busiest reading shown, so growth shows at any fill level.
function chart() {
  const top = Math.max(...readings.map((r) => r.tokens), 1);
  const bars = readings.map((r) => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]);
  return bars.join("");
}

function trendWord() {
  if (readings.length < 2) {
    return "";
  }
  const delta = readings[readings.length - 1].tokens - readings[readings.length - 2].tokens;
  if (delta > 0) return `▲ +${short(delta)}`;
  if (delta < 0) return `▼ ${short(-delta)}`;
  return "steady";
}

function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}
