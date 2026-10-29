import { afterEach, describe, expect, it, vi } from "vitest";

const loadTools = async () => {
  vi.resetModules();
  return import("@/lib/copper/assistant/tools");
};

afterEach(() => {
  vi.doUnmock("@/lib/copper/inventory");
});

describe("Ask Copper tools: edge cases", () => {
  it("no devices on the free plan costs nothing and has no lines", async () => {
    const { calculateCost, calculateCostInput } = await loadTools();
    const input = calculateCostInput.parse({
      products: [],
      plan: "free",
      billing: "annual",
      years: 5,
    });
    expect(calculateCost(input)).toEqual({ lines: [], totalUsd: 0 });
  });

  it("matches a color with extra spaces and odd capitalization", async () => {
    vi.doMock("@/lib/copper/inventory", () => ({
      readInventory: async () => [
        {
          sku: "CN-DSA",
          product: "Copper Notes",
          color: "Desert Sand",
          units_in_stock: 92,
          next_shipment: "2026-11-13",
        },
      ],
    }));
    const { checkAvailability, checkAvailabilityInput } = await loadTools();
    const input = checkAvailabilityInput.parse({
      product: "copper-notes",
      color: "  dESERT sand ",
    });
    expect(await checkAvailability(input)).toMatchObject({
      status: "ok",
      colors: [{ color: "Desert Sand" }],
    });
  });

  it("leaves out a color with no stock row, and still answers ok", async () => {
    vi.doMock("@/lib/copper/inventory", () => ({
      readInventory: async () => [
        {
          sku: "CH-POL",
          product: "Copper Home",
          color: "Polished Copper",
          units_in_stock: 9,
          next_shipment: "2026-12-01",
        },
      ],
    }));
    const { checkAvailability } = await loadTools();
    expect(await checkAvailability({ product: "copper-home" })).toEqual({
      status: "ok",
      product: "Copper Home",
      colors: [
        { color: "Polished Copper", stock: "low_stock", restockDate: null },
      ],
    });
  });

  it("says a color isn't real even when stock can't be read", async () => {
    vi.doMock("@/lib/copper/inventory", () => ({
      readInventory: async () => null,
    }));
    const { checkAvailability } = await loadTools();
    expect(
      await checkAvailability({
        product: "copper-notes",
        color: "Patina Teal",
      }),
    ).toMatchObject({ status: "not_a_color" });
    const down = await checkAvailability({ product: "copper-notes" });
    expect(down.status).toBe("unavailable");
    expect(JSON.stringify(down)).not.toMatch(/in_stock|low_stock|backordered/);
  });
});
