// Pure: the mod's options, parsed once in register() into one frozen config.
// Every key is a userConfig field in .claude-plugin/plugin.json; the defaults
// here match the manifest's. Actions are off by default, hints on.

import { CONTEXT_WARN_TOKENS, CONTEXT_DANGER_TOKENS } from "./usage-status.mjs";

export const DEFAULTS = Object.freeze({
  placement: "above",
  warnTokens: CONTEXT_WARN_TOKENS,
  dangerTokens: CONTEXT_DANGER_TOKENS,
  suggestCompact: true,
  buttons: true,
  showDailyCost: true,
  showAgents: true,
  compactAt: 0,
  compactConfirm: true,
  compactFocus: "",
  notify: false,
  rateWarnPercent: 90,
  sound: "off",
  guardRateLimit: 0,
  costLimitUsd: 0,
  downshiftModel: "",
  downshiftAt: 90,
  pane: false,
});

const PLACEMENTS = ["above", "below"];
const SOUNDS = ["off", "beep", "speak"];

/** The options as the engine hands them, made whole: defaults filled, bad values replaced. */
export function parseOptions(options) {
  const o = options ?? {};
  const warn = positive(o.warnTokens, DEFAULTS.warnTokens);
  const danger = Math.max(warn, positive(o.dangerTokens, DEFAULTS.dangerTokens));
  return Object.freeze({
    placement: pick(o.placement, PLACEMENTS, DEFAULTS.placement),
    warnTokens: warn,
    dangerTokens: danger,
    suggestCompact: bool(o.suggestCompact, DEFAULTS.suggestCompact),
    buttons: bool(o.buttons, DEFAULTS.buttons),
    showDailyCost: bool(o.showDailyCost, DEFAULTS.showDailyCost),
    showAgents: bool(o.showAgents, DEFAULTS.showAgents),
    compactAt: nonNegative(o.compactAt, DEFAULTS.compactAt),
    compactConfirm: bool(o.compactConfirm, DEFAULTS.compactConfirm),
    compactFocus: text(o.compactFocus, DEFAULTS.compactFocus),
    notify: bool(o.notify, DEFAULTS.notify),
    rateWarnPercent: percent(o.rateWarnPercent, DEFAULTS.rateWarnPercent),
    sound: pick(o.sound, SOUNDS, DEFAULTS.sound),
    guardRateLimit: percent(o.guardRateLimit, DEFAULTS.guardRateLimit),
    costLimitUsd: nonNegative(o.costLimitUsd, DEFAULTS.costLimitUsd),
    downshiftModel: text(o.downshiftModel, DEFAULTS.downshiftModel),
    downshiftAt: percent(o.downshiftAt, DEFAULTS.downshiftAt),
    pane: bool(o.pane, DEFAULTS.pane),
  });
}

function number(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function positive(value, fallback) {
  const n = number(value);
  return n !== undefined && n > 0 ? n : fallback;
}

function nonNegative(value, fallback) {
  const n = number(value);
  return n !== undefined && n >= 0 ? n : fallback;
}

// 0 means off; otherwise a percentage clamped to 1..100.
function percent(value, fallback) {
  const n = number(value);
  if (n === undefined || n < 0) return fallback;
  if (n === 0) return 0;
  return Math.min(100, Math.max(1, n));
}

function bool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function text(value, fallback) {
  return typeof value === "string" ? value.trim() : fallback;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
