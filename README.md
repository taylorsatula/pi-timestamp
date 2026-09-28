# @taylorsatula/pi-timestamp

Timestamp injection extension for [Pi](https://pi.dev) — the model always knows what time it is.

## What it does

Hooks `before_provider_request` and appends the current local wall-clock time as plain text
to the tail of the last message:

```
They're injected poorly if they're that annoying.
[11:34pm - 9/1/26]
```

Injection happens only at **turn boundaries**, never mid-tool-loop, and handles both wire
formats the hook can deliver (the payload is the provider-serialized request body, which
differs per API):

- **Chat Completions / Anthropic** (conversation under `messages`): last message is a
  **user message** → append the timestamp to its content. Last message is an
  **assistant message with text content** (a vocalization between tool steps) → append
  to its content. Last message is an assistant message carrying `tool_calls`, a tool
  result, or an Anthropic user message containing a `tool_result` block (that API's
  tool-result encoding) → skip.
- **OpenAI Responses API** (conversation under `input`, typed items): last item is a
  user item → append to its content blocks. Last item is an assistant `message` item
  (vocalization) → append to its `output_text` blocks. Last item is a `function_call` or
  `function_call_output` item → skip.

## Why plain-text tail append (design notes)

- **Cache safety.** The tail of the message list is the only cache-safe injection point:
  mutating the system prompt would invalidate the KV-cache prefix on every request; a
  tail mutation re-processes only the last message. The system prompt is never touched.
- **No synthetic tool calls.** Appending after an assistant message that carries a
  `tool_call` would require fabricating a tool-call pair (a call must be answered by its
  result) — so those positions are simply never injected. In the positions that are
  injected, no disguise is needed, so none is used. The model never appears to call a
  nonexistent tool, and transcripts never render phantom calls.
- **Idempotent.** A previously appended tag is stripped before the fresh one is written,
  so re-fires and retries cannot stack timestamps.
- **Content-shape aware.** String content concatenates directly; block-array content
  (Anthropic-shaped) appends into or after the last text block; unknown shapes are left
  untouched rather than guessed at.
- **Wire-format aware.** Chat Completions/Anthropic payloads (`messages`) and OpenAI
  Responses payloads (`input`, typed items) are both handled; any other payload shape
  passes through untouched.

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

- Timestamps use the machine's **local time**, formatted `h:mmam/pm - M/D/YY`
  (e.g. `[3:07pm - 8/26/25]`).
- No tools, commands, shortcuts, or settings are registered — the extension is invisible
  except for the appended tag.
- The tag is added to the outgoing payload only; it is not persisted to the session
  transcript.
- Version 0.2.0 changed the mechanism (plain-text tail append replacing the synthetic
  tool-call pair). Sessions started before the upgrade may still show one old-style pair
  until restart.
- Version 0.2.1 fixed a crash on OpenAI Responses-API models (`before_provider_request`
  payloads carry the conversation under `input`, not `messages`) and added
  Anthropic `tool_result` skipping.

## Development

```bash
npm install
npm run check   # tsc --noEmit
```

## License

MIT
