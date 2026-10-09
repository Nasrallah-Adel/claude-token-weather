// Run with: claude plugin test ~/.claude/skills/token-weather
import { describe, expect, test } from 'claude-code/testing'
import { parseOptions, DEFAULTS } from '../hooks/options.mjs'

describe('parseOptions', () => {
  test('nothing given: every default, actions off, hints on', () => {
    const o = parseOptions(undefined)
    expect(o).toEqual(DEFAULTS)
    expect(o.compactAt).toBe(0)
    expect(o.guardRateLimit).toBe(0)
    expect(o.downshiftModel).toBe('')
    expect(o.notify).toBe(false)
    expect(o.sound).toBe('off')
    expect(o.suggestCompact).toBe(true)
    expect(o.buttons).toBe(true)
    expect(Object.isFrozen(o)).toBe(true)
  })

  test('numbers as strings, negatives and junk', () => {
    const o = parseOptions({ warnTokens: '100000', dangerTokens: -5, compactAt: 'x', costLimitUsd: '2.5', rateWarnPercent: 250 })
    expect(o.warnTokens).toBe(100_000)
    expect(o.dangerTokens).toBe(300_000)
    expect(o.compactAt).toBe(0)
    expect(o.costLimitUsd).toBe(2.5)
    expect(o.rateWarnPercent).toBe(100)
  })

  test('danger never below warn', () => {
    expect(parseOptions({ warnTokens: 350_000 }).dangerTokens).toBe(350_000)
  })

  test('pickers fall back to their default outside the listed values', () => {
    expect(parseOptions({ placement: 'left', sound: 'loud' })).toEqual(expect.objectContaining({ placement: 'above', sound: 'off' }))
    expect(parseOptions({ placement: 'below', sound: 'speak' })).toEqual(expect.objectContaining({ placement: 'below', sound: 'speak' }))
  })

  test('booleans accept their string spellings', () => {
    const o = parseOptions({ notify: 'true', buttons: 'false', pane: 1 })
    expect(o.notify).toBe(true)
    expect(o.buttons).toBe(false)
    expect(o.pane).toBe(false)
  })

  test('percents: 0 is off, otherwise 1..100', () => {
    expect(parseOptions({ guardRateLimit: 0 }).guardRateLimit).toBe(0)
    expect(parseOptions({ guardRateLimit: 0.2 }).guardRateLimit).toBe(1)
    expect(parseOptions({ downshiftAt: 95 }).downshiftAt).toBe(95)
    expect(parseOptions({ downshiftAt: -1 }).downshiftAt).toBe(90)
  })

  test('texts are trimmed', () => {
    expect(parseOptions({ compactFocus: '  keep the plan ', downshiftModel: ' sonnet ' })).toEqual(expect.objectContaining({ compactFocus: 'keep the plan', downshiftModel: 'sonnet' }))
  })
})
