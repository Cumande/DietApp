import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
process.env.SUPABASE_URL = "https://example.supabase.co";

let state = { meals: {}, weights: {}, training: {}, foods: {}, favorites: {}, mealPresets: {} };
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

globalThis.fetch = originalFetch;
console.log("API food scopes: OK");
