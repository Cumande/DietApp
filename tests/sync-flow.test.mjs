import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, "Le script de l'application est introuvable");

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      hidden: false,
      disabled: false,
      textContent: "",
      innerHTML: "",
      title: "",
      classList: { toggle() {} }
    });
  }
  return elements.get(id);
}

const values = new Map();
const localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};

let resolveInitialLoad;
const initialLoad = new Promise(resolve => { resolveInitialLoad = resolve; });
let postCount = 0;
const fetch = async (_url, options = {}) => {
  if ((options.method || "GET") === "GET") return initialLoad;
  postCount++;
  return { ok: true, json: async () => ({}) };
};

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ["2026-08-25T12:00:00Z"]));
  }

  static now() { return new Date("2026-08-25T12:00:00Z").getTime(); }
}

const context = vm.createContext({
  console,
  fetch,
  localStorage,
  document: {
    body: { classList: { toggle() {} } },
    activeElement: null,
    visibilityState: "visible",
    getElementById: element,
    addEventListener() {}
  },
  window: { addEventListener() {} },
  setInterval() {},
  Date: FixedDate,
  Math,
  JSON,
  Object,
  Array,
  Set,
  String,
  Number,
  parseFloat
});

vm.runInContext(script, context);

context.toggleMeal("m1");
assert.equal(JSON.parse(values.get("nut_90_97_meals_2026-08-25")).m1.status, "done");
assert.equal(element("saveChanges").hidden, false);

resolveInitialLoad({
  ok: true,
  json: async () => ({ meals: {}, weights: {}, training: {} })
});
await new Promise(resolve => setImmediate(resolve));

context.switchTab(1);
context.switchTab(0);
assert.equal(context.todayMeals().m1.status, "done");

await context.saveAllChanges();
assert.equal(postCount > 0, true);
assert.deepEqual(JSON.parse(values.get("nut_90_97_pending_sync")), {});
assert.equal(element("saveChanges").hidden, true);

console.log("Manual sync flow: OK");
