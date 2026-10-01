// All app tools, grouped by tool type.
import type { ToolSlug } from "../../shared";
import { googleTools } from "./google";
import { slackTools } from "./slack";
import type { IntegrationTool } from "./types";

export const INTEGRATION_TOOLS: Partial<Record<ToolSlug, IntegrationTool[]>> = {
  ...googleTools,
  ...slackTools
};

export function findIntegrationTool(name: string) {
  for (const tools of Object.values(INTEGRATION_TOOLS)) {
    const tool = tools?.find((t) => t.name === name);
    if (tool) return tool;
  }
  return undefined;
}
