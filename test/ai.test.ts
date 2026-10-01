// The fix for Llama 3.3 sending every streamed word twice.
import { describe, expect, it } from "vitest";
import { cleanAi, dedupeSseLine } from "@/lib/ai";

// A chunk shaped like the real Workers AI stream: text in two places.
const doubled = (text: string) =>
  `data: ${JSON.stringify({ response: text, tool_calls: [], choices: [{ delta: { content: text } }] })}`;

describe("dedupeSseLine", () => {
  it("keeps only the choices copy of the text", () => {
    const chunk = JSON.parse(dedupeSseLine(doubled("Hello")).slice(6));
    expect(chunk.response).toBeUndefined();
    expect(chunk.tool_calls).toBeUndefined();
    expect(chunk.choices[0].delta.content).toBe("Hello");
  });

  it("leaves chunks that only use the native format alone", () => {
    const line = `data: ${JSON.stringify({ response: "Hi" })}`;
    expect(dedupeSseLine(line)).toBe(line);
  });

  it("passes through [DONE], blank and non-JSON lines", () => {
    expect(dedupeSseLine("data: [DONE]")).toBe("data: [DONE]");
    expect(dedupeSseLine("")).toBe("");
    expect(dedupeSseLine("data: {not json")).toBe("data: {not json");
  });
});

describe("cleanAi", () => {
  it("fixes a stream even when lines are split across chunks", async () => {
    const body = [doubled("Hello"), doubled(" world"), "data: [DONE]", ""].join(
      "\n"
    );
    const encoder = new TextEncoder();
    // Split in awkward places, like a real network stream.
    const parts = [body.slice(0, 7), body.slice(7, 60), body.slice(60)];
    const fakeAi = {
      run: async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const p of parts) controller.enqueue(encoder.encode(p));
            controller.close();
          }
        })
    } as unknown as Ai;

    const stream = (await cleanAi(fakeAi).run(
      "model" as never,
      {} as never
    )) as ReadableStream<Uint8Array>;
    const text = await new Response(stream).text();

    const words = text
      .split("\n")
      .filter((l) => l.startsWith("data: {"))
      .map((l) => {
        const chunk = JSON.parse(l.slice(6));
        return chunk.response ?? chunk.choices[0].delta.content;
      });
    expect(words.join("")).toBe("Hello world");
    expect(text).not.toContain('"response"');
  });

  it("returns non-streamed results unchanged", async () => {
    const fakeAi = { run: async () => ({ response: "ok" }) } as unknown as Ai;
    expect(await cleanAi(fakeAi).run("model" as never, {} as never)).toEqual({
      response: "ok"
    });
  });
});
