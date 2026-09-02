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

function injectable(msgs: Array<Record<string, unknown>>): boolean {
  const last = msgs[msgs.length - 1];
  if (!last) return false;

  if (last.role === "user") return true;

  if (last.role === "assistant") {
    const hasToolCalls = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
    const hasContent = last.content != null && last.content !== "";
    return !hasToolCalls && hasContent; // vocalization → inject; tool call → never
  }

  return false; // tool results → mid-loop, skip
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    const payload = event.payload as Record<string, unknown>;
    const msgs = payload.messages as Array<Record<string, unknown>>;
    if (!injectable(msgs)) return;

    const ts = `\n${formatTimestamp()}`;
    const last = msgs[msgs.length - 1];

    if (typeof last.content === "string") {
      last.content = last.content.replace(TS_STRIP, "") + ts;
    } else if (Array.isArray(last.content)) {
      // Provider-shaped block arrays (e.g. Anthropic): normalize the last
      // text block in place, or append a text block when none exists.
      const blocks = [...(last.content as Array<Record<string, unknown>>)];
      const idx = blocks.length - 1;
      const lastBlock = blocks[idx] as { type?: string; text?: string } | undefined;
      if (lastBlock && lastBlock.type === "text" && typeof lastBlock.text === "string") {
        blocks[idx] = { ...lastBlock, text: lastBlock.text.replace(TS_STRIP, "") + ts };
      } else {
        blocks.push({ type: "text", text: ts });
      }
      last.content = blocks;
    }
    // Non-string, non-array content shapes: leave untouched rather than guess.

    return event.payload;
  });
}
