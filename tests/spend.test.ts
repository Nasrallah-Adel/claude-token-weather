import { describe, expect, test } from 'claude-code/testing'
import { dayKey, isoWeek, sumSpend, staleKeys, spendEntry, SPEND_PREFIX } from '../hooks/spend.mjs'

const NOW = Date.parse('2026-10-09T10:00:00Z') // a Friday

describe('keys', () => {
  test('day and ISO week, UTC', () => {
    expect(dayKey(NOW)).toBe('2026-10-09')
    expect(isoWeek(NOW)).toBe('2026-W41')
    expect(isoWeek(Date.parse('2026-01-01T00:00:00Z'))).toBe('2026-W01')
    expect(isoWeek(Date.parse('2027-01-01T00:00:00Z'))).toBe('2026-W53')
    expect(isoWeek(Date.parse('2024-12-30T00:00:00Z'))).toBe('2025-W01')
  })
})

describe('spendEntry', () => {
  test('one session, stamped with its day and week', () => {
    expect(spendEntry(12.5, NOW)).toEqual({ day: '2026-10-09', week: '2026-W41', usd: 12.5, at: NOW })
  })
})

describe('sumSpend', () => {
  test('sums today and this week over every session, ignoring other days and bad rows', () => {
    const entries = [
      { day: '2026-10-09', week: '2026-W41', usd: 1.5, at: NOW },
      { day: '2026-10-09', week: '2026-W41', usd: 2.0, at: NOW },
      { day: '2026-10-07', week: '2026-W41', usd: 4.0, at: NOW },
      { day: '2026-10-01', week: '2026-W40', usd: 9.0, at: NOW },
      { day: '2026-10-09', week: '2026-W41', usd: 'x', at: NOW },
      null,
    ]
    expect(sumSpend(entries, NOW)).toEqual({ today: 3.5, week: 7.5 })
    expect(sumSpend([], NOW)).toEqual({ today: 0, week: 0 })
  })
})

describe('staleKeys', () => {
  test('keys older than the cutoff, by their `at`', () => {
    const old = NOW - 9 * 7 * 86_400_000
    const rows = { [`${SPEND_PREFIX}a`]: { at: old, usd: 1 }, [`${SPEND_PREFIX}b`]: { at: NOW, usd: 1 }, other: { at: old } }
    expect(staleKeys(rows, NOW)).toEqual([`${SPEND_PREFIX}a`])
  })
})
