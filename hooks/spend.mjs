// Pure: the spend ledger's keys and sums. The entry module reads and writes
// $.store; each session writes only its own key, so concurrent sessions
// never overwrite each other. Rows: { day, week, usd, at }.

export const SPEND_PREFIX = "spend:";
const DAY_MS = 86_400_000;
const KEEP_MS = 8 * 7 * DAY_MS;

export function spendKey(sessionId) {
  return `${SPEND_PREFIX}${sessionId}`;
}

/** The row a session stores: its cost so far, stamped with the day and week it started counting. */
export function spendEntry(usd, nowMs) {
  return { day: dayKey(nowMs), week: isoWeek(nowMs), usd, at: nowMs };
}

export function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO 8601 week, `2026-W41`, in UTC. */
export function isoWeek(ms) {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Today's and this week's total over every session's row. */
export function sumSpend(entries, nowMs) {
  const today = dayKey(nowMs);
  const week = isoWeek(nowMs);
  return entries
    .filter((e) => e && typeof e.usd === "number" && Number.isFinite(e.usd))
    .reduce((acc, e) => ({
      today: acc.today + (e.day === today ? e.usd : 0),
      week: acc.week + (e.week === week ? e.usd : 0),
    }), { today: 0, week: 0 });
}

/** The spend keys whose row is older than eight weeks: safe to delete. */
export function staleKeys(rows, nowMs) {
  return Object.entries(rows)
    .filter(([key, row]) => key.startsWith(SPEND_PREFIX) && (!row || typeof row.at !== "number" || nowMs - row.at > KEEP_MS))
    .map(([key]) => key);
}

export function usd(n) {
  return `$${n.toFixed(2)}`;
}
