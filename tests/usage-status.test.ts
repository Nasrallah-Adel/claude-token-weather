// Run with: claude plugin test ~/.claude/skills/token-weather
import { describe, expect, test } from 'claude-code/testing'
import { usageParts, resetIn, formatPercent, colorFor, contextColor } from '../hooks/usage-status.mjs'

const NOW = Date.parse('2026-10-09T10:00:00Z')

describe('usageParts', () => {
  test('two windows and cost, in order, with countdowns', () => {
    const parts = usageParts(
      {
        rateLimits: [
          { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-12T14:00:00Z' },
          { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-09T12:10:00Z' },
        ],
        cost: { usd: 1.234 },
      },
      NOW,
    )
    expect(parts).toEqual([
      { text: '5h 23.5% ↻2h10m', color: 'green' },
      { text: '7d 41% ↻3d4h', color: 'green' },
      { text: '$1.23' },
    ])
  })

  test('cost only before the first window reading', () => {
    expect(usageParts({ rateLimits: [], cost: { usd: 0 } }, NOW)).toEqual([{ text: '$0.00' }])
  })

  test('windows only when the host keeps no cost ledger', () => {
    expect(usageParts({ rateLimits: [{ kind: 'five_hour', percentUsed: 7 }] }, NOW)).toEqual([{ text: '5h 7%', color: 'green' }])
  })

  test('nothing to show', () => {
    expect(usageParts({ rateLimits: [] }, NOW)).toEqual([])
    expect(usageParts(undefined, NOW)).toEqual([])
  })

  test('an unknown window kind keeps its own name', () => {
    expect(usageParts({ rateLimits: [{ kind: 'spend_limit', percentUsed: 120 }] }, NOW)).toEqual([{ text: 'spend 120%', color: 'red' }])
  })
})

describe('colorFor', () => {
  test('green, yellow, red thresholds', () => {
    expect(colorFor(0)).toBe('green')
    expect(colorFor(49.9)).toBe('green')
    expect(colorFor(50)).toBe('yellow')
    expect(colorFor(79.9)).toBe('yellow')
    expect(colorFor(80)).toBe('red')
    expect(colorFor(120)).toBe('red')
  })
})

describe('resetIn', () => {
  test('minutes, hours and days', () => {
    expect(resetIn('2026-10-09T10:05:00Z', NOW)).toBe('5m')
    expect(resetIn('2026-10-09T11:05:00Z', NOW)).toBe('1h05m')
    expect(resetIn('2026-10-10T10:00:00Z', NOW)).toBe('1d')
    expect(resetIn('2026-10-11T13:00:00Z', NOW)).toBe('2d3h')
  })

  test('a past or bad timestamp', () => {
    expect(resetIn('2026-10-09T09:00:00Z', NOW)).toBe('0m')
    expect(resetIn('not a date', NOW)).toBeUndefined()
    expect(resetIn(undefined, NOW)).toBeUndefined()
  })
})

describe('formatPercent', () => {
  test('whole and one-decimal values', () => {
    expect(formatPercent(7)).toBe('7')
    expect(formatPercent(23.5)).toBe('23.5')
    expect(formatPercent(-1)).toBe('0')
  })
})

describe('contextColor', () => {
  test('green under 200k, yellow to 300k, red above', () => {
    expect(contextColor(0)).toBe('green')
    expect(contextColor(199_999)).toBe('green')
    expect(contextColor(200_000)).toBe('yellow')
    expect(contextColor(299_999)).toBe('yellow')
    expect(contextColor(300_000)).toBe('red')
    expect(contextColor(900_000)).toBe('red')
  })
})
