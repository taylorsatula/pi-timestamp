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

const TS_STRIP = /\n\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2} [A-Z][a-z]{2}\]\s*$/;

// Hardcoded English weekday names. Do NOT switch to toLocaleDateString — a
// non-English locale renders e.g. 'ter'/'qua', which the strip regex would not
// match, and tags would then stack on every request.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  // getTimezoneOffset() returns minutes *behind* UTC (positive west of UTC),
  // so negate it to obtain the ISO-8601 offset used in the tag.
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");

  const wd = WEEKDAYS[now.getDay()];

  return `[${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om} ${wd}]`;
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
