import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createLive, type Live } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";

const askCopper = vi.fn();
vi.mock("@/lib/copper/assistant/ask", () => ({ askCopper }));

const { AskCopper, STARTER_QUESTIONS } =
  await import("@/components/copper/ask-copper");

describe("Ask Copper panel", () => {
  it("offers the starter questions again after a typed question, and hides them while streaming", async () => {
    let finish!: (value: Progress) => void;
    askCopper.mockImplementation(async () => {
      const live = createLive<Progress>();
      live.update({ steps: [], reply: "Checking", status: "working" });
      finish = (value) => live.done(value);
      return { progress: live.live as Live<Progress> };
    });

    render(<AskCopper aiConfigured />);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const chat = within(await screen.findByTestId("ask-copper"));

    fireEvent.change(chat.getByRole("textbox"), {
      target: { value: "Do you ship to Tucson?" },
    });
    fireEvent.click(chat.getByRole("button", { name: /send/i }));

    // While the answer streams, the starters step aside.
    await waitFor(() => expect(chat.getByText("Checking")).toBeInTheDocument());
    expect(
      chat.queryByRole("button", { name: STARTER_QUESTIONS[0] }),
    ).toBeNull();

    finish({
      steps: [],
      reply: "I can only help with prices and stock.",
      status: "done",
    });
    await waitFor(() =>
      expect(chat.getByText(/only help with prices/)).toBeInTheDocument(),
    );
    for (const starter of STARTER_QUESTIONS)
      expect(chat.getByRole("button", { name: starter })).toBeInTheDocument();
  });

  it("shows the setup card and no chat box when AI isn't configured", async () => {
    render(<AskCopper aiConfigured={false} />);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const chat = within(await screen.findByTestId("ask-copper"));
    expect(chat.getByText(/set up .+ to use this page/i)).toBeInTheDocument();
    expect(chat.queryByRole("textbox")).toBeNull();
    expect(chat.queryByRole("switch")).toBeNull();
  });
});
