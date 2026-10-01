// Fix for streamed Llama 3.3 replies from Workers AI.
// Each streamed chunk holds the same text twice: once in `response` and once in
// `choices[0].delta`. The AI SDK provider reads both, so chat showed every word
// twice and tool inputs became broken JSON. We keep only the `choices` copy.

function dedupeSseLine(line: string) {
  if (!line.startsWith("data: ") || line === "data: [DONE]") return line;
  try {
    const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>;
    if (Array.isArray(chunk.choices)) {
      delete chunk.response;
      delete chunk.tool_calls;
      return `data: ${JSON.stringify(chunk)}`;
    }
  } catch {
    // not JSON, pass it through unchanged
  }
  return line;
}

function dedupeStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, controller) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(encoder.encode(dedupeSseLine(line) + "\n"));
        }
      },
      flush(controller) {
        if (buffer) controller.enqueue(encoder.encode(dedupeSseLine(buffer)));
      }
    })
  );
}

// Wraps the AI binding so streamed replies come back without duplicates.
export function cleanAi(ai: Ai): Ai {
  return new Proxy(ai, {
    get(target, prop) {
      if (prop === "run") {
        return async (...args: Parameters<Ai["run"]>) => {
          const result = await target.run(...args);
          return result instanceof ReadableStream
            ? dedupeStream(result)
            : result;
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
