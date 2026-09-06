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
  let offline = false;
  let nextPromptValue;
  let timerId = 0;
  const timers = new Map();
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
    if (offline) {
      return { ok: false, status: 503, json: async () => ({ error: "Offline" }) };
    }
    if ((options.method || "GET") === "GET") {
      if (!initialResolved) return initialLoad;
      return { ok: true, json: async () => clone(serverState) };
    }

    const { mutation } = JSON.parse(options.body || "{}");
    assert.ok(mutation, "La sauvegarde doit envoyer une mutation");
    if (mutation.value === null) delete serverState[mutation.scope][mutation.key];
    else serverState[mutation.scope][mutation.key] = clone(mutation.value);
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
    setTimeout(callback) { const id=++timerId;timers.set(id,callback);return id; },
    clearTimeout(id) { timers.delete(id); },
    Date: FixedDate,
    Math,
    JSON,
    Object,
    Array,
    Set,
    String,
    Number,
    parseFloat,
    prompt(_message, defaultValue = "") {
      const value=nextPromptValue;
      nextPromptValue=undefined;
      return value===undefined?(defaultValue || "Repas favori"):value;
    },
    alert() {},
    confirm() { return true; }
  });

  vm.runInContext(script, context);

  return {
    context,
    values,
    element,
    setOffline(value) { offline=value; },
    setPromptValue(value) { nextPromptValue=value; },
    async runNextTimer() {
      const next=timers.entries().next().value;
      if(!next)return;
      const [id,callback]=next;
      timers.delete(id);
      await callback();
      await new Promise(resolve => setImmediate(resolve));
    },
    resolveInitial() {
      initialResolved = true;
      resolveInitialLoad({ ok: true, json: async () => clone(serverState) });
    }
  };
}

const firstDevice = createDevice({ delayInitialLoad: true });
firstDevice.context.toggleMeal("m1");
assert.equal(JSON.parse(firstDevice.values.get("nut_90_97_meals_2026-08-25")).m1.status, "done");

firstDevice.resolveInitial();
await new Promise(resolve => setImmediate(resolve));
assert.equal(firstDevice.context.todayMeals().m1.status, "done");

await firstDevice.runNextTimer();
assert.equal(postCount > 0, true);
assert.equal(serverState.meals["2026-08-25"].m1.status, "done");
assert.deepEqual(JSON.parse(firstDevice.values.get("nut_90_97_pending_sync")), {});

const secondDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(secondDevice.context.todayMeals().m1.status, "done");

secondDevice.element("food-select-2026-08-25-m1").value = "cooked-rice";
secondDevice.context.addFoodToMeal("m1");
const composedMeal = secondDevice.context.todayMeals().m1;
assert.equal(composedMeal.items[0].name, "Cooked rice");
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
assert.equal(Object.values(thirdDevice.context.mealPresets()).filter(Boolean)[0].name, "Breakfast usual");
assert.match(thirdDevice.element("main").innerHTML, /<strong>\d+%<\/strong><span class="ring-sub">[\d.]+ kg<\/span>/);
const weeklyStats = thirdDevice.context.sevenDayCalorieStats(serverState.meals);
assert.deepEqual({ average: weeklyStats.average, tracked: weeklyStats.tracked }, { average: 325, tracked: 1 });
thirdDevice.context.switchTab(3);
assert.match(thirdDevice.element("main").innerHTML, /7-day calorie average/);
assert.match(thirdDevice.element("main").innerHTML, /1\/7 days logged/);
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

const weightDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
weightDevice.element("weightIn").value = "91.2";
await weightDevice.context.doSaveWeight();
assert.equal(serverState.weights["2026-08-25"], 91.2);
assert.match(weightDevice.element("toast").textContent, /Weight saved/);

const weightCheckDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(weightCheckDevice.context.weights()["2026-08-25"], 91.2);
weightCheckDevice.setPromptValue("90.9");
await weightCheckDevice.context.editWeight("2026-08-25");
assert.equal(serverState.weights["2026-08-25"], 90.9);

await weightCheckDevice.context.deleteWeight("2026-08-25");
assert.equal(serverState.weights["2026-08-25"], undefined);
assert.match(weightCheckDevice.element("toast").textContent, /Weight deleted/);

const offlineDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
offlineDevice.setOffline(true);
offlineDevice.context.saveWeight("2026-08-25", 91.4);
assert.equal(await offlineDevice.context.saveAllChanges(), false);
assert.match(offlineDevice.element("toast").textContent, /saved locally/);
assert.equal(Object.keys(JSON.parse(offlineDevice.values.get("nut_90_97_pending_sync"))).length, 1);
offlineDevice.setOffline(false);
assert.equal(await offlineDevice.context.saveAllChanges(), true);
assert.equal(serverState.weights["2026-08-25"], 91.4);
assert.deepEqual(JSON.parse(offlineDevice.values.get("nut_90_97_pending_sync")), {});

console.log("Cross-device meals, training, weight and offline flow: OK");

const runDevice = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(runDevice.context.parseRunTime('25:30'), 1530);
for(const value of ['', '0:00', '25:60', '-1:20', '25.5', '1:2', 'NaN']) assert.equal(runDevice.context.parseRunTime(value), null);
assert.equal(runDevice.context.saveRunTime('2026-02-30', '25:30'), false);
assert.equal(runDevice.context.saveRunTime('2027-01-01', '25:30'), false);
runDevice.context.switchTab(1);
assert.equal(vm.runInContext('TRAINING_PLAN[2].items.length',runDevice.context),1);
assert.match(runDevice.element('main').innerHTML, /5K finish time/);
assert.equal(runDevice.context.saveRunTime('2026-08-25', '25:30'), true);
assert.equal(runDevice.context.saveRunTime('2026-08-18', '26:00'), true);
await runDevice.context.saveAllChanges();
const runCheck = createDevice();
await new Promise(resolve => setImmediate(resolve));
assert.equal(runCheck.context.training()['2026-08-25'].runSeconds,1530);
assert.equal(runCheck.context.training()['2026-08-25'].notes[0],'5 km terminé, bonnes sensations');
assert.equal(runCheck.context.training()['2026-08-18'].runSeconds,1560);
runCheck.context.switchTab(4);
assert.match(runCheck.element('main').innerHTML,/0:30/);
assert.match(runCheck.element('main').innerHTML,/5:06\/km/);
runCheck.context.switchTab(3);
assert.match(runCheck.element('main').innerHTML,/5K Run · 25:30/);
runCheck.setOffline(true);
runCheck.context.saveRunTime('2026-08-18','24:00');
assert.equal(await runCheck.context.saveAllChanges(),false);
runCheck.setOffline(false);
await runCheck.context.saveAllChanges();
assert.equal(serverState.training['2026-08-18'].runSeconds,1440);
runCheck.context.deleteRunTime('2026-08-25');
await runCheck.context.saveAllChanges();
assert.equal(serverState.training['2026-08-25'].runSeconds,undefined);
assert.equal(serverState.training['2026-08-25'].notes[0],'5 km terminé, bonnes sensations');
runCheck.context.selectTrainingDate('2026-08-18');
runCheck.context.setTrainingComment('Earlier workout');
await runCheck.context.saveAllChanges();
assert.equal(serverState.training['2026-08-18'].comment,'Earlier workout');
console.log('5K validation, dated workouts, history, edits, deletion and offline sync: OK');
