// Pure: the verdicts behind the actions. The entry module asks, drops,
// toasts and runs commands on what these return.

import { formatPercent } from "./usage-status.mjs";
import { usd } from "./spend.mjs";

const PERSON_ORIGINS = ["composer", "bridge", "sdk"];
const LABEL = { five_hour: "5h", seven_day: "7d", spend_limit: "spend" };

function window(rateLimits, kind) {
  return (rateLimits ?? []).find((w) => w && w.kind === kind && typeof w.percentUsed === "number");
}

/** Why a prompt should wait, as a question and a drop reason; undefined lets it through. */
export function guardVerdict(usage, opts, originKind) {
  if (!PERSON_ORIGINS.includes(originKind)) return undefined;
  const five = window(usage?.rateLimits, "five_hour");
  if (opts.guardRateLimit > 0 && five && five.percentUsed >= opts.guardRateLimit) {
    const pct = `${formatPercent(five.percentUsed)}%`;
    return { question: `5h window at ${pct}. Send anyway?`, reason: `held back: 5h window at ${pct}` };
  }
  const cost = usage?.cost?.usd;
  if (opts.costLimitUsd > 0 && typeof cost === "number" && cost >= opts.costLimitUsd) {
    return {
      question: `Session cost ${usd(cost)} is past the ${usd(opts.costLimitUsd)} cap. Send anyway?`,
      reason: `held back: session cost ${usd(cost)} past the ${usd(opts.costLimitUsd)} cap`,
    };
  }
  return undefined;
}

/** Windows that just reached `percent`: { fired: kinds[], state: { kind: isFired } }; 0 never fires. */
export function rateCrossings(fired, rateLimits, percent) {
  const windows = (rateLimits ?? []).filter((w) => w && typeof w.percentUsed === "number");
  const state = windows.reduce((acc, w) => ({ ...acc, [w.kind]: percent > 0 && w.percentUsed >= percent }), { ...fired });
  const now = windows.filter((w) => state[w.kind] && !fired[w.kind]).map((w) => w.kind);
  return { fired: now, state };
}

export function windowLabel(kind) {
  return LABEL[kind] ?? kind;
}

/** The window that calls for the downshift, or undefined. */
export function downshiftDue(rateLimits, opts) {
  if (!opts.downshiftModel) return undefined;
  const w = window(rateLimits, "seven_day") ?? window(rateLimits, "five_hour");
  if (!w || w.percentUsed < opts.downshiftAt) return undefined;
  return { window: windowLabel(w.kind), percent: w.percentUsed };
}

export function costWarningDue(cost, opts) {
  return opts.costLimitUsd > 0 && typeof cost === "number" && cost >= 0.8 * opts.costLimitUsd;
}
