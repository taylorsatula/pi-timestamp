import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

function shouldInject(msgs: Array<Record<string, unknown>>): boolean {
  const last = msgs[msgs.length - 1];
  if (!last) return false;

  // User message → inject
  if (last.role === "user") return true;

  // Assistant with text content (vocalization) → inject
  // Assistant with only tool_calls (intermediate) → skip
  if (last.role === "assistant") {
    const hasToolCalls = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
    const hasContent = last.content != null && last.content !== "";
    return !hasToolCalls && hasContent;
  }

  // Tool results → skip (intermediate)
  return false;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event) => {
    const payload = event.payload as Record<string, unknown>;
    const msgs = payload.messages as Array<Record<string, unknown>>;

    if (!shouldInject(msgs)) return;

    const timestamp = formatTimestamp();
    const callId = `ts_${Date.now()}`;

    msgs.push(
      {
        role: "assistant",
        tool_calls: [
          {
            id: callId,
            type: "function",
            function: { name: "__timestamp", arguments: JSON.stringify({ timestamp }) },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: callId,
        content: "ok",
      },
    );

    return event.payload;
  });
}
