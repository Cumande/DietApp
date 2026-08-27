import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
process.env.SUPABASE_URL = "https://example.supabase.co";

let state = {
  meals: {},
  weights: { "2026-09-08": 92.3, "2026-09-15": 90.75 },
  training: {},
  foods: {},
  favorites: {},
  mealPresets: {}
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options = {}) => {
  if ((options.method || "GET") === "GET") {
    return { ok: true, status: 200, text: async () => JSON.stringify([{ data: state }]) };
  }
  state = JSON.parse(options.body).data;
  return { ok: true, status: 200, text: async () => "" };
};

const { default: handler } = await import("../api/nutrition-data.js?test=food-scopes");

async function mutate(mutation) {
  let statusCode = 0;
  let responseBody;
  const req = { method: "POST", body: { mutation } };
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return body; }
  };
  await handler(req, res);
  assert.equal(statusCode, 200);
  return responseBody;
}

const food = { id: "custom-test", name: "Test", unit: "g", base: 100, kcal: 250, defaultQty: 100 };
await mutate({ scope: "foods", key: food.id, value: food });
await mutate({ scope: "favorites", key: food.id, value: true });
await mutate({ scope: "mealPresets", key: "preset-test", value: { id: "preset-test", name: "Breakfast habituel", items: [] } });

assert.deepEqual(state.foods[food.id], food);
assert.equal(state.favorites[food.id], true);
assert.equal(state.mealPresets["preset-test"].name, "Breakfast habituel");
assert.equal(state.weights["2026-08-09"], 92.3);
assert.equal(state.weights["2026-08-15"], 90.775);
assert.equal(state.weights["2026-09-08"], undefined);
assert.equal(state.weights["2026-09-15"], undefined);

await mutate({ scope: "weights", key: "2026-08-27", value: 91.5 });
assert.equal(state.weights["2026-08-27"], 91.5);
await mutate({ scope: "weights", key: "2026-08-27", value: null });
assert.equal(state.weights["2026-08-27"], undefined);

globalThis.fetch = originalFetch;
console.log("API food scopes: OK");
