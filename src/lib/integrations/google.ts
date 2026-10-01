// Gmail and Google Docs tools.
import { z } from "zod";
import { htmlToText } from "../text";
import { api, defineTool } from "./types";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file"
];

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const DOCS = "https://docs.googleapis.com/v1/documents";

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet: string;
  payload: GmailPart & { headers: GmailHeader[] };
};

function header(m: GmailMessage, name: string) {
  return (
    m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function decodeBase64Url(data: string) {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function encodeBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Use the email's plain-text part, or strip the HTML.
function messageBody(part: GmailPart): string {
  const find = (p: GmailPart, type: string): string | null => {
    if (p.mimeType === type && p.body?.data)
      return decodeBase64Url(p.body.data);
    for (const child of p.parts ?? []) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain;
  const html = find(part, "text/html");
  return html ? htmlToText(html) : "";
}

function docIdFrom(idOrUrl: string) {
  return idOrUrl.match(/\/document\/d\/([\w-]+)/)?.[1] ?? idOrUrl.trim();
}

export const googleTools = {
  gmail: [
    defineTool({
      name: "gmail_search",
      description:
        "Search the user's Gmail with Gmail search syntax (e.g. 'is:unread newer_than:1d', 'from:boss@x.com'). Returns sender, subject, date and snippet.",
      input: z.object({
        query: z.string().describe("Gmail search query"),
        maxResults: z.coerce.number().int().min(1).max(20).default(10)
      }),
      async run(ctx, { query, maxResults }) {
        const token = await ctx.getToken("google");
        const list = await api<{ messages?: { id: string }[] }>(
          `${GMAIL}/messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) })}`,
          { token }
        );
        const messages = await Promise.all(
          (list.messages ?? []).map((m) =>
            api<GmailMessage>(
              `${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              { token }
            )
          )
        );
        return messages.map((m) => ({
          id: m.id,
          from: header(m, "From"),
          subject: header(m, "Subject"),
          date: header(m, "Date"),
          snippet: m.snippet
        }));
      }
    }),
    defineTool({
      name: "gmail_read",
      description:
        "Read the full text of one Gmail message by id (from gmail_search).",
      input: z.object({ id: z.string() }),
      async run(ctx, { id }) {
        const token = await ctx.getToken("google");
        const m = await api<GmailMessage>(
          `${GMAIL}/messages/${id}?format=full`,
          { token }
        );
        return {
          id: m.id,
          from: header(m, "From"),
          to: header(m, "To"),
          subject: header(m, "Subject"),
          date: header(m, "Date"),
          body: messageBody(m.payload).slice(0, 6000)
        };
      }
    }),
    defineTool({
      name: "gmail_send",
      description:
        "Send a plain-text email from the user's Gmail. If no recipient is specified by the user, send it to the user themself (omit 'to').",
      sensitive: true,
      input: z.object({
        to: z
          .string()
          .email()
          .optional()
          .describe("Recipient; defaults to the user's own address"),
        subject: z.string().min(1),
        body: z.string().min(1).describe("Plain text (Markdown is fine)")
      }),
      async run(ctx, { to, subject, body }) {
        const token = await ctx.getToken("google");
        const recipient =
          to ??
          (await api<{ emailAddress: string }>(`${GMAIL}/profile`, { token }))
            .emailAddress;
        const raw = [
          `To: ${recipient}`,
          `Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          body
        ].join("\r\n");
        const sent = await api<{ id: string }>(`${GMAIL}/messages/send`, {
          method: "POST",
          token,
          body: JSON.stringify({ raw: encodeBase64Url(raw) })
        });
        return { sent: true, id: sent.id, to: recipient };
      }
    })
  ],

  google_docs: [
    defineTool({
      name: "docs_create",
      description:
        "Create a new Google Doc with a title and plain-text content. Returns its URL.",
      sensitive: true,
      input: z.object({ title: z.string().min(1), content: z.string().min(1) }),
      async run(ctx, { title, content }) {
        const token = await ctx.getToken("google");
        const doc = await api<{ documentId: string }>(DOCS, {
          method: "POST",
          token,
          body: JSON.stringify({ title })
        });
        await api(`${DOCS}/${doc.documentId}:batchUpdate`, {
          method: "POST",
          token,
          body: JSON.stringify({
            requests: [
              { insertText: { location: { index: 1 }, text: content } }
            ]
          })
        });
        return {
          documentId: doc.documentId,
          url: `https://docs.google.com/document/d/${doc.documentId}/edit`
        };
      }
    }),
    defineTool({
      name: "docs_append",
      description:
        "Append plain text to the end of an existing Google Doc (id or URL).",
      sensitive: true,
      input: z.object({ document: z.string(), content: z.string().min(1) }),
      async run(ctx, { document, content }) {
        const token = await ctx.getToken("google");
        const id = docIdFrom(document);
        await api(`${DOCS}/${id}:batchUpdate`, {
          method: "POST",
          token,
          body: JSON.stringify({
            requests: [
              { insertText: { endOfSegmentLocation: {}, text: `\n${content}` } }
            ]
          })
        });
        return {
          appended: true,
          url: `https://docs.google.com/document/d/${id}/edit`
        };
      }
    }),
    defineTool({
      name: "docs_read",
      description:
        "Read the text of a Google Doc (id or URL). Only docs created by AMIGO or shared with the app are accessible.",
      input: z.object({ document: z.string() }),
      async run(ctx, { document }) {
        const token = await ctx.getToken("google");
        type El = {
          paragraph?: { elements: { textRun?: { content: string } }[] };
        };
        const doc = await api<{ title: string; body: { content: El[] } }>(
          `${DOCS}/${docIdFrom(document)}`,
          { token }
        );
        const text = doc.body.content
          .flatMap((el) => el.paragraph?.elements ?? [])
          .map((e) => e.textRun?.content ?? "")
          .join("");
        return { title: doc.title, text: text.slice(0, 8000) };
      }
    })
  ]
};
