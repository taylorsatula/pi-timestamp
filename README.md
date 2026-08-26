# @taylorsatula/pi-timestamp

Timestamp injection extension for [Pi](https://pi.dev) — the model always knows what time it is.

## What it does

Hooks `before_provider_request` and appends a synthetic tool-call pair to the outgoing message list, carrying the current local wall-clock time:

```jsonc
[
  {
    "role": "assistant",
    "tool_calls": [
      {
        "id": "ts_1756220400000",
        "type": "function",
        "function": { "name": "__timestamp", "arguments": "{\"timestamp\":\"[3:00pm - 8/26/25]\"}" }
      }
    ]
  },
  { "role": "tool", "tool_call_id": "ts_1756220400000", "content": "ok" }
]
```

Injection happens only at **turn boundaries**, not on every provider call:

- Last message is a **user message** → inject.
- Last message is an **assistant message with text content** (a vocalization between tool steps) → inject.
- Last message is an assistant message with only `tool_calls`, or a tool result (mid-turn churn) → skip.

This keeps the timestamp fresh each time control returns to the user-facing side of the loop, without spamming intermediate tool-loop requests.

## Installation

```bash
pi install npm:@taylorsatula/pi-timestamp
```

Or add to `~/.pi/agent/settings.json` under `packages`:

```json
{
  "packages": ["npm:@taylorsatula/pi-timestamp"]
}
```

## Notes

- Timestamps use the machine's **local time**, formatted `h:mmam/pm - M/D/YY` (e.g. `[3:07pm - 8/26/25]`).
- No tools, commands, shortcuts, or settings are registered — the extension is invisible except for the injected messages.
- The injected pair is added to the outgoing payload only; it is not persisted to the session transcript.

## Development

```bash
npm install
npm run check   # tsc --noEmit
```

## License

MIT
