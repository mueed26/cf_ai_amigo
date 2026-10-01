/**
 * Worker entrypoint: routes /agents/* WebSocket + HTTP traffic to the Durable
 * Object agents; everything else is the React app served from static assets.
 */
import { routeAgentRequest } from "agents";

export { Workspace } from "./agents/workspace";
export { AmigoAgent } from "./agents/amigo-agent";
export { AgentRunWorkflow } from "./workflows/agent-run";

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
