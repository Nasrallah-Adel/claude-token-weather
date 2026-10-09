// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Token Weather: a live forecast of the context window above the prompt, and
// the actions it can take from there.
//
// This is the one module that touches $: the host follows $ only inside the
// file it is handed to, so every on(...) and $.noun.method(...) is spelled
// here, and helpers that take $ are top-level functions. The pure parts live
// beside it: options, readings, band, guards, spend, weather-command, pane.
//
// Hooks: session.start, session.end, session.measure, session.compact,
// turn.step, turn.complete, prompt.submit, command.run, ui.render on
// PromptHint, AbovePrompt and the weather Pane.
//
// Two readings: `live` follows every model request, every command and every
// measure, so the count on the band is the status line's; `readings` takes
// one entry per completed turn, for the chart, the trend and the crossings.

import { parseOptions } from "./options.mjs";
import { pushReading, readingFrom, crossings, short, addAgentUsage, EMPTY_TALLY } from "./readings.mjs";
import { bandParts, buttonSpecs, fitParts, layoutBand } from "./band.mjs";
import { guardVerdict, rateCrossings, downshiftDue, costWarningDue, windowLabel } from "./guards.mjs";
import { spendKey, spendEntry, sumSpend, staleKeys, SPEND_PREFIX, usd } from "./spend.mjs";
import { parseWeatherArgs, weatherReport, ledgerReport, HELP } from "./weather-command.mjs";
import { paneRows } from "./pane.mjs";

const USAGE_TICK_MS = 60_000;
// Actions wait for the hook that saw the reading to return: a turn's hooks are waited on.
const ACT_DELAY_MS = 150;
const PANE_ID = "weather";
const PANE_COLUMNS = 60;
const SOUND_ASSET = { warn: "sounds/warn.wav", danger: "sounds/danger.wav" };

// The options, parsed once per load.
let opts = parseOptions(undefined);
// Everything the drawings read; replaced, never mutated.
let state = fresh();
let usageTick;
let sessionId;
// This conversation's own spend row, the session cost it last saw, and what the other rows add up to.
let ownSpend;
let lastSeenUsd = 0;
let othersSpend = { today: 0, week: 0 };

function fresh() {
  return {
    readings: [],
    live: undefined,
    usage: undefined,
    spend: { today: 0, week: 0 },
    agents: EMPTY_TALLY,
    lastTokens: 0,
    rateFired: {},
    cost80: false,
    downshifted: false,
    compactFailed: false,
  };
}

function set(patch) {
  state = { ...state, ...patch };
}

export function register(on, options) {
  opts = parseOptions(options);

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    // This mod pins nothing under the prompt; clear an entry an earlier build left.
    $.ui.status(undefined);
    state = fresh();
    await registerCommand($);
    await takeReading($);
    await loadSpend($);
    if (usageTick) usageTick.cancel();
    usageTick = $.clock.every(USAGE_TICK_MS, () => refreshSpend($));
    if (opts.pane) await openPane($, false);
    return result;
  });

  // /clear starts a new conversation in the same process: fresh readings, every line armed again.
  on("session.end", ($, e, next) => {
    if (e.reason === "clear") {
      state = { ...fresh(), usage: state.usage, spend: state.spend };
      // The new conversation has an id of its own: its spend starts a row of its own.
      sessionId = undefined;
      ownSpend = undefined;
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    set({ usage: { rateLimits: e.rateLimits, cost: e.cost }, live: readingFrom(e.context) ?? state.live });
    if (e.changed.includes("cost") && e.cost) await recordSpend($, e.cost.usd);
    onWindowsMoved($, e.rateLimits);
    onCostMoved($, e.cost?.usd);
    $.ui.invalidate("ui.render");
    return next(e);
  });

  // The focus text rides along with /compact and auto-compaction too, when set.
  on("session.compact", ($, e, next) => {
    if (!opts.compactFocus || e.agentId || !Array.isArray(e.messages) || (e.trigger !== "manual" && e.trigger !== "auto")) return next(e);
    const instructions = [e.instructions, opts.compactFocus].filter(Boolean).join("\n");
    return next({ ...e, instructions });
  }).catch(($, e, next) => next(e));

  // Each model request moves the live count: the band follows the status line mid-turn.
  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    if (!e.agentId) await liveReading($);
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId) {
      set({ agents: addAgentUsage(state.agents, e.agentId, e.usage) });
      $.ui.invalidate("ui.render");
      return result;
    }
    const previous = state.lastTokens;
    await takeReading($);
    if (e.reason === "answer") afterTurn($, previous, state.lastTokens);
    return result;
  });

  // The guards: a prompt waits for a yes when a window or the cost cap says so.
  // A failing guard passes the prompt, never drops it: the .catch answers next(e).
  on("prompt.submit", async ($, e, next) => {
    const verdict = guardVerdict(state.usage, opts, e.origin?.kind);
    if (!verdict) return next(e);
    let choice;
    try {
      choice = await $.ui.ask(verdict.question, ["Send", "Later"]);
    } catch {
      choice = "Later";
    }
    if (choice === "Send") return next(e);
    // The text goes back in the box, so Later costs nothing but the send.
    defer($, () => $.prompt.fill({ text: e.text }));
    return { drop: `token-weather: ${verdict.reason}` };
  }).catch(($, e, next) => next(e));

  on("command.run", { command: "weather" }, async ($, e) => ({ text: await runWeather($, e) }))
    .catch(($, e, next) => (next.called ? next(e) : { text: `token weather: ${message(next.error?.cause ?? next.error)}` }));

  // A command's rows (/context, /compact, /clear) change the context without a turn: read it again after.
  on("command.run", async ($, e, next) => {
    const result = await next(typeof e.args === "string" ? e : { ...e, args: "" });
    if (e.command !== "weather") defer($, () => liveReading($));
    return result;
  }).catch(($, e, next) => next(e));

  // Below the prompt: the dim hint row. The engine's own hint ("auto mode on…") follows the line, dim.
  on("ui.render", { component: "PromptHint" }, ($, e, next) => {
    if (opts.placement !== "below" || state.readings.length === 0) return next(e);
    const { Box, Text } = $.ui.resolve(e);
    const columns = e.viewport?.columns ?? e.props?.bodyColumns ?? 80;
    // Two cells of padding, and the engine's hint keeps its own room at the end.
    const reserve = 2 + (e.props?.hint ? [...e.props.hint].length + 4 : 0);
    const line = fitParts(bandParts(state, opts, columns, Date.now()), columns, reserve).map((p) => Text(textProps(p)));
    if (e.props?.hint) line.push(Text({ dimColor: true, wrap: "truncate-end", children: `  · ${e.props.hint}` }));
    return Box({ flexDirection: "row", paddingX: 1, children: line });
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (opts.placement !== "above" || e.props?.hasSurvey || state.readings.length === 0) return next(e);
    const own = drawBand($, e);
    // The band is one instance: keep whatever the mods beneath draw, under this line.
    const below = await next(e);
    const { Box } = $.ui.resolve(e);
    return below ? Box({ flexDirection: "column", children: [own, below] }) : own;
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, ($, e) => drawPane($, e));
}

// ---- readings and what follows a turn ----------------------------------------------------

async function takeReading($) {
  try {
    const { context, rateLimits, cost } = await $.session.usage();
    const reading = readingFrom(context);
    if (!reading) {
      set({ usage: { rateLimits, cost } });
      return;
    }
    set({
      usage: { rateLimits, cost },
      readings: pushReading(state.readings, reading),
      live: reading,
      lastTokens: reading.tokens,
    });
    $.ui.invalidate("ui.render");
  } catch {
    // No reading this turn; the band keeps the last one.
  }
}

// The count as it stands now, without a bar on the chart.
async function liveReading($) {
  try {
    const { context, rateLimits, cost } = await $.session.usage();
    const reading = readingFrom(context);
    if (!reading) return;
    set({ usage: { rateLimits, cost }, live: reading });
    $.ui.invalidate("ui.render");
  } catch {
    // The band keeps the last reading.
  }
}

function afterTurn($, previous, tokens) {
  const crossed = crossings(previous, tokens, { warn: opts.warnTokens, danger: opts.dangerTokens, compact: opts.compactAt });
  if (crossed.includes("danger")) {
    alert($, `context passed ${short(opts.dangerTokens)}: red zone, consider /compact`, "danger");
  } else if (crossed.includes("warn")) {
    alert($, `context passed ${short(opts.warnTokens)}: long-context rate from here`, "warn");
  }
  if (crossed.includes("compact")) {
    defer($, () => runCompact($, { confirm: opts.compactConfirm, tokens }));
  } else if (opts.suggestCompact && tokens >= opts.dangerTokens) {
    defer($, () => $.prompt.suggest({ text: "/compact" }));
  }
}

function onWindowsMoved($, rateLimits) {
  const { fired, state: rateFired } = rateCrossings(state.rateFired, rateLimits, opts.rateWarnPercent);
  set({ rateFired });
  for (const kind of fired) {
    const w = rateLimits.find((x) => x.kind === kind);
    alert($, `${windowLabel(kind)} window at ${Math.round(w.percentUsed)}%`, "warn");
  }
  const due = downshiftDue(rateLimits, opts);
  if (due && !state.downshifted) {
    set({ downshifted: true });
    defer($, () => runDownshift($, due));
  }
}

function onCostMoved($, cost) {
  if (!state.cost80 && costWarningDue(cost, opts)) {
    set({ cost80: true });
    alert($, `session cost ${usd(cost)}: 80% of the ${usd(opts.costLimitUsd)} cap`, "warn");
  }
}

// ---- the actions ----------------------------------------------------------------------------

// Runs `fn` once the hook that scheduled it has returned: a turn's hooks are waited on, and
// compaction, commands, questions and suggestions all refuse to run inside one.
function defer($, fn) {
  $.clock.after(ACT_DELAY_MS, async () => {
    try {
      await fn();
    } catch (error) {
      $.ui.toast(`token-weather: ${message(error)}`);
    }
  });
}

function alert($, text, kind) {
  $.ui.toast(text);
  if (opts.notify) {
    $.ui.notify(text, { title: "token-weather" }).catch(() => {});
  }
  if (opts.sound === "beep") {
    $.audio.play({ asset: SOUND_ASSET[kind] ?? SOUND_ASSET.warn }).catch(() => {});
  } else if (opts.sound === "speak") {
    $.audio.speak(text).catch(() => {});
  }
}

async function runCompact($, { confirm, tokens }) {
  if (confirm) {
    let choice;
    try {
      choice = await $.ui.ask(`Context at ${short(tokens ?? state.lastTokens)}. Compact now?`, ["Compact", "Later"]);
    } catch {
      choice = "Later";
    }
    if (choice !== "Compact") return "later";
  }
  const args = opts.compactFocus ? { instructions: opts.compactFocus } : undefined;
  try {
    const result = await $.session.compact(args);
    if (result && "skip" in result) {
      $.ui.toast(`compaction skipped: ${result.skip}`);
      return "skipped";
    }
    return "compacted";
  } catch (error) {
    // Between turns the direct call works; mid-turn the command queues until the session is idle.
    await $.command.run({ command: "compact", args: opts.compactFocus });
    return `queued (${message(error)})`;
  }
}

async function runDownshift($, due) {
  let choice;
  try {
    choice = await $.ui.ask(`${due.window} window at ${Math.round(due.percent)}%. Switch to ${opts.downshiftModel}?`, ["Switch", "Keep"]);
  } catch {
    choice = "Keep";
  }
  if (choice !== "Switch") return;
  await $.command.run({ command: "model", args: opts.downshiftModel });
}

async function pressButton($, key) {
  if (key === "compact") return runCompact($, { confirm: opts.compactConfirm });
  if (key === "clear") {
    let choice;
    try {
      choice = await $.ui.ask("Clear the conversation?", ["Clear", "Keep"]);
    } catch {
      choice = "Keep";
    }
    if (choice !== "Clear") return;
  }
  await $.command.run({ command: key });
}

// ---- spend ledger over $.store ----------------------------------------------------------------

async function loadSpend($) {
  try {
    sessionId = await $.session.id();
    const keys = (await $.store.keys()).filter((k) => k.startsWith(SPEND_PREFIX));
    const rows = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await $.store.get(k)])));
    const now = Date.now();
    for (const key of staleKeys(rows, now)) await $.store.delete(key);
    ownSpend = rows[spendKey(sessionId)];
    othersSpend = sumSpend(Object.entries(rows).filter(([k]) => k !== spendKey(sessionId)).map(([, row]) => row), now);
    const own = sumSpend([ownSpend], now);
    set({ spend: { today: othersSpend.today + own.today, week: othersSpend.week + own.week } });
  } catch {
    // No ledger: the band shows the session cost alone.
  }
}

// Other sessions write their own rows: read them again on the clock, so the total keeps up.
async function refreshSpend($) {
  await loadSpend($);
  $.ui.invalidate("ui.render");
}

// The session cost is a running total; the row takes what it grew by since the last
// measure, so a /clear (a new id, a cost that may start over) never loses or doubles a cent.
async function recordSpend($, cost) {
  if (typeof cost !== "number" || !Number.isFinite(cost)) return;
  try {
    if (!sessionId) {
      sessionId = await $.session.id();
      const existing = await $.store.get(spendKey(sessionId));
      ownSpend = existing && typeof existing.usd === "number" ? existing : undefined;
    }
    const delta = cost < lastSeenUsd ? cost : cost - lastSeenUsd;
    lastSeenUsd = cost;
    const now = Date.now();
    // The row keeps the day the conversation started counting; only the amount grows.
    ownSpend = ownSpend ? { ...ownSpend, usd: ownSpend.usd + delta, at: now } : spendEntry(delta, now);
    await $.store.set(spendKey(sessionId), ownSpend);
    const own = sumSpend([ownSpend], now);
    set({ spend: { today: othersSpend.today + own.today, week: othersSpend.week + own.week } });
  } catch {
    // The ledger is a convenience; a failed write costs nothing else.
  }
}

// ---- /weather ---------------------------------------------------------------------------------

async function registerCommand($) {
  try {
    await $.command.register({
      name: "weather",
      description: "Token weather: the forecast, usage windows, spend and agents; reset | pane | compact | ledger",
      argumentHint: "[reset|pane|compact|ledger]",
    });
  } catch {
    // A refused registration leaves the band working.
  }
}

async function runWeather($, e) {
  const form = parseWeatherArgs(e.args);
  if (form === "help") return HELP;
  if (form === "reset") {
    state = { ...fresh(), usage: state.usage, spend: state.spend };
    $.ui.invalidate("ui.render");
    return "token weather: readings forgotten, toasts and actions re-armed";
  }
  if (form === "pane") return togglePane($);
  if (form === "compact") return `token weather: ${await runCompact($, { confirm: false })}`;
  if (form === "ledger") return ledgerReport(await spendRows($), Date.now());
  return weatherReport(await reportView($, e.presentation?.columns), opts, Date.now());
}

async function reportView($, columns) {
  const view = { readings: state.readings, live: state.live, usage: state.usage, spend: state.spend, agents: state.agents };
  try {
    const usage = await $.session.usage({ breakdown: "summary", columns });
    return { ...view, categories: usage.context?.breakdown?.categories, model: usage.context?.breakdown?.model ?? (await $.session.model()) };
  } catch {
    return view;
  }
}

async function spendRows($) {
  const keys = (await $.store.keys()).filter((k) => k.startsWith(SPEND_PREFIX));
  return Promise.all(keys.map((k) => $.store.get(k)));
}

// ---- the pane ---------------------------------------------------------------------------------

async function openPane($, asked) {
  const opened = await $.ui.open({ id: PANE_ID, title: "Token weather", columns: PANE_COLUMNS });
  if (!opened.isPlaced && asked) return `token weather: the pane is not placed (${opened.reason})`;
  if (!opened.isPlaced) $.ui.toast(`token-weather: pane waits for a wider terminal (${opened.reason})`);
  return opened.isPlaced ? "token weather: pane opened" : "";
}

async function togglePane($) {
  const open = (await $.ui.panes()).some((p) => p.id === PANE_ID);
  if (open) {
    await $.ui.close({ id: PANE_ID });
    return "token weather: pane closed";
  }
  return openPane($, true);
}

// ---- drawing ----------------------------------------------------------------------------------

function textProps(part) {
  return { color: part.color, bold: part.bold, dimColor: part.dim, children: part.text };
}

function drawBand($, e) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const columns = e.props?.bodyColumns ?? e.viewport?.columns ?? 80;
  const laid = layoutBand(bandParts(state, opts, columns, Date.now()), columns, buttonSpecs(opts, columns, Boolean(e.props?.isWorking)));
  const line = laid.parts.map((p) => Text(textProps(p)));
  const buttons = laid.buttons.flatMap((b) => [
    Text({ children: "  " }),
    Button({ key: b.key, label: b.label, hotkey: b.hotkey, plain: true, dimColor: true, onPress: () => pressButton($, b.key) }),
  ]);
  return Box({ flexDirection: "row", paddingX: 1, children: [...line, ...buttons] });
}

function drawPane($, e) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const size = { columns: e.props?.bodyColumns ?? e.viewport?.columns ?? 60, rows: e.viewport?.rows ?? 24 };
  const rows = paneRows(state, opts, size, Date.now()).map((r) => Text(textProps(r)));
  const close = Button({ key: "close", label: "close", role: "dismiss", plain: true, dimColor: true, onPress: () => $.ui.close({ id: PANE_ID }) });
  return Box({ flexDirection: "column", paddingX: 1, children: [...rows, Text({ children: "" }), close] });
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
