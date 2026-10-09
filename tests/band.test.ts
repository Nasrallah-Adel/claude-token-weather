import { describe, expect, test } from 'claude-code/testing'
import { bandParts, buttonSpecs, fitParts, layoutBand, BUTTONS_MIN_COLUMNS } from '../hooks/band.mjs'
import { parseOptions } from '../hooks/options.mjs'

const NOW = Date.parse('2026-10-09T10:00:00Z')
const opts = parseOptions(undefined)
const state = {
  readings: [{ tokens: 100_000, window: 1_000_000, percent: 10 }, { tokens: 234_300, window: 1_000_000, percent: 23 }],
  usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-09T10:43:00Z' }], cost: { usd: 12.55 } },
  spend: { today: 18.4, week: 31 },
  agents: { tokens: 1_200_000, turns: 3, agents: {} },
}

describe('bandParts', () => {
  test('the whole line at a wide terminal', () => {
    const texts = bandParts(state, opts, 160, NOW).map((p) => p.text)
    expect(texts[0]).toBe('☀  Clear')
    expect(texts).toContain('  23% of context')
    expect(texts).toContain('234.3k')
    expect(texts).toContain(' ⚠2x')
    expect(texts).toContain('▃█')
    expect(texts).toContain('  ▲ +134.3k')
    expect(texts).toContain('5h 28% ↻43m')
    expect(texts).toContain('$12.55')
    expect(texts).toContain('today $18.40 · wk $31.00')
    expect(texts).toContain('agents 1.2M')
  })
  test('colors: forecast on the word, size on the count, windows by use', () => {
    const parts = bandParts(state, opts, 160, NOW)
    expect(parts[0]).toEqual(expect.objectContaining({ color: 'yellow', bold: true }))
    expect(parts.find((p) => p.text === '234.3k')).toEqual(expect.objectContaining({ color: 'yellow', bold: true }))
    expect(parts.find((p) => p.text === '5h 28% ↻43m')).toEqual(expect.objectContaining({ color: 'green' }))
  })
  test('a narrow terminal drops the chart; options drop the spend and agents', () => {
    const narrow = bandParts(state, opts, 50, NOW).map((p) => p.text)
    expect(narrow.some((t) => t.includes('last turns'))).toBe(false)
    const off = bandParts(state, parseOptions({ showDailyCost: false, showAgents: false }), 160, NOW).map((p) => p.text)
    expect(off.some((t) => t.startsWith('today'))).toBe(false)
    expect(off.some((t) => t.startsWith('agents'))).toBe(false)
  })
  test('nothing to add when the spend and tally are empty', () => {
    const texts = bandParts({ ...state, spend: { today: 0, week: 0 }, agents: { tokens: 0, turns: 0, agents: {} } }, opts, 160, NOW).map((p) => p.text)
    expect(texts.some((t) => t.startsWith('today'))).toBe(false)
    expect(texts.some((t) => t.startsWith('agents'))).toBe(false)
  })
})

describe('buttonSpecs', () => {
  test('four buttons at a wide band, none when narrow, off, or a turn runs', () => {
    expect(buttonSpecs(opts, BUTTONS_MIN_COLUMNS, false).map((b) => b.key)).toEqual(['compact', 'context', 'cost', 'clear'])
    expect(buttonSpecs(opts, BUTTONS_MIN_COLUMNS - 1, false)).toEqual([])
    expect(buttonSpecs(parseOptions({ buttons: false }), 200, false)).toEqual([])
    expect(buttonSpecs(opts, 200, true)).toEqual([])
    expect(buttonSpecs(opts, 200, false)[0]).toEqual({ key: 'compact', label: 'compact', hotkey: 'c' })
  })
})

describe('fitParts', () => {
  const NOW2 = Date.parse('2026-10-09T10:00:00Z')
  const wide = bandParts(state, opts, 200, NOW2)
  const width = (parts: { text: string }[]) => parts.reduce((n, p) => n + [...p.text].length, 0)
  test('leaves a fitting line alone, drops the least needed parts first until it fits', () => {
    expect(fitParts(wide, 200, 0)).toEqual(wide)
    const w = width(wide)
    const tighter = fitParts(wide, w - 1, 0)
    expect(width(tighter)).toBeLessThanOrEqual(w - 1)
    expect(tighter.map((p) => p.text)).not.toContain('agents 1.2M')
    const tight = fitParts(wide, 60, 0)
    expect(width(tight)).toBeLessThanOrEqual(60)
    expect(tight[0].text).toBe('☀  Clear')
    expect(tight.map((p) => p.text)).toContain('234.3k')
    expect(tight.some((p) => p.text.includes('last turns'))).toBe(false)
  })
  test('reserves room for the buttons', () => {
    const w = width(wide)
    expect(width(fitParts(wide, w + 10, 30))).toBeLessThanOrEqual(w - 20)
  })
  test('the head always survives', () => {
    const tiny = fitParts(wide, 10, 0)
    expect(tiny.map((p) => p.text)).toEqual(['☀  Clear', '  23%', '  ', '234.3k'])
  })
})

describe('layoutBand', () => {
  const NOW3 = Date.parse('2026-10-09T10:00:00Z')
  const wide = bandParts(state, opts, 200, NOW3)
  const specs = buttonSpecs(opts, 200, false)
  const width = (parts: { text: string }[]) => parts.reduce((n, p) => n + [...p.text].length, 0)
  test('wide: everything and the buttons', () => {
    const laid = layoutBand(wide, 200, specs)
    expect(laid.buttons.length).toBe(4)
    expect(laid.parts.map((p) => p.text)).toContain('agents 1.2M')
  })
  test('mid: the spend and agents give way, the buttons stay', () => {
    const laid = layoutBand(wide, width(wide) + 20, specs)
    expect(laid.buttons.length).toBe(4)
    expect(laid.parts.map((p) => p.text)).toContain('5h 28% ↻43m')
  })
  test('narrow: the buttons move under the line, never away', () => {
    const laid = layoutBand(wide, 100, specs)
    expect(laid.buttons.length).toBe(4)
    expect(laid.row).toBe('below')
    expect(laid.parts.map((p) => p.text)).toContain('5h 28% ↻43m')
    expect(laid.parts.map((p) => p.text)).toContain('$12.55')
  })
  test('no buttons asked: the line alone', () => {
    expect(layoutBand(wide, 200, []).buttons).toEqual([])
  })
})
