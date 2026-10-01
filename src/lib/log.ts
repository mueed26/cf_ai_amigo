// Structured logs: one JSON object per line, so Cloudflare Workers Logs can
// search and filter by field (runId, agentId, tool, ok, ms...).
// The run ID works as a trace ID: filter by it to see a run from start to end.
export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ event, ...fields, ts: new Date().toISOString() })
  );
}
