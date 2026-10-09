import { describe, expect, test } from 'claude-code/testing'
import { paneRows, sparkline, bar } from '../hooks/pane.mjs'
import { parseOptions } from '../hooks/options.mjs'

const NOW = Date.parse('2026-10-09T10:00:00Z')

describe('sparkline and bar', () => {
  test('buckets readings to the width by their max', () => {
    const readings = Array.from({ length: 8 }, (_, i) => ({ tokens: (i + 1) * 100, window: 1000, percent: 0 }))
    expect(sparkline(readings, 4)).toBe('▂▄▆█')
    expect(sparkline(readings, 8)).toBe('▁▂▃▄▅▆▇█')
    expect(sparkline([], 4)).toBe('')
  })
  test('a bar of a width', () => {
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(0, 4)).toBe('░░░░')
    expect(bar(120, 4)).toBe('████')
  })
})

describe('paneRows', () => {
  test('the rows a pane draws', () => {
    const rows = paneRows({
      readings: [{ tokens: 100_000, window: 1_000_000, percent: 10 }, { tokens: 234_300, window: 1_000_000, percent: 23 }],
      usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-09T10:43:00Z' }], cost: { usd: 12.55 } },
      spend: { today: 18.4, week: 31 },
      agents: { tokens: 1500, turns: 2, agents: {} },
    }, parseOptions(undefined), { columns: 40, rows: 20 }, NOW)
    const texts = rows.map((r) => r.text)
    expect(texts[0]).toContain('☀ Clear  23%  234.3k / 1M')
    expect(texts.some((t) => t.startsWith('5h  '))).toBe(true)
    expect(texts.find((t) => t.startsWith('5h  '))).toContain('28% ↻43m')
    expect(texts).toContain('session $12.55  today $18.40  week $31.00')
    expect(texts).toContain('agents 1.5k over 2 turns')
    expect(rows.find((r) => r.kind === 'chart')?.text.length).toBeLessThanOrEqual(40)
  })
})
