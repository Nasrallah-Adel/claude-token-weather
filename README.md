# token-weather

A Claude Code mod: a one-line forecast of the context window above the prompt (or under it,
by option), with the account's usage windows, the session cost, today's spend and the subagent
tally on the same line, buttons that act on it, a `/weather` command, a pane, and a set of
optional actions: compact at a threshold, hold a prompt when a window or a cost cap is spent,
offer a cheaper model, notify, beep.

```
☀ Clear  23% of context  234.3k / 1M   last turns ▇█  ▲ +281  · 5h 28% ↻43m · 7d 35% ↻1d5h · $12.55 · today $18.40 · wk $31.00 · agents 1.2M  c: compact  x: context  d: cost  n: clear
```

Every action is off until you turn it on in `/config`; the hints (the `/compact` suggestion, the
buttons, today's spend, the agents tally) are on.

## The line

- **Weather**: ☀ Clear under 25% of the window, ☁ Cloudy under 50%, ☂ Showers under 75%,
  ☇ Storm under 90%, ↯ Compact soon above.
- **Token count** (`234.3k`): bold, coloured by size: green under `warnTokens`, yellow from there,
  red from `dangerTokens`. The window (`/ 1M`) stays dim.
- **⚠2x**: shown after the count from `warnTokens` up: the prompt is above the long-context line,
  where 1M-context models bill input at a higher rate.
- **Live count**: the count moves with every model request of a turn, after every command
  (`/context`, `/compact`, `/clear` change the context without a turn) and on every measure, so it
  reads as the status line does. The chart, the trend and the crossings still take one reading
  per completed turn.
- **Chart**: one bar per recent turn (the last 12), scaled to the busiest, and the change since
  the last turn. Hidden under 60 columns.
- **Fit**: a band narrower than the line drops parts in order, agents, spend, trend, chart, then
  the windows and cost, then the window and tag. The buttons sit at the end of the line when
  they fit beside the windows and the cost, else on a row of their own under it, so a docked
  pane never pushes the figures off the row.
- **5h / 7d**: the 5-hour and weekly rate-limit windows, percent used and `↻` time until reset.
  Green below 50% used, yellow below 80%, red from there.
- **$**: what the session has cost so far, as `/cost` totals it.
- **today / wk** (`showDailyCost`): spend summed over every session in the plugin's store, today
  and this ISO week. Each session writes only its own row, so sessions running side by side add
  up without overwriting each other; a session's spend counts on the day it started; rows older
  than eight weeks are dropped at the next start.
- **agents** (`showAgents`): the tokens the session's subagents, forks and teammates have used,
  from their `turn.complete` usage. Their cost is already inside `$`.
- **Toasts**: once per conversation when the context passes `warnTokens`, once more at
  `dangerTokens`, and once per window when the 5h or 7d window reaches `rateWarnPercent`.
  Re-armed by `/clear`, `/weather reset`, and whenever the figure falls back under the line.

## Buttons

With `buttons` on and the band at least 110 columns wide, four buttons end the line (or take
the row under it when the line is full):
`c: compact`, `x: context`, `d: cost`, `n: clear`. Click one, or press ctrl+x tab to focus the band
and then the letter. `compact` asks first when `compactConfirm` is on and passes `compactFocus`
to the summarizer; `clear` always asks; `context` and `cost` run the slash commands. The buttons
hide while a turn runs (commands wait for an idle session) and never draw on the hint row
(`placement: below`).

## /weather

```
/weather           the forecast, the last turns, the windows, cost, spend, agents, the context
                   categories as /context counts them, and every threshold in force
/weather reset     forget the readings and re-arm the toasts and actions
/weather pane      open or close the pane
/weather compact   compact now, with the compactFocus instructions, no question asked
/weather ledger    spend by day over the stored sessions, and this week's total
```

The command's output is a transcript row like any typed command's; nothing of it is sent to the
model on its own.

## The pane

`/weather pane` opens **Token weather** beside the transcript: the forecast, a chart of up to 200
readings bucketed to the pane's width, each usage window as a bar with its reset countdown, the
cost lines and the agents tally, and a `close` button. `pane: true` opens it at session start,
which the terminal only places from 144 columns; a narrower terminal gets a toast instead.
Opened by the command it is placed at any width.

## Actions

Each one is an option in `/config` under token-weather, or in `pluginConfigs` in
`~/.claude/settings.json` (the id is `token-weather@skills-dir` for a skills-dir install, or
`token-weather@nasrallah-mods` from the marketplace).

**Compact at a threshold** (`compactAt`, tokens, 0 = off). After the turn whose reading crossed
the line, the mod asks `Context at 352k. Compact now?` (`compactConfirm`, default on) and runs the
same compaction `/compact` does, with `compactFocus` as the instructions. Later leaves the line
crossed; it fires again once the context has dropped below the line and climbs back over it. A
subagent's turn never triggers it. Compaction cannot run while a turn is in flight, so every
action runs just after the hook that saw the reading returns; should the direct call still be
refused, the mod queues `/compact` for the idle session.

**Compaction focus** (`compactFocus`, text). Besides the compactions this mod triggers, the text
is appended to the instructions of every `/compact` you type and every auto-compaction of the
main conversation. This is the one option whose text the model reads: the summarizer sees it.

**Suggest /compact** (`suggestCompact`, default on). From `dangerTokens` up, after each turn the
prompt box shows `/compact` as its dim suggestion; Tab takes it, Enter sends it. Nothing is sent
unless you do.

**Hold prompts on the 5-hour window** (`guardRateLimit`, percent, 0 = off). When the 5h window is
at or past the line, each prompt you send first asks `5h window at 96%. Send anyway?`. Later drops
the prompt with the reason shown and puts your text back in the prompt box. Prompts a plugin, a
schedule or a peer submits are never held. A failing guard passes the prompt, never drops it.

**Session cost cap** (`costLimitUsd`, dollars, 0 = off). A toast at 80% of the cap, and at the cap
each prompt asks `Session cost $12.00 is past the $10.00 cap. Send anyway?` the same way.

**Model downshift** (`downshiftModel`, an alias such as `sonnet`, empty = off; `downshiftAt`,
percent, default 90). Once per session, when the weekly window (or the 5-hour one, where there is
no weekly window) reaches the line, the mod asks `7d window at 91%. Switch to sonnet?`; Switch runs
`/model sonnet`. The alias is passed as typed; `/model` reports an unknown one.

**Notifications** (`notify`, default off). The warn and danger crossings, a window reaching
`rateWarnPercent` and the cost cap's 80% mark also raise a native notification through your
`preferredNotifChannel`, headed `token-weather`.

**Sound** (`sound`: `off`, `beep`, `speak`). On the same crossings, `beep` plays a short tone
(`sounds/warn.wav`, `sounds/danger.wav`, through `afplay`; a Linux or Windows terminal plays
nothing) and `speak` reads the alert with the system voice.

## Options

| key | type | default | effect |
|---|---|---|---|
| `placement` | `above` / `below` | `above` | the band above the prompt, stacked with other mods' bands and with the buttons; or the hint row under it |
| `warnTokens` | number | 200000 | yellow count, ⚠2x tag, first toast |
| `dangerTokens` | number | 300000 | red count, second toast, /compact suggestion from here |
| `suggestCompact` | boolean | true | dim `/compact` suggestion after each turn in the red zone |
| `buttons` | boolean | true | compact, context, cost, clear buttons at 110 columns or more |
| `showDailyCost` | boolean | true | `today $X · wk $Y` on the line |
| `showAgents` | boolean | true | `agents 1.2M` on the line |
| `compactAt` | number | 0 | tokens; compact after the turn that crossed it; 0 off |
| `compactConfirm` | boolean | true | ask Compact / Later first (compactAt and the button) |
| `compactFocus` | string | `""` | instructions for every compaction, this mod's and yours |
| `notify` | boolean | false | native notification on alerts |
| `rateWarnPercent` | number | 90 | window percent that raises an alert; 0 off |
| `sound` | `off` / `beep` / `speak` | `off` | tone or speech on alerts |
| `guardRateLimit` | number | 0 | 5h window percent from which prompts ask Send / Later; 0 off |
| `costLimitUsd` | number | 0 | session cost cap: toast at 80%, prompts ask at 100%; 0 off |
| `downshiftModel` | string | `""` | alias offered once when the window runs low; empty off |
| `downshiftAt` | number | 90 | 7d (else 5h) window percent for the offer |
| `pane` | boolean | false | open the pane at session start |

Numbers that are not finite or are negative fall back to their default; `dangerTokens` is never
below `warnTokens`; percents are 0 (off) or 1 to 100.

## What reaches the model

The band, the toasts, the notifications, the sounds, the guards' questions and `/weather`'s
output are drawn for you alone. Three things do reach the model, each by your hand or your
setting: `compactFocus`, read by the summarizer when a compaction runs; a `/compact` suggestion
you take with Tab and send; and `/model`, `/compact`, `/context`, `/cost` or `/clear` run from a
button, an offer or `/weather`, whose rows enter the transcript as a typed command's would.
The figures come from `$.session.usage()`, the same ones the status line reads; no model call is
made for them.

## Install

In a Claude Code terminal session (2.1.287 or later, where mods load by default):

```
/plugin install token-weather --marketplace Nasrallah-Adel/claude-token-weather
```

Answer `y` to add the marketplace, then pick the **user** scope (Enter) so it loads in every
project. It is active at once in that session and in each session started after.

To try it from a clone instead, for one session with hot reload:

```sh
git clone https://github.com/Nasrallah-Adel/claude-token-weather.git
claude --plugin-dir ./claude-token-weather
```

## Notes

- With `placement: "above"`, the band above the prompt is one slot shared by every mod. This mod
  awaits the mods beneath it and stacks its line above theirs, so it coexists with other
  band-drawing mods such as prompt-cache-control. A mod that draws without passing the band on
  will hide it.
- Windows are empty until the first API response of a session, and off a subscription
  (API key, cloud provider): then only the cost shows, and the window-based actions never fire.
- The cost is uncolored, since there is no natural dollar threshold.
- A `/config` change reloads the module: the readings start over and the toasts are armed again,
  as after `/clear`. The spend ledger lives in the plugin's store and survives.

## Develop

```sh
claude plugin validate .   # what it hooks and calls
claude plugin test .       # the tests in tests/: pure helpers and the module through the engine's kit
```

`hooks/token-weather.mjs` is the one module that touches `$` (the host follows `$` only inside
the file it is handed to); the rest are pure and tested on their own: `options`, `readings`,
`band`, `guards`, `spend`, `weather-command`, `pane`, `usage-status`.

Hooks: `session.start`, `session.end`, `session.measure`, `session.compact`, `turn.step`,
`turn.complete`, `prompt.submit`, `command.run` (`/weather`, and every command for the live count),
`ui.render` on `AbovePrompt`, `PromptHint` and the `weather` pane.

## License

Apache-2.0. The context-window forecast started from the `token-weather` example in
[anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground); the usage
windows, cost, colors, band stacking, actions, command and pane are this repo's. `NOTICE` carries
the attribution Apache-2.0 requires.
