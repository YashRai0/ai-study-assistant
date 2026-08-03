import { API_BASE_URL, TOKEN_KEY } from "./client.js";

/**
 * POSTs to a streaming chat endpoint (chat.js or multiChat.js on the
 * backend) and calls onToken for each token as it arrives, resolving with
 * the full accumulated text once the stream ends. Uses raw fetch +
 * ReadableStream rather than axios or the native EventSource API — axios
 * doesn't expose incremental chunks in the browser the way this needs, and
 * EventSource only supports GET requests, not a POST with a JSON body.
 *
 * Because this bypasses axios entirely, it also bypasses the 401 response
 * interceptor set up in client.js — that interceptor only runs for
 * requests made through the axios `client` instance, not raw fetch calls.
 * The same expired/invalid-token handling is duplicated here so a stale
 * token during an active chat doesn't just show an inline error; it clears
 * the token and sends the user back to /login, consistent with every other
 * API call in the app.
 *
 * @param {AbortSignal} [options.signal] - pass an AbortController's signal
 *   to allow cancelling mid-stream (e.g. a "Stop" button, or cleanup on
 *   unmount). The backend detects the resulting disconnect and stops
 *   pulling tokens from the LLM for a response nobody will see.
 */
export async function streamChatRequest(path, body, { onToken, signal } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      // The redirect above is async (navigation), so still throw to stop
      // the caller from treating this as a normal response while the
      // redirect is in flight.
      throw new Error("Your session has expired. Please log in again.");
    }

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

  try {
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
  } catch (err) {
    // An aborted fetch throws a DOMException named "AbortError" — that's an
    // intentional cancellation (Stop button, unmount), not a failure, so
    // return what we have so far instead of surfacing it as an error
    // message in the UI.
    if (err.name === "AbortError") return full;
    throw err;
  }

  return full;
}