import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, "Le script de l'application est introuvable");

const serverState = { meals: {}, weights: {}, training: {}, foods: {}, favorites: {}, mealPresets: {} };
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
    parseFloat,
    prompt(_message, defaultValue = "") { return defaultValue || "Repas favori"; },
    alert() {},
    confirm() { return true; }
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

secondDevice.element("food-select-2026-08-25-m1").value = "cooked-rice";
secondDevice.context.addFoodToMeal("m1");
const composedMeal = secondDevice.context.todayMeals().m1;
assert.equal(composedMeal.items[0].name, "Riz cuit");
assert.equal(secondDevice.context.itemsCalories(composedMeal), 325);
assert.equal(composedMeal.status, "modified");
assert.equal(secondDevice.context.recentFoodIds()[0], "cooked-rice");
assert.equal(secondDevice.context.foodById("greek-yogurt").kcal, 111);
assert.equal(secondDevice.context.foodById("egg").kcal, 68);
assert.equal(secondDevice.context.itemCalories({ ...secondDevice.context.foodById("gainer"), qty: 2 }), 390);
secondDevice.context.saveMealPreset("m1");

await secondDevice.context.saveAllChanges();
const thirdDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(thirdDevice.context.itemsCalories(thirdDevice.context.todayMeals().m1), 325);
assert.equal(Object.values(thirdDevice.context.mealPresets()).filter(Boolean)[0].name, "Breakfast habituel");
assert.match(thirdDevice.element("main").innerHTML, /<strong>\d+%<\/strong><span class="ring-sub">[\d.]+ kg<\/span>/);
const weeklyStats = thirdDevice.context.sevenDayCalorieStats(serverState.meals);
assert.deepEqual({ average: weeklyStats.average, tracked: weeklyStats.tracked }, { average: 325, tracked: 1 });
thirdDevice.context.switchTab(3);
assert.match(thirdDevice.element("main").innerHTML, /Moyenne calorique sur 7 jours/);
assert.match(thirdDevice.element("main").innerHTML, /1\/7 jours renseignés/);
assert.equal(html.includes("Protéines aujourd'hui"), false);

thirdDevice.context.deleteHistoryMeal("2026-08-25", "m1");
assert.equal(thirdDevice.context.todayMeals().m1, undefined);
await thirdDevice.context.saveAllChanges();
const fourthDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(fourthDevice.context.todayMeals().m1, undefined);
fourthDevice.context.toggleExercise(0);
fourthDevice.context.setExerciseComment(0, "5 km terminé, bonnes sensations");
fourthDevice.context.setTrainingComment("Séance cardio complète");
await fourthDevice.context.saveAllChanges();

const fifthDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(fifthDevice.context.training()["2026-08-25"].done[0], true);
assert.equal(fifthDevice.context.training()["2026-08-25"].notes[0], "5 km terminé, bonnes sensations");
fifthDevice.context.switchTab(3);
assert.match(fifthDevice.element("main").innerHTML, /5 km terminé, bonnes sensations/);

console.log("Cross-device food calories flow: OK");
