import { afterEach, describe, expect, it, vi } from "vitest";

const ROW = {
  sku: "CN-NSK",
  product: "Copper Notes",
  color: "Night Sky",
  units_in_stock: 0,
  next_shipment: "2026-11-14",
};

// A fake Supabase client whose inventory query answers with `result`.
function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const select = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select };
}

async function loadWith(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({
    createStatelessClient: () => client,
  }));
  return import("@/lib/copper/inventory");
}

afterEach(() => {
  vi.doUnmock("@/lib/supabase/server");
});

describe("readInventory", () => {
  it("reads every row from the Supabase inventory table", async () => {
    const fake = fakeClient({ data: [ROW], error: null });
    const { readInventory } = await loadWith(fake.client);
    expect(await readInventory()).toEqual([ROW]);
    expect(fake.from).toHaveBeenCalledWith("inventory");
  });

  it("returns null when Supabase isn't set up", async () => {
    const { readInventory } = await loadWith(null);
    expect(await readInventory()).toBeNull();
  });

  it("returns null when the query fails or the network is down", async () => {
    let { readInventory } = await loadWith(
      fakeClient({ data: null, error: { message: "nope" } }).client,
    );
    expect(await readInventory()).toBeNull();
    ({ readInventory } = await loadWith(
      fakeClient(new Error("offline")).client,
    ));
    expect(await readInventory()).toBeNull();
  });
});
