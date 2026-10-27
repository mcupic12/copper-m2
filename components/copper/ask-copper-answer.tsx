// One Ask Copper answer, drawn as stations on a rail in the order they
// happened: the tools Copper could use, its thinking, each tool call (what it
// sent and what came back), what it's doing now, then the reply.
// The layout follows section 5 of specs/module-2/spec.md.
import type { ReactNode } from "react";
import {
  BrainIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { formatUsd, getProducts } from "@/lib/copper/catalog";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

export function AnswerView({
  progress,
  useTools,
}: {
  progress: Progress | null;
  useTools: boolean;
}) {
  const steps = progress?.steps ?? [];
  const reply = progress?.reply ?? "";
  const working = !progress || progress.status === "working";
  const toolSteps = steps.filter((s) => s.type === "tool");
  const used = new Set(toolSteps.map((s) => s.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-5 pl-11">
        <span
          aria-hidden
          className={cn(
            "absolute top-4 bottom-4 left-[15px] w-0.5 rounded-full bg-gradient-to-b",
            useTools ? "from-primary via-accent to-accent" : "bg-chart-3",
          )}
        />

        <Station
          node={<span className="text-[10px] font-bold">AI</span>}
          nodeClass={useTools ? "bg-primary" : "bg-chart-3"}
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {TOOL_NAMES.map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  !useTools && "text-muted-foreground line-through",
                  useTools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : useTools && "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-2 text-sm">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {steps.map((step, index) => {
          if (step.type === "thinking") {
            return (
              <Station
                key={index}
                node={<BrainIcon className="size-4" />}
                nodeClass={useTools ? "bg-primary" : "bg-chart-3"}
                label="Copper is thinking"
              >
                <div
                  data-testid="thinking"
                  className="text-muted-foreground border-l-2 pl-3 text-sm italic"
                >
                  <InlineMarkdown text={step.text} />
                </div>
              </Station>
            );
          }
          return (
            <Station
              key={step.id}
              node={<WrenchIcon className="size-4" />}
              nodeClass="bg-accent"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolSteps.indexOf(step) + 1} />
            </Station>
          );
        })}

        {working && (
          <Station node={<BouncingDots />} nodeClass="bg-primary">
            <p className="text-muted-foreground text-sm">
              {statusLine(progress, useTools)}
            </p>
          </Station>
        )}
      </div>

      {(reply || !working) && (
        <div className="bg-card text-card-foreground ml-8 rounded-2xl rounded-tl-sm border p-4 shadow-sm">
          <p className="text-primary mb-1 text-xs font-bold tracking-wide">
            Copper
          </p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-3 rounded-lg border p-3 text-sm">
              <p className="flex items-center gap-1.5">
                <TriangleAlertIcon
                  className="text-chart-3 size-4 shrink-0"
                  aria-hidden
                />
                <strong>Answered without tools: may be made up</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-base whitespace-pre-wrap">
            {reply}
            {working && (
              <span
                aria-hidden
                className="bg-primary ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function statusLine(progress: Progress | null, useTools: boolean) {
  if (progress?.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress?.steps.length) return "Deciding what to do next…";
  return "Reading your question…";
}

function Station({
  node,
  nodeClass,
  label,
  children,
}: {
  node: ReactNode;
  nodeClass: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          "ring-secondary absolute top-0 -left-11 flex size-8 items-center justify-center rounded-full text-white ring-4",
          nodeClass,
        )}
      >
        {node}
      </span>
      {label && (
        <p className="text-muted-foreground mb-2 pt-1.5 text-[11px] font-semibold tracking-widest uppercase">
          {label}
        </p>
      )}
      <div className={cn(!label && "pt-1.5")}>{children}</div>
    </div>
  );
}

function BouncingDots() {
  return (
    <span className="flex gap-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 animate-bounce rounded-full bg-white"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Renders the **bold** and `code` marks in Gemini's thought summaries. */
function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block min-h-[1em]">
          {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="text-foreground not-italic">
                {part.slice(2, -2)}
              </strong>
            ) : part.startsWith("`") && part.endsWith("`") ? (
              <code key={j} className="font-mono not-italic">
                {part.slice(1, -1)}
              </code>
            ) : (
              part
            ),
          )}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The tool card: always open, what Copper sent above what came back.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

const productName = (id: unknown) =>
  getProducts().find((p) => p.id === id)?.name ?? String(id);

const restockLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const running = step.state === "calling";

  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-xl border text-sm shadow-sm"
    >
      <div className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded-full bg-white/40 px-1.5 text-[10px] font-semibold">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name]}</span>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-widest uppercase">
          → What Copper sent
        </p>
        <SentInput step={step} />
      </div>

      <div className="bg-accent/10 border-t px-3 py-2.5">
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-widest uppercase">
          ← What came back
        </p>
        {running ? (
          <p className="text-muted-foreground flex items-center gap-1.5 italic">
            <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
            the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p className="text-chart-3">{String(step.output)}</p>
        ) : (
          <CameBack name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SentInput({ step }: { step: ToolStep }) {
  if (step.name === "get_prices")
    return <p>Nothing, it just asked for the price list</p>;
  if (step.name === "get_products")
    return <p>Nothing, it just asked what Copper sells</p>;
  if (!isRec(step.input))
    return (
      <p className="text-muted-foreground italic">filling in the details…</p>
    );

  const input = step.input;
  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <Rows
        rows={[
          [
            "Products",
            products.length ? products.map(productName).join(", ") : "None",
          ],
          ["Plan", input.plan === "copper-plus" ? "Copper Plus" : "Free"],
          ["Billing", String(input.billing)],
          ["Years", String(input.years)],
        ]}
      />
    );
  }
  if (step.name === "check_availability") {
    return (
      <Rows
        rows={[
          ["Product", productName(input.product)],
          ["Color", input.color ? String(input.color) : "All colors"],
        ]}
      />
    );
  }
  return (
    <Rows
      rows={Object.entries(input).map(([key, value]) => [key, String(value)])}
    />
  );
}

const STOCK_PILL = {
  in_stock: {
    label: "In stock",
    className: "bg-accent text-accent-foreground",
  },
  low_stock: { label: "Low stock", className: "bg-chart-4 text-foreground" },
  backordered: { label: "Back-ordered", className: "bg-chart-3 text-white" },
} as const;

function CameBack({ name, output }: { name: string; output: unknown }) {
  if (!isRec(output)) return <p>{String(output ?? "Nothing")}</p>;

  if (name === "calculate_cost" && Array.isArray(output.lines)) {
    return (
      <div>
        <ul className="flex flex-col gap-1">
          {(output.lines as { item: string; usd: number }[]).map((line, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{line.item}</span>
              <span className="font-medium">{formatUsd(line.usd)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(Number(output.totalUsd))}
          </span>
        </div>
      </div>
    );
  }

  if (name === "get_products" && Array.isArray(output.products)) {
    return (
      <div className="flex flex-col gap-3">
        {(output.products as Rec[]).map((p) => (
          <div key={String(p.id)}>
            <p className="flex justify-between gap-4 font-medium">
              <span>{String(p.name)}</span>
              <span>{formatUsd(Number(p.priceUsd))}</span>
            </p>
            <p className="text-muted-foreground text-xs">{String(p.type)}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Array.isArray(p.colors) ? p.colors : []).map((color) => (
                <span
                  key={String(color)}
                  className="bg-accent/20 rounded-full px-2 py-0.5 text-xs"
                >
                  {String(color)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (name === "get_prices" && Array.isArray(output.products)) {
    const plans = Array.isArray(output.plans) ? (output.plans as Rec[]) : [];
    return (
      <ul className="flex flex-col gap-1">
        {(output.products as Rec[]).map((p) => (
          <li key={String(p.id)} className="flex justify-between gap-4">
            <span>{String(p.name)}</span>
            <span className="font-medium">{formatUsd(Number(p.priceUsd))}</span>
          </li>
        ))}
        {plans
          .filter((p) => Number(p.monthlyUsd) > 0)
          .map((p) => (
            <li key={String(p.id)} className="flex justify-between gap-4">
              <span>{String(p.name)}</span>
              <span className="font-medium">
                {formatUsd(Number(p.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(p.annualUsd))}/yr
              </span>
            </li>
          ))}
      </ul>
    );
  }

  if (name === "check_availability") {
    if (output.status === "not_a_color") {
      const colors = Array.isArray(output.colors) ? output.colors : [];
      return (
        <p>
          {String(output.product)} doesn&apos;t come in {String(output.color)}.
          It comes in {colors.join(", ")}.
        </p>
      );
    }
    if (output.status === "unavailable") return <p>{String(output.message)}</p>;
    const colors = Array.isArray(output.colors) ? (output.colors as Rec[]) : [];
    return (
      <ul className="flex flex-col gap-1.5">
        {colors.map((c) => {
          const pill = STOCK_PILL[c.stock as keyof typeof STOCK_PILL];
          return (
            <li
              key={String(c.color)}
              className="flex items-center justify-between gap-4"
            >
              <span>{String(c.color)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  pill?.className,
                )}
              >
                {pill?.label ?? String(c.stock)}
                {c.stock === "backordered" && c.restockDate
                  ? ` until ${restockLabel(String(c.restockDate))}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return <p className="font-mono text-xs">{JSON.stringify(output)}</p>;
}
