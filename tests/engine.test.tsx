// The module end to end through the engine's own kit: the band, the buttons, /weather,
// the guards, the deferred actions, the spend ledger and the pane.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code'

type Calls = { sessionId: string; toasts: string[]; commands: { command: string; args?: string }[]; compacts: unknown[]; suggests: string[]; opens: string[]; closes: string[]; notifies: string[]; asks: string[] }

const USAGE = { startedAt: 0, context: { tokens: 234_300, window: 1_000_000, percent: 23 }, rateLimits: [{ kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-09T10:43:00Z' }], cost: { usd: 12.55 } }

function calls(): Calls {
  return { sessionId: 's1', toasts: [], commands: [], compacts: [], suggests: [], opens: [], closes: [], notifies: [], asks: [] }
}

function fakeEngine(on: On, c: Calls, usage = USAGE, answer = 'Send') {
  let current = usage
  on('session.usage', () => ({ value: current }) as never)
  on('session.id', () => ({ value: c.sessionId }) as never)
  on('session.model', () => ({ value: 'claude-fable-5-1' }) as never)
  on('session.start', async ($, e) => ({ cwd: e.cwd }) as never)
  on('session.end', async () => ({ sessionId: 's1' }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }) as never)
  on('session.compact', ($, e) => { c.compacts.push(e.instructions); return { messages: [{ role: 'assistant', text: 'summary', toolUses: [] }] } as never })
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }) as never)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-fable-5-1', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  on('prompt.submit', ($, e) => ({ text: e.text, origin: e.origin }) as never)
  on('prompt.suggest', ($, e) => { c.suggests.push(e.text); return { isShown: true } as never })
  on('command.register', () => ({ value: { command: 'weather' } }) as never)
  on('command.run', ($, e) => { c.commands.push({ command: e.command, args: e.args }); return { text: `ran ${e.command}` } as never })
  on('ui.open', ($, e) => { c.opens.push(e.id); return { value: { isPlaced: true } } as never })
  on('ui.close', ($, e) => { c.closes.push(e.id); return { value: undefined } as never })
  on('ui.panes', () => ({ value: c.opens.filter((id) => !c.closes.includes(id)).map((id) => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.notify', ($, e) => { c.notifies.push((e as { text: string }).text); return { value: { isSent: true, channel: 'terminal_bell' } } as never })
  on('audio.play', () => ({ value: undefined }) as never)
  on('audio.speak', () => ({ value: { via: 'system' } }) as never)
  on('ui.toast', ($, e) => { c.toasts.push((e as { text: string }).text); return { value: undefined } })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string }[] }).questions[0].question
    c.asks.push(q)
    return { result: { answers: { [q]: answer } } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>beneath</Text>
  })
  return { setUsage: (u: typeof USAGE) => { current = u } }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
const turn = ($: Engine, over: Record<string, unknown> = {}) =>
  $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', ...over } as never)
const measure = ($: Engine, over: Record<string, unknown> = {}) =>
  $.session.measure({ context: USAGE.context, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: ['cost'], ...over } as never)
const BAND = (columns: number, isWorking = false) => ({ hasSurvey: false, isWorking, maxRows: 3, bodyColumns: columns, scroll: { bodyRows: 3, top: 0 }, view: {} }) as never
const band = ($: Engine, columns = 160, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'token-weather', surface, component: 'AbovePrompt', props: BAND(columns) })

describe('the band', () => {
  test('draws the forecast, the windows, the cost, the agents tally and the mods beneath', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    await turn($, { agentId: 'a1', usage: { model: 'claude-haiku-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await band($, 160, surface)
      expect(await ui.find({ type: 'Text', text: /Clear/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /234\.3k/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /5h 28%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\$12\.55/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /agents 1\.5k/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Text', text: /Clear|beneath/ })).map((t) => t.text).at(-1)).toBe('beneath')
      await ui.unmount()
    }
  })

  test('buttons at a wide band run their commands; none when narrow or working', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    const ui = await band($, 160)
    expect((await ui.findAll({ type: 'Button' })).length).toBe(4)
    await ui.press({ key: 'cost' })
    expect(c.commands).toEqual([{ command: 'cost', args: '' }])
    await ui.press({ key: 'compact' })
    expect(c.asks.at(-1)).toContain('Compact now?')
    await ui.unmount()
    const narrow = await band($, 80)
    expect((await narrow.findAll({ type: 'Button' })).length).toBe(0)
    await narrow.unmount()
    // a band with rows to spare puts the buttons under the line instead
    const twoRow = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: { ...(BAND(120) as object), maxRows: 4 } as never })
    expect((await twoRow.findAll({ type: 'Button' })).length).toBe(4)
    await twoRow.unmount()
    const working = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'AbovePrompt', props: BAND(160, true) })
    expect((await working.findAll({ type: 'Button' })).length).toBe(0)
  })

  test('the clear button asks first and keeps the conversation on Keep', { options: { compactConfirm: false } }, async ($, on) => {
    const c = calls()
    fakeEngine(on, c, USAGE, 'Keep')
    mock.store(on)
    mock.clock(on)
    await start($)
    const ui = await band($, 160)
    await ui.press({ key: 'clear' })
    expect(c.asks).toEqual(['Clear the conversation?'])
    expect(c.commands).toEqual([])
    await ui.press({ key: 'compact' })
    expect(c.compacts.length).toBe(1)
  })
})

describe('/weather', () => {
  test('the report, reset, pane and ledger', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    const report = await $.command.run({ command: 'weather' })
    expect(report.text).toContain('Clear  23% of context')
    expect(report.text).toContain('5h 28%')
    expect(report.text).toContain('session $12.55')
    expect(report.text).toContain('compact at off')
    const pane = await $.command.run({ command: 'weather', args: 'pane' })
    expect(pane.text).toContain('opened')
    expect(c.opens).toEqual(['weather'])
    const closed = await $.command.run({ command: 'weather', args: 'pane' })
    expect(closed.text).toContain('closed')
    await measure($)
    const ledger = await $.command.run({ command: 'weather', args: 'ledger' })
    expect(ledger.text).toContain('$12.55  1 session')
    const reset = await $.command.run({ command: 'weather', args: 'reset' })
    expect(reset.text).toContain('re-armed')
    const help = await $.command.run({ command: 'weather', args: 'what' })
    expect(help.text).toContain('/weather ledger')
  })
})

describe('actions after a turn', () => {
  test('toasts once per line, suggests /compact in the red zone, compacts past compactAt', { options: { compactAt: 350_000, compactConfirm: false, compactFocus: 'keep the plan' } }, async ($, on) => {
    const c = calls()
    const engine = fakeEngine(on, c)
    mock.store(on)
    const clock = mock.clock(on)
    await start($)
    engine.setUsage({ ...USAGE, context: { tokens: 310_000, window: 1_000_000, percent: 31 } })
    await turn($)
    await clock.advance(500)
    expect(c.toasts.filter((t) => t.includes('red zone')).length).toBe(1)
    expect(c.suggests).toEqual(['/compact'])
    expect(c.compacts).toEqual([])
    engine.setUsage({ ...USAGE, context: { tokens: 360_000, window: 1_000_000, percent: 36 } })
    await turn($)
    await clock.advance(500)
    expect(c.compacts).toEqual(['keep the plan'])
    expect(c.toasts.filter((t) => t.includes('red zone')).length).toBe(1)
    // a subagent's turn neither reads nor acts
    await turn($, { agentId: 'a9' })
    await clock.advance(500)
    expect(c.compacts.length).toBe(1)
  })

  test('a window at the warn line notifies once, the downshift is offered once', { options: { notify: true, downshiftModel: 'sonnet', downshiftAt: 90 } }, async ($, on) => {
    const c = calls()
    fakeEngine(on, c, USAGE, 'Switch')
    mock.store(on)
    const clock = mock.clock(on)
    await start($)
    const limits = [{ kind: 'five_hour', percentUsed: 50 }, { kind: 'seven_day', percentUsed: 91 }]
    await measure($, { rateLimits: limits, changed: ['rateLimits'] })
    await measure($, { rateLimits: limits, changed: ['rateLimits'] })
    await clock.advance(500)
    expect(c.notifies).toEqual(['7d window at 91%'])
    expect(c.asks).toEqual(['7d window at 91%. Switch to sonnet?'])
    expect(c.commands).toEqual([{ command: 'model', args: 'sonnet' }])
  })

  test('the cost cap warns at 80%', { options: { costLimitUsd: 15 } }, async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    await measure($)
    await measure($)
    expect(c.toasts.filter((t) => t.includes('80%'))).toEqual(['session cost $12.55: 80% of the $15.00 cap'])
  })
})

describe('the prompt guard', () => {
  test("a plugin's prompt passes untouched even with the guard on", { options: { guardRateLimit: 1 } }, async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    const sent = await $.prompt.submit({ text: 'hello' })
    expect(sent).toEqual(expect.objectContaining({ text: 'hello' }))
    expect(c.asks).toEqual([])
  })
})

describe('the spend ledger', () => {
  test('this session writes its own row; other sessions add up', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    const today = new Date().toISOString().slice(0, 10)
    mock.store(on, { 'spend:other': { day: today, week: 'x', usd: 5, at: Date.now() } })
    mock.clock(on)
    await start($)
    await measure($)
    const ui = await band($, 220)
    expect(await ui.find({ type: 'Text', text: /today \$17\.55/ })).toBeDefined()
  })
})

describe('the spend ledger across /clear', () => {
  test('a new conversation starts its own row; a cost that keeps running adds only its growth', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    await measure($, { cost: { usd: 1 } })
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
    c.sessionId = 's2'
    await measure($, { cost: { usd: 0.4 } })
    expect((await $.command.run({ command: 'weather', args: 'ledger' })).text).toContain('$1.40  2 sessions')
    await $.session.end({ reason: 'clear', sessionId: 's2', resume: {} } as never)
    c.sessionId = 's3'
    await measure($, { cost: { usd: 0.9 } })
    await measure($, { cost: { usd: 1.2 } })
    // 1.00 + 0.40 + (0.9 - 0.4) + (1.2 - 0.9)
    expect((await $.command.run({ command: 'weather', args: 'ledger' })).text).toContain('$2.20  3 sessions')
  })
})

describe('the live count', () => {
  test('a model request and a command move the count without adding a bar', async ($, on) => {
    const c = calls()
    const engine = fakeEngine(on, c)
    mock.store(on)
    const clock = mock.clock(on)
    await start($)
    await turn($)
    engine.setUsage({ ...USAGE, context: { tokens: 310_000, window: 1_000_000, percent: 31 } })
    const stream = $.turn.step({ turnId: 't2', index: 0, model: 'claude-fable-5-1', messageCount: 3 } as never)
    for (;;) { const n = await stream.next(); if (n.done) break }
    let ui = await band($, 160)
    expect(await ui.find({ type: 'Text', text: /310k/ })).toBeDefined()
    await ui.unmount()
    engine.setUsage({ ...USAGE, context: { tokens: 50_000, window: 1_000_000, percent: 5 } })
    await $.command.run({ command: 'cost' })
    await clock.advance(500)
    ui = await band($, 160)
    expect(await ui.find({ type: 'Text', text: /\b50k\b/ })).toBeDefined()
    const report = await $.command.run({ command: 'weather' })
    // the start reading and one turn on the chart; the headline is the live count
    expect(report.text).toContain('last turns (2)')
    expect(report.text).toContain('5% of context  50k / 1M')
  })
})

describe('the pane', () => {
  test('draws the chart, the windows and a close button', async ($, on) => {
    const c = calls()
    fakeEngine(on, c)
    mock.store(on)
    mock.clock(on)
    await start($)
    await turn($)
    const ui = await $.ui.mount({ plugin: 'token-weather', surface: 'terminal', component: 'Pane', requestId: 'weather', props: { title: 'Token weather', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { bodyRows: 20, top: 0 }, view: {} } as never })
    expect(await ui.find({ type: 'Text', text: /Clear  23%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h/ })).toBeDefined()
    await ui.press({ key: 'close' })
    expect(c.closes).toEqual(['weather'])
  })
})
