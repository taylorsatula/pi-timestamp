import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Cache-correct tail injection: mutating the system prompt would invalidate the
// KV-cache prefix on every request; the last message is the only cache-safe
// injection point, and only when no tool call is pending.
//
// Design:
//   - Inject into user messages and text-only assistant vocalizations by
//     appending plain text to the message content. No fabricated tool-call
//     pair — the pair disguise is only structurally required in tool-call
//     positions, which we never inject into.
//   - Never inject after an assistant message carrying tool_calls (appending
//     there would require wedging a pair between the call and its result) and
//     never after tool results (mid-loop churn).
//   - Idempotent per request: a previously appended tag is stripped before the
//     fresh one is written.
//
// Payload shapes (before_provider_request delivers the provider-serialized
// request body, which differs per API):
//   - Chat Completions / Anthropic: conversation lives under `messages`.
//   - OpenAI Responses API: conversation lives under `input`, with typed items
//     (input_text / output_text content blocks, function_call and
//     function_call_output tool traffic) instead of chat messages.

type Rec = Record<string, unknown>;

const TS_STRIP = /\n\[\d{1,2}:\d{2}(am|pm) - \d{1,2}\/\d{1,2}\/\d{2}\]\s*$/;

function formatTimestamp(): string {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = String(now.getFullYear()).slice(-2);
  return `[${hours}:${String(minutes).padStart(2, "0")}${ampm} - ${month}/${day}/${year}]`;
}

// Chat Completions / Anthropic shape: payload.messages
// user: { role: "user", content: string | blocks }
// assistant vocalization: { role: "assistant", content: string | blocks, no tool_calls }
// assistant tool call: { role: "assistant", tool_calls: [...] }
// Anthropic tool results arrive as user messages containing a tool_result
// content block; treat them as mid-loop traffic, not turn boundaries.

function chatShouldInject(last: Rec): boolean {
  if (last.role === "user") {
    const content = last.content;
    if (Array.isArray(content) && content.some((b) => (b as Rec).type === "tool_result")) {
      return false;
    }
    return true;
  }
  if (last.role === "assistant") {
    const hasToolCalls = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
    const hasContent = last.content != null && last.content !== "";
    return !hasToolCalls && hasContent; // vocalization → inject; tool call → never
  }
  return false;
}

// OpenAI Responses shape: payload.input
// user: { role: "user", content: [{ type: "input_text", text }, ...] }
// vocalization: { type: "message", role: "assistant", content: [{ type: "output_text", ... }] }
// tool call: { type: "function_call", ... } / result: { type: "function_call_output", ... }

function responsesShouldInject(last: Rec): boolean {
  if (last.role === "user") return true;
  if (last.type === "message" && last.role === "assistant") {
    return Array.isArray(last.content) && last.content.length > 0;
  }
  return false; // function_call / function_call_output → mid-loop, skip
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    const payload = event.payload as Rec;
    const isResponses = Array.isArray(payload.input);
    const items = isResponses
      ? (payload.input as Rec[])
      : Array.isArray(payload.messages)
        ? (payload.messages as Rec[])
        : undefined;
    if (!items) return; // unknown payload shape → leave untouched

    const last = items[items.length - 1];
    if (!last) return;
    if (!(isResponses ? responsesShouldInject(last) : chatShouldInject(last))) return;

    const ts = `\n${formatTimestamp()}`;

    if (typeof last.content === "string") {
      last.content = last.content.replace(TS_STRIP, "") + ts;
    } else if (Array.isArray(last.content)) {
      // Provider-shaped block arrays: normalize the last text-bearing block in
      // place, or append a typed text block when none exists.
      const blocks = [...(last.content as Rec[])];
      const idx = blocks.length - 1;
      const lastBlock = blocks[idx] as { text?: unknown } | undefined;
      if (lastBlock && typeof lastBlock.text === "string") {
        blocks[idx] = { ...lastBlock, text: lastBlock.text.replace(TS_STRIP, "") + ts };
      } else if (isResponses && last.role === "assistant") {
        blocks.push({ type: "output_text", text: ts, annotations: [] });
      } else if (isResponses) {
        blocks.push({ type: "input_text", text: ts });
      } else {
        blocks.push({ type: "text", text: ts });
      }
      last.content = blocks;
    }
    // Non-string, non-array content shapes: leave untouched rather than guess.

    return event.payload;
  });
}
