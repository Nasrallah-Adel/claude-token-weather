# token-weather

A Claude Code mod: a one-line forecast of the context window above the prompt, with the
account's usage windows and the session cost on the same line.

```
☀ Clear  23% of context  234.3k / 1M   last turns ▇█  ▲ +281 last turn  · 5h 28% ↻43m · 7d 35% ↻1d5h · $12.55
```

- **Weather**: ☀ Clear under 25% of the window, ☁ Cloudy under 50%, ☂ Showers under 75%,
  ☇ Storm under 90%, ↯ Compact soon above.
- **Chart**: one bar per recent turn, scaled to the busiest, and the change since the last turn.
- **5h / 7d**: the 5-hour and weekly rate-limit windows, percent used and `↻` time until reset.
  Green below 50% used, yellow below 80%, red from there.
- **$**: what the session has cost so far, as `/cost` totals it.

Nothing enters Claude's context: no model calls, no skills, no commands. The figures come
from `$.session.usage()`, the same ones the status line reads.

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

- The band above the prompt is one slot shared by every mod. This mod awaits the mods beneath it
  and stacks its line above theirs, so it coexists with other band-drawing mods such as
  prompt-cache-control. A mod that draws without passing the band on will hide it.
- Windows are empty until the first API response of a session, and off a subscription
  (API key, cloud provider): then only the cost shows.
- The cost is uncolored, since there is no natural dollar threshold.

## Develop

```sh
claude plugin validate .   # what it hooks and calls
claude plugin test .       # the helper tests in tests/
```

Hooks: `session.start`, `session.measure`, `turn.complete`, `ui.render` on `AbovePrompt`.
Pure text/color helpers live in `hooks/usage-status.mjs`.

## License

Apache-2.0. Derived from the `token-weather` example in
[anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground);
see `NOTICE`.
