import { API_BASE_URL, TOKEN_KEY } from "./client.js";

/**
 * POSTs to a streaming chat endpoint (chat.js or multiChat.js on the
 * backend) and calls onToken for each token as it arrives, resolving with
 * the full accumulated text once the stream ends. Uses raw fetch +
 * ReadableStream rather than axios or the native EventSource API — axios
 * doesn't expose incremental chunks in the browser the way this needs, and
 * EventSource only supports GET requests, not a POST with a JSON body.
 */
export async function streamChatRequest(path, body, { onToken } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    let errorMessage = "Something went wrong. Please try again.";
    try {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } catch {
      // Response wasn't JSON — fall back to the generic message above.
    }
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // last item may be an incomplete event — keep for next read

    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6));

      if (payload.error) throw new Error(payload.error);
      if (payload.token) {
        full += payload.token;
        onToken?.(payload.token, full);
      }
      // payload.done needs no handling — the loop ends naturally when the stream closes.
    }
  }

  return full;
}
