import { describe, expect, test } from 'claude-code/testing'
import { weatherReport, parseWeatherArgs, ledgerReport } from '../hooks/weather-command.mjs'
import { parseOptions } from '../hooks/options.mjs'

const NOW = Date.parse('2026-10-09T10:00:00Z')
const view = {
  readings: [{ tokens: 100_000, window: 1_000_000, percent: 10 }, { tokens: 234_300, window: 1_000_000, percent: 23 }],
  usage: {
    rateLimits: [{ kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-09T10:43:00Z' }, { kind: 'seven_day', percentUsed: 35 }],
    cost: { usd: 12.55 },
  },
  spend: { today: 18.4, week: 31 },
  agents: { tokens: 1500, turns: 2, agents: { a1: { tokens: 1500, turns: 2, model: 'claude-haiku-5-5' } } },
  categories: [{ name: 'System prompt', tokens: 12_000, kind: 'used' }, { name: 'Free space', tokens: 700_000, kind: 'free' }],
  model: 'claude-fable-5-1',
}

describe('parseWeatherArgs', () => {
  test('the known forms, anything else is the report', () => {
    expect(parseWeatherArgs('')).toBe('report')
    expect(parseWeatherArgs(' reset ')).toBe('reset')
    expect(parseWeatherArgs('PANE')).toBe('pane')
    expect(parseWeatherArgs('compact')).toBe('compact')
    expect(parseWeatherArgs('ledger')).toBe('ledger')
    expect(parseWeatherArgs('help')).toBe('help')
    expect(parseWeatherArgs('bogus')).toBe('help')
  })
})

describe('weatherReport', () => {
  test('a full report', () => {
    const text = weatherReport(view, parseOptions({ compactAt: 400_000, guardRateLimit: 95 }), NOW)
    expect(text).toContain('☀ Clear  23% of context  234.3k / 1M')
    expect(text).toContain('5h 28% ↻43m')
    expect(text).toContain('7d 35%')
    expect(text).toContain('session $12.55')
    expect(text).toContain('today $18.40')
    expect(text).toContain('week $31.00')
    expect(text).toContain('agents 1.5k over 2 turns')
    expect(text).toContain('a1  1.5k  2 turns  claude-haiku-5-5')
    expect(text).toContain('System prompt  12k')
    expect(text).not.toContain('Free space')
    expect(text).toContain('last turns')
    expect(text).toContain('234.3k  ▲ +134.3k')
    expect(text).toContain('warn 200k')
    expect(text).toContain('compact at 400k')
    expect(text).toContain('rate guard 95%')
    expect(text).toContain('cost cap off')
    expect(text).toContain('downshift off')
  })
  test('before any reading', () => {
    const text = weatherReport({ readings: [], usage: undefined, spend: { today: 0, week: 0 }, agents: { tokens: 0, turns: 0, agents: {} } }, parseOptions(undefined), NOW)
    expect(text).toContain('no reading yet')
    expect(text).not.toContain('agents')
  })
})

describe('ledgerReport', () => {
  test('rows by day, newest first, with totals', () => {
    const text = ledgerReport([
      { day: '2026-10-09', week: '2026-W41', usd: 1.5, at: NOW },
      { day: '2026-10-08', week: '2026-W41', usd: 4, at: NOW },
      { day: '2026-10-09', week: '2026-W41', usd: 2, at: NOW },
    ], NOW)
    expect(text.split('\n')[0]).toContain('2026-10-09  $3.50  2 sessions')
    expect(text).toContain('2026-10-08  $4.00  1 session')
    expect(text).toContain('week 2026-W41  $7.50')
    expect(ledgerReport([], NOW)).toContain('no spend recorded')
  })
})
