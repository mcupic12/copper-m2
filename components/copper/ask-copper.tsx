"use client";

// Module 2: Ask Copper, the floating shopping chat. The launcher, the header's
// Ask Copper link and /#ask all open the panel. Tools on and tools off are two
// separate chats, each sending only its own history to askCopper().
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { AnswerView } from "@/components/copper/ask-copper-answer";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

export const STARTER_QUESTIONS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

type Turn = { question: string; progress: Progress | null };
type ChatKey = "tools" | "noTools";

const isAskLink = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('a[href$="#ask"]'));

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Record<ChatKey, Turn[]>>({
    tools: [],
    noTools: [],
  });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const key: ChatKey = useTools ? "tools" : "noTools";
  const turns = chats[key];
  const streaming = turns.some(
    (turn) => !turn.progress || turn.progress.status === "working",
  );

  // Open on /#ask, on a hash change to #ask, and on any click of an #ask
  // link: once the address already ends in #ask, a second click fires no
  // hashchange, so the click is what keeps the link working.
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const openOnClick = (event: MouseEvent) => {
      if (isAskLink(event.target)) setOpen(true);
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    document.addEventListener("click", openOnClick);
    return () => {
      window.removeEventListener("hashchange", openOnHash);
      document.removeEventListener("click", openOnClick);
    };
  }, []);

  // Keep the newest step in view as the answer streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chats, useTools]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || streaming) return;
    const chat = key;
    const history: ChatMessage[] = chats[chat].flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      ...(turn.progress?.reply
        ? [{ role: "assistant" as const, content: turn.progress.reply }]
        : []),
    ]);
    const index = chats[chat].length;
    const setProgress = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [chat]: all[chat].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setDraft("");
    setChats((all) => ({
      ...all,
      [chat]: [...all[chat], { question: text, progress: null }],
    }));
    try {
      const { progress } = await askCopper({
        messages: [...history, { role: "user", content: text }],
        useTools: chat === "tools",
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({
        steps: [],
        reply: "Sorry, I couldn't reach Copper just now. Please try again.",
        status: "error",
      });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        aria-label="Ask Copper"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full pr-5 pl-2 text-base shadow-lg"
      >
        <Image
          src="/assets/brand/copper-mascot.png"
          alt="Copper the robot mascot"
          width={1254}
          height={1254}
          sizes="32px"
          className="size-8 rounded-full bg-white/30"
        />
        Ask Copper
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        >
          <div className="dark bg-background text-foreground">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper the robot mascot"
                  width={1254}
                  height={1254}
                  sizes="40px"
                  className="size-9"
                />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-foreground text-lg font-bold">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-muted-foreground text-sm">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <XIcon />
                </Button>
              </SheetClose>
            </div>
            {aiConfigured && (
              <label className="bg-muted/60 flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-semibold">Use tools</span>
                <span className="text-muted-foreground flex-1 text-xs">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </span>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={setUseTools}
                />
              </label>
            )}
          </div>

          {aiConfigured ? (
            <>
              <div
                ref={scrollRef}
                className="bg-secondary text-secondary-foreground flex-1 overflow-y-auto px-4 py-5"
              >
                <div className="flex flex-col gap-6">
                  {turns.map((turn, i) => (
                    <div key={i} className="flex flex-col gap-4">
                      <p className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-base">
                        {turn.question}
                      </p>
                      <AnswerView
                        progress={turn.progress}
                        useTools={useTools}
                      />
                    </div>
                  ))}
                  {!streaming && (
                    <div className="flex flex-col gap-2">
                      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                        {turns.length ? "Ask another" : "Try asking"}
                      </p>
                      {STARTER_QUESTIONS.map((starter) => (
                        <Button
                          key={starter}
                          variant="outline"
                          onClick={() => void ask(starter)}
                          className="h-auto justify-start rounded-xl py-2 text-left whitespace-normal"
                        >
                          {starter}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <form
                onSubmit={onSubmit}
                className="bg-card flex items-end gap-2 border-t p-3"
              >
                <Textarea
                  aria-label="Your question"
                  placeholder="Ask about prices, totals or stock…"
                  value={draft}
                  rows={1}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void ask(draft);
                    }
                  }}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={streaming || !draft.trim()}
                  className="size-10 shrink-0 rounded-full"
                >
                  <ArrowUpIcon />
                </Button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
