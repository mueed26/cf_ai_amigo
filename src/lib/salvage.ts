// Llama 3.3 sometimes writes a tool call as plain text, e.g.
// {"type": "function", "name": "notion_create_pages", "parameters": {...}}
// instead of making a real tool call. These helpers find such text and turn it
// back into a call we can run.

export type TextToolCall = {
  name: string;
  args: Record<string, unknown>;
  // The JSON text of the call, so it can be removed from the answer.
  raw: string;
};

// The first complete {...} object in the text, if any.
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// A tool call written as text, if the text is one.
export function findTextToolCall(text: string): TextToolCall | null {
  const json = firstJsonObject(text);
  if (!json) return null;
  try {
    const value = JSON.parse(json) as {
      name?: unknown;
      parameters?: unknown;
      arguments?: unknown;
    };
    const args = value.parameters ?? value.arguments;
    if (typeof value.name !== "string" || !args || typeof args !== "object") {
      return null;
    }
    return {
      name: value.name,
      raw: json,
      args: parseJsonStrings(args) as Record<string, unknown>
    };
  } catch {
    return null;
  }
}

// Turn values like "[{...}]" (a list sent as a string) back into real data.
export function parseJsonStrings(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return parseJsonStrings(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(parseJsonStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, parseJsonStrings(v)])
    );
  }
  return value;
}
