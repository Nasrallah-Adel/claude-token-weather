import { describe, expect, test } from 'claude-code/testing'
import { pushReading, readingFrom, crossings, chart, trendWord, short, forecastFor, addAgentUsage, EMPTY_TALLY, HISTORY_PANE } from '../hooks/readings.mjs'

const r = (tokens: number) => ({ tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) })

describe('pushReading', () => {
  test('appends, drops the zero start reading, keeps the newest', () => {
    const a = pushReading([], r(0))
    const b = pushReading(a, r(1000))
    expect(b).toEqual([r(1000)])
    expect(a).toEqual([r(0)])
    const many = Array.from({ length: HISTORY_PANE + 5 }, (_, i) => r(i + 1)).reduce((acc, x) => pushReading(acc, x), [] as ReturnType<typeof r>[])
    expect(many.length).toBe(HISTORY_PANE)
    expect(many[many.length - 1]).toEqual(r(HISTORY_PANE + 5))
  })
})

describe('readingFrom', () => {
  test('a context with a window, and without', () => {
    expect(readingFrom({ tokens: 2500, window: 10_000 })).toEqual({ tokens: 2500, window: 10_000, percent: 25 })
    expect(readingFrom({ tokens: 1, window: 10_000, percent: 3 })).toEqual({ tokens: 1, window: 10_000, percent: 3 })
    expect(readingFrom({ window: 0 })).toBeUndefined()
    expect(readingFrom(undefined)).toBeUndefined()
  })
})

describe('crossings', () => {
  const lines = { warn: 200_000, danger: 300_000, compact: 0 }
  test('fires each line once on the way up, never a zero line', () => {
    expect(crossings(0, 150_000, lines)).toEqual([])
    expect(crossings(150_000, 250_000, lines)).toEqual(['warn'])
    expect(crossings(250_000, 350_000, lines)).toEqual(['danger'])
    expect(crossings(0, 350_000, lines)).toEqual(['warn', 'danger'])
    expect(crossings(350_000, 360_000, lines)).toEqual([])
  })
  test('re-arms after a drop below the line', () => {
    expect(crossings(350_000, 100_000, lines)).toEqual([])
    expect(crossings(100_000, 310_000, { ...lines, compact: 305_000 })).toEqual(['warn', 'danger', 'compact'])
  })
})

describe('chart, trend, short', () => {
  test('bars scale to the busiest reading, width trims the oldest', () => {
    expect(chart([r(100), r(50), r(100)])).toBe('█▄█')
    expect(chart([r(1), r(100), r(100)], 2)).toBe('██')
  })
  test('trend words', () => {
    expect(trendWord([r(1)])).toBe('')
    expect(trendWord([r(1000), r(3500)])).toBe('▲ +2.5k')
    expect(trendWord([r(3500), r(1000)])).toBe('▼ 2.5k')
    expect(trendWord([r(5), r(5)])).toBe('steady')
  })
  test('short numbers', () => {
    expect(short(999)).toBe('999')
    expect(short(1000)).toBe('1k')
    expect(short(234_300)).toBe('234.3k')
    expect(short(1_000_000)).toBe('1M')
    expect(short(1_250_000)).toBe('1.3M')
  })
  test('forecast bands', () => {
    expect(forecastFor(0).word).toBe('Clear')
    expect(forecastFor(25).word).toBe('Cloudy')
    expect(forecastFor(89).word).toBe('Storm')
    expect(forecastFor(95).word).toBe('Compact soon')
  })
})

describe('addAgentUsage', () => {
  test('sums the four counters per agent and in all, without touching the old tally', () => {
    const u = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 50, model: 'claude-haiku-5-5' }
    const one = addAgentUsage(EMPTY_TALLY, 'a1', u)
    const two = addAgentUsage(one, 'a1', u)
    const three = addAgentUsage(two, 'b2', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
    expect(one).toEqual({ tokens: 1000, turns: 1, agents: { a1: { tokens: 1000, turns: 1, model: 'claude-haiku-5-5' } } })
    expect(two.agents.a1).toEqual({ tokens: 2000, turns: 2, model: 'claude-haiku-5-5' })
    expect(three.tokens).toBe(2002)
    expect(three.turns).toBe(3)
    expect(Object.keys(three.agents)).toEqual(['a1', 'b2'])
    expect(EMPTY_TALLY.tokens).toBe(0)
    expect(addAgentUsage(EMPTY_TALLY, 'x', undefined).tokens).toBe(0)
  })
})
