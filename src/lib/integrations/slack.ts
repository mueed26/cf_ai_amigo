// Slack tools using a bot token.
// Bot scopes needed: chat:write, chat:write.public, channels:read, channels:history, channels:join
import { z } from "zod";
import { defineTool, type IntegrationContext } from "./types";

// Bot permissions requested when a user clicks "Connect with Slack".
export const SLACK_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "channels:history",
  "channels:join"
];

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown };

export async function slackApi<T extends SlackResponse>(
  token: string,
  method: string,
  body: Record<string, unknown> = {}
) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  });
  const data = (await res.json()) as T;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

type Channel = {
  id: string;
  name: string;
  is_member: boolean;
  num_members?: number;
};

async function resolveChannel(ctx: IntegrationContext, channel: string) {
  const token = await ctx.getToken("slack");
  if (/^[CG][A-Z0-9]+$/.test(channel)) return { token, id: channel };
  const name = channel.replace(/^#/, "").toLowerCase();
  const { channels } = await slackApi<SlackResponse & { channels: Channel[] }>(
    token,
    "conversations.list",
    { types: "public_channel", exclude_archived: true, limit: 500 }
  );
  const found = channels.find((c) => c.name.toLowerCase() === name);
  if (!found)
    throw new Error(`Channel #${name} not found. Use slack_list_channels.`);
  return { token, id: found.id, isMember: found.is_member };
}

export const slackTools = {
  slack: [
    defineTool({
      name: "slack_list_channels",
      description: "List public Slack channels in the connected workspace.",
      input: z.object({}),
      async run(ctx) {
        const token = await ctx.getToken("slack");
        const { channels } = await slackApi<
          SlackResponse & { channels: Channel[] }
        >(token, "conversations.list", {
          types: "public_channel",
          exclude_archived: true,
          limit: 200
        });
        return channels.map((c) => ({
          id: c.id,
          name: `#${c.name}`,
          members: c.num_members
        }));
      }
    }),
    defineTool({
      name: "slack_read_channel",
      description:
        "Read the most recent messages from a public Slack channel (name like #general or id).",
      input: z.object({
        channel: z.string(),
        limit: z.coerce.number().int().min(1).max(50).default(20)
      }),
      async run(ctx, { channel, limit }) {
        const { token, id, isMember } = await resolveChannel(ctx, channel);
        if (isMember === false)
          await slackApi(token, "conversations.join", { channel: id });
        const { messages } = await slackApi<
          SlackResponse & {
            messages: { user?: string; text: string; ts: string }[];
          }
        >(token, "conversations.history", { channel: id, limit });
        return messages.map((m) => ({
          user: m.user,
          text: m.text,
          at: new Date(Number(m.ts) * 1000).toISOString()
        }));
      }
    }),
    defineTool({
      name: "slack_post_message",
      description:
        "Post a message to a Slack channel (name like #general or id). Supports Slack mrkdwn.",
      sensitive: true,
      input: z.object({
        channel: z.string(),
        text: z.string().min(1).max(3500)
      }),
      async run(ctx, { channel, text }) {
        const { token, id } = await resolveChannel(ctx, channel);
        const posted = await slackApi<SlackResponse & { ts: string }>(
          token,
          "chat.postMessage",
          {
            channel: id,
            text
          }
        );
        return { posted: true, channel: id, ts: posted.ts };
      }
    })
  ]
};
