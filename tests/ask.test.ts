import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readLive } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const loadAsk = async () => {
  vi.resetModules();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  return import("@/lib/copper/assistant/ask");
};

const updatesOf = async (progress: Promise<unknown>) => {
  const updates: Progress[] = [];
  for await (const update of readLive(progress as never))
    updates.push(update as Progress);
  return updates;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("askCopper", () => {
  it("hands out fresh copies, so earlier updates never change", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: "reasoning-start", id: "r1" },
          { type: "reasoning-delta", id: "r1", delta: "Thinking" },
          { type: "reasoning-delta", id: "r1", delta: " harder" },
          { type: "reasoning-end", id: "r1" },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Hi." },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage,
          },
        ]),
      }),
    });
    const { askCopper } = await loadAsk();
    const { progress } = await askCopper({
      messages: [{ role: "user", content: "Hi" }],
      useTools: true,
    });
    const updates = await updatesOf(progress);
    const first = updates.find((u) => u.steps.length > 0)!;
    expect(first.steps[0]).toEqual({ type: "thinking", text: "Thinking" });
    expect(updates.at(-1)).toMatchObject({
      steps: [{ type: "thinking", text: "Thinking harder" }],
      reply: "Hi.",
      status: "done",
    });
  });

  it("ends with an apology and status error when the model fails", async () => {
    model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("model is down");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { askCopper } = await loadAsk();
    const { progress } = await askCopper({
      messages: [{ role: "user", content: "Hi" }],
      useTools: false,
    });
    const last = (await updatesOf(progress)).at(-1)!;
    expect(last.status).toBe("error");
    expect(last.reply).toMatch(/sorry/i);
  });
});
