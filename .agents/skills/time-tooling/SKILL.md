---
name: time-tooling
description: Use when a task involves the current date or time, timezone conversion, measuring or comparing durations, benchmarks (hyperfine, timing runs, "is A faster than B"), or monitoring elapsed or wall-clock time. Also use when deciding which clock owns a time question — the injected [ISO] turn stamp, `date`, dateutils, hyperfine, `command time -v`, or another session's/process's own timestamps.
---

# Time Tooling

## Assumptions

This skill assumes these tools are installed:

- GNU `date` — for `-d` parsing.
- `dateutils` — `dateadd`, `datediff`, `dateseq`, `dateround`, `datezone`.
- `hyperfine` — benchmark harness.
- GNU `time` (`/usr/bin/time`) — for `-v` resource stats.

Install commands live in the package README's "Companion CLI tools" section.

**Portability.** Flags are GNU-style. BSD/macOS `date` differs from GNU `date`; Homebrew installs the GNU variants as `gdate`/`gtime`. If a tool is missing, degrade gracefully: Python's `datetime` + `zoneinfo` covers arithmetic and timezone conversion.

## Routing

| Question | Source |
| --- | --- |
| Current date (or the time as of this turn) | The `[ISO]` stamp this extension appends to the tail of the latest message (request time, local time with a numeric offset). Do not re-fetch except when you need seconds precision, a mid-turn read, or another timezone. |
| Exact "now", or a mid-turn read | `date` |
| Arithmetic, ranges, rounding, timezone conversion | `dateutils` (`dateadd`, `datediff`, `dateseq`, `dateround`, `datezone`) |
| "Is A faster than B?" | `hyperfine` |
| One run plus resource stats | `command time -v` |
| Another session's or another process's work | Their own timestamps — a session transcript's timing entries, or the inference server's own response timings (e.g. llama.cpp's `timings` block) |
| Your own perception of elapsed time | Never a measurement |

## Traps

- `dateutils` unit letters: `m` = minutes, `mo` = months, `bd` = business days, `q` = quarters, plus `y`/`d`/`w`/`h`/`s`.
- Set `LC_ALL=C` when parsing tool output: non-C locales emit localized weekday names and comma decimals (e.g. `quinta`, `0,051`) that break parsing.
- `time` is a shell keyword or builtin in bash/zsh/fish; GNU time requires `command time` or `/usr/bin/time`, and only GNU time provides `-v` resource stats.
- `datezone` takes positional `ZONENAME` and `DATE/TIME` — it has no `-f` flag.
- `dateround` needs an `RNDSPEC`; a leading `-` rounds downward.
- `hyperfine`: read min and max, not just the mean (bimodal workloads hide in the average). Use `--warmup`/`--prepare` for stateful targets; `--export-json` keeps the raw runs.
- Streaming: TTFB is not TTFT; reasoning models may stream into a separate field (e.g. `reasoning_content`), so a monitor keyed on the content field can measure nothing.
- For inference servers that report their own timings, prefer the server's numbers and record prompt-cache/prompt-reuse counters (`cache_n` on llama.cpp) or you are comparing different amounts of work.

## Coherence

The extension stamps the clock at turn boundaries. The stamp is local time with a numeric offset — convert with an explicit timezone instead of assuming one. Do not re-fetch the clock unless you need seconds, a mid-turn read, or another timezone.
