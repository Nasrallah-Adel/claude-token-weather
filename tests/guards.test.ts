import { describe, expect, test } from 'claude-code/testing'
import { guardVerdict, rateCrossings, downshiftDue, costWarningDue } from '../hooks/guards.mjs'
import { parseOptions } from '../hooks/options.mjs'

const usage = { rateLimits: [{ kind: 'five_hour', percentUsed: 96 }, { kind: 'seven_day', percentUsed: 91 }], cost: { usd: 12 } }

describe('guardVerdict', () => {
  test('off by default, never for a prompt that is not the person\'s', () => {
    expect(guardVerdict(usage, parseOptions(undefined), 'composer')).toBeUndefined()
    expect(guardVerdict(usage, parseOptions({ guardRateLimit: 50 }), 'plugin')).toBeUndefined()
    expect(guardVerdict(usage, parseOptions({ guardRateLimit: 50 }), 'scheduled-trigger')).toBeUndefined()
  })
  test('the 5h window and the cost cap, with a question and a reason', () => {
    expect(guardVerdict(usage, parseOptions({ guardRateLimit: 95 }), 'composer')).toEqual({ question: '5h window at 96%. Send anyway?', reason: 'held back: 5h window at 96%' })
    expect(guardVerdict(usage, parseOptions({ guardRateLimit: 97 }), 'composer')).toBeUndefined()
    expect(guardVerdict(usage, parseOptions({ costLimitUsd: 10 }), 'composer')).toEqual({ question: 'Session cost $12.00 is past the $10.00 cap. Send anyway?', reason: 'held back: session cost $12.00 past the $10.00 cap' })
    expect(guardVerdict(undefined, parseOptions({ guardRateLimit: 1, costLimitUsd: 1 }), 'composer')).toBeUndefined()
  })
})

describe('rateCrossings', () => {
  test('fires once per window from the line, re-arms below it', () => {
    const a = rateCrossings({}, usage.rateLimits, 90)
    expect(a.fired).toEqual(['five_hour', 'seven_day'])
    const b = rateCrossings(a.state, usage.rateLimits, 90)
    expect(b.fired).toEqual([])
    const c = rateCrossings(b.state, [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 91 }], 90)
    expect(c.fired).toEqual([])
    expect(c.state).toEqual({ five_hour: false, seven_day: true })
    expect(rateCrossings({}, usage.rateLimits, 0).fired).toEqual([])
  })
})

describe('downshiftDue and costWarningDue', () => {
  test('downshift reads the weekly window first, then the 5-hour one', () => {
    expect(downshiftDue(usage.rateLimits, parseOptions({ downshiftModel: 'sonnet', downshiftAt: 90 }))).toEqual({ window: '7d', percent: 91 })
    expect(downshiftDue([{ kind: 'five_hour', percentUsed: 95 }], parseOptions({ downshiftModel: 'sonnet', downshiftAt: 90 }))).toEqual({ window: '5h', percent: 95 })
    expect(downshiftDue(usage.rateLimits, parseOptions({ downshiftModel: 'sonnet', downshiftAt: 99 }))).toBeUndefined()
    expect(downshiftDue(usage.rateLimits, parseOptions(undefined))).toBeUndefined()
  })
  test('the 80% cost warning', () => {
    expect(costWarningDue(8, parseOptions({ costLimitUsd: 10 }))).toBe(true)
    expect(costWarningDue(7.9, parseOptions({ costLimitUsd: 10 }))).toBe(false)
    expect(costWarningDue(100, parseOptions(undefined))).toBe(false)
  })
})
