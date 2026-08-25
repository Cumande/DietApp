import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, "Le script de l'application est introuvable");

const serverState = { meals: {}, weights: {}, training: {} };
let postCount = 0;
const clone = value => JSON.parse(JSON.stringify(value));

function createDevice({ delayInitialLoad = false } = {}) {
  const elements = new Map();
  const values = new Map();
  let initialResolved = !delayInitialLoad;
  let resolveInitialLoad;
  const initialLoad = new Promise(resolve => { resolveInitialLoad = resolve; });

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

  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };

  const fetch = async (_url, options = {}) => {
    if ((options.method || "GET") === "GET") {
      if (!initialResolved) return initialLoad;
      return { ok: true, json: async () => clone(serverState) };
    }

    const { mutation } = JSON.parse(options.body || "{}");
    assert.ok(mutation, "La sauvegarde doit envoyer une mutation");
    serverState[mutation.scope][mutation.key] = clone(mutation.value);
    postCount++;
    return { ok: true, json: async () => clone(serverState) };
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

  return {
    context,
    values,
    element,
    resolveInitial() {
      initialResolved = true;
      resolveInitialLoad({ ok: true, json: async () => clone(serverState) });
    }
  };
}

const firstDevice = createDevice({ delayInitialLoad: true });
firstDevice.context.toggleMeal("m1");
assert.equal(JSON.parse(firstDevice.values.get("nut_90_97_meals_2026-08-25")).m1.status, "done");
assert.equal(firstDevice.element("saveChanges").hidden, false);

firstDevice.resolveInitial();
await new Promise(resolve => setImmediate(resolve));
assert.equal(firstDevice.context.todayMeals().m1.status, "done");

await firstDevice.context.syncAndSave();
assert.equal(postCount > 0, true);
assert.equal(serverState.meals["2026-08-25"].m1.status, "done");
assert.deepEqual(JSON.parse(firstDevice.values.get("nut_90_97_pending_sync")), {});
assert.equal(firstDevice.element("saveChanges").hidden, true);

const secondDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(secondDevice.context.todayMeals().m1.status, "done");

console.log("Cross-device sync flow: OK");
