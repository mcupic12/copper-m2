// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;
const PLAN_IDS = ["free", "copper-plus"] as const;

/** Units below this count as low stock (Product Bible Section 10). */
const LOW_STOCK_UNITS = 10;

/** Rounds to whole cents, so $7.99 x 12 is 95.88, not 95.88000000000001. */
const toCents = (usd: number) => Math.round(usd * 100) / 100;

/** Compares color names the way shoppers type them: any case, extra spaces. */
const sameColor = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z
    .array(z.enum(PRODUCT_IDS))
    .max(5)
    .describe("The devices, 0 to 5. List a device twice for two of them."),
  plan: z.enum(PLAN_IDS),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5).describe("Whole years, 1 to 5."),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = input.products.map((id) => {
    const product = products.find((p) => p.id === id)!;
    return { item: product.name, usd: toCents(product.priceUsd) };
  });

  // The free plan costs nothing, so it adds no line. Copper Plus covers the
  // whole household, so it's one line however many devices there are.
  if (input.plan !== "free") {
    const plan = getPlans().find((p) => p.id === input.plan)!;
    const yearly = input.billing === "annual";
    const years = `${input.years} year${input.years === 1 ? "" : "s"}`;
    lines.push({
      item: `${plan.name}, paid ${yearly ? "yearly" : "monthly"} for ${years}`,
      usd: toCents(
        yearly
          ? plan.annualUsd * input.years
          : plan.monthlyUsd * 12 * input.years,
      ),
    });
  }

  const totalUsd = toCents(lines.reduce((sum, line) => sum + line.usd, 0));
  return { lines, totalUsd };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(PRODUCT_IDS),
    color: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "One color name, any capitalization. Leave out for all colors.",
      ),
  });

const stockOf = (units: number): Stock =>
  units === 0
    ? "backordered"
    : units < LOW_STOCK_UNITS
      ? "low_stock"
      : "in_stock";

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product)!;

  // Check the color against the catalog before stock: a color the product
  // doesn't come in is "not a color", even when stock can't be read.
  let colors = product.colors;
  if (input.color !== undefined) {
    const match = product.colors.find((c) => sameColor(c, input.color!));
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color.trim(),
        colors: product.colors,
      };
    }
    colors = [match];
  }

  // Read stock fresh every time: it changes daily.
  const inventory = await readInventory();
  if (inventory === null) {
    return {
      status: "unavailable",
      message:
        "Stock can't be checked right now. Please try again in a few minutes.",
    };
  }

  // Stock rows hold the product's display name, not its id.
  const rows = inventory.filter((row) => row.product === product.name);
  return {
    status: "ok",
    product: product.name,
    colors: colors.flatMap((color) => {
      const row = rows.find((r) => sameColor(r.color, color));
      if (!row) return [];
      const stock = stockOf(row.units_in_stock);
      return [
        {
          color,
          stock,
          restockDate: stock === "backordered" ? row.next_shipment : null,
        },
      ];
    }),
  };
}

export const copperTools: ToolSet = {
  get_products: tool({
    description:
      "Lists every Copper product with its type, price and the colors it comes in (not whether they're in stock).",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Gets the current price of every Copper device and every plan (Free and Copper Plus, monthly and yearly).",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Works out the total cost of Copper devices plus a plan over 1 to 5 years, with a line for each item.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Checks today's stock for a Copper product, for one color or all of them, including when back-ordered colors restock.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};
