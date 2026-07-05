/**
 * Authenticated SSE over fetch — EventSource cannot set Authorization headers
 * (CWE-532: never pass tokens in query strings).
 */

export type SseEventHandler = (event: string, data: string) => void;

export interface ConnectAuthenticatedSseOptions {
  url: string;
  getToken: () => string | null;
  onEvent: SseEventHandler;
  onError?: () => void;
  /** Reconnect delay after stream failure (ms). Default 5000. */
  reconnectMs?: number;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  if (!block.trim() || block.startsWith(":")) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** Subscribe to an SSE endpoint with Bearer auth. Returns a disconnect function. */
export function connectAuthenticatedSse(options: ConnectAuthenticatedSseOptions): () => void {
  const reconnectMs = options.reconnectMs ?? 5000;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;

  const connect = async () => {
    if (closed) return;
    const token = options.getToken();
    if (!token) return;

    abortController?.abort();
    abortController = new AbortController();

    try {
      const res = await fetch(options.url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        credentials: "include",
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        options.onError?.();
        if (!closed) reconnectTimer = setTimeout(connect, reconnectMs);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (parsed) options.onEvent(parsed.event, parsed.data);
        }
      }
    } catch {
      if (!closed && !abortController.signal.aborted) {
        options.onError?.();
        reconnectTimer = setTimeout(connect, reconnectMs);
      }
    }
  };

  void connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    abortController?.abort();
  };
}
