import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script, "Le script de l'application est introuvable");

const serverState = { meals: {}, weights: {}, training: {}, foods: {}, favorites: {}, mealPresets: {} };
let postCount = 0;
const clone = value => JSON.parse(JSON.stringify(value));

function createDevice({ delayInitialLoad = false, storedValues = [], startOffline = false } = {}) {
  const elements = new Map();
  const values = new Map(storedValues);
  let initialResolved = !delayInitialLoad;
  let resolveInitialLoad;
  let offline = startOffline;
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

    const { changes } = JSON.parse(options.body || "{}");
    assert.ok(changes, "La sauvegarde doit envoyer des changements atomiques");
    const updated=clone(serverState);
    for(const change of changes){
      let parent=updated;
      for(const key of change.path.slice(0,change.parentDepth||0))parent=parent?.[key];
      if(parent===undefined)return {ok:false,status:409,json:async()=>({error:'Concurrent parent deletion'})};
      let cursor=updated;
      for(const key of change.path.slice(0,-1))cursor=cursor[key]??=( {} );
      const key=change.path.at(-1),previous=cursor[key];
      if((change.remove&&previous===undefined)||(!change.remove&&JSON.stringify(previous)===JSON.stringify(change.value)))continue;
      if((previous!==undefined)!==change.exists||(change.exists&&JSON.stringify(previous)!==JSON.stringify(change.before)))return {ok:false,status:409,json:async()=>({error:'Concurrent edit'})};
      if(change.remove)delete cursor[key];else cursor[key]=clone(change.value);
    }
    Object.assign(serverState,updated);
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
assert.match(thirdDevice.element("main").innerHTML, /Calories today/);
const weeklyStats = thirdDevice.context.sevenDayCalorieStats(serverState.meals);
assert.deepEqual({ average: weeklyStats.average, tracked: weeklyStats.tracked }, { average: 325, tracked: 1 });
thirdDevice.context.switchTab(3);
assert.doesNotMatch(thirdDevice.element("main").innerHTML, /7-day calorie average/);

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
assert.match(offlineDevice.element("toast").textContent, /kept on this device/);
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
assert.match(runDevice.element('main').innerHTML, /Finish time/);
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
assert.match(runCheck.element('main').innerHTML,/5 km Run · 25:30/);
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

const enhanced=createDevice();
await new Promise(resolve=>setImmediate(resolve));
assert.match(vm.runInContext('TRAINING_PLAN[1].items.join("|")',enhanced.context),/3x4 at 110kg.*2x4 at 100kg.*3x6 at 90kg.*3x8 at 80kg.*3x12 at 70kg.*3x6 at 70kg.*4x10 at 20kg.*4x12 at 14kg/);
assert.match(vm.runInContext('TRAINING_PLAN[3].items.join("|")',enhanced.context),/4x4 at 105kg.*try 110kg.*2x4 at 100kg.*3x6 at 90kg.*3x8 at 80kg.*3x12 at 70kg.*3x10-12 at 24kg/);
assert.match(vm.runInContext('TRAINING_PLAN[4].items.join("|")',enhanced.context),/5x5 at 72.5kg.*6x6 at 70kg.*before trying 80kg/);
enhanced.context.selectTrainingDate('2026-08-21');
assert.match(enhanced.element('main').innerHTML,/Round 6/);
assert.match(enhanced.element('main').innerHTML,/Set 4/);
for(let exerciseIndex=0;exerciseIndex<3;exerciseIndex++){
  for(let i=0;i<6;i++) enhanced.context.setFridayRound(exerciseIndex,i,true);
}
for(let i=0;i<4;i++) enhanced.context.setFridayRound(3,i,true);
assert.equal(enhanced.context.training()['2026-08-21'].done[2],true);
assert.equal(enhanced.context.training()['2026-08-21'].done[3],true);
enhanced.context.setFridayRound(2,2,false);
assert.equal(enhanced.context.training()['2026-08-21'].done[2],false);
const exercise=vm.runInContext('TRAINING_PLAN[5].items[3]',enhanced.context);
enhanced.context.saveStrength(exercise,'sets','4');
enhanced.context.saveStrength(exercise,'reps','12');
enhanced.context.saveStrength(exercise,'kg','30');
enhanced.context.saveStrength(exercise,'reps','1.5');
assert.equal(enhanced.context.training()['2026-08-21'].strength[exercise].reps,12);
await enhanced.context.saveAllChanges();
const enhancedOther=createDevice();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(enhancedOther.context.training()['2026-08-21'].strength[exercise].kg,30);
assert.equal(Object.values(enhancedOther.context.training()['2026-08-21'].fridayRounds[0]).filter(Boolean).length,6);
assert.equal(Object.values(enhancedOther.context.training()['2026-08-21'].fridayRounds[2]).filter(Boolean).length,5);
assert.equal(Object.values(enhancedOther.context.training()['2026-08-21'].fridayRounds[3]).filter(Boolean).length,4);
enhancedOther.context.selectTrainingDate('2026-08-28');
assert.match(enhancedOther.element('main').innerHTML,/Previous \(2026-08-21\): 4 sets × 12 reps at 30 kg/);
assert.match(enhancedOther.element('main').innerHTML,/Future workout preview/);
enhancedOther.context.moveTrainingDay(-1);
assert.equal(vm.runInContext('trainingDate',enhancedOther.context),'2026-08-27');
enhancedOther.context.openWeekDay(1);
assert.equal(vm.runInContext('trainingDate',enhancedOther.context),'2026-08-24');
assert.equal(vm.runInContext('INTERVAL_TOTAL',enhancedOther.context),1950);
assert.equal(enhancedOther.context.intervalPosition(479).name,'Warm-up');
assert.equal(enhancedOther.context.intervalPosition(480).name,'Fast interval 1/6');
assert.equal(enhancedOther.context.intervalPosition(600).name,'Recovery 1/5');
assert.equal(enhancedOther.context.intervalPosition(1530).name,'Fast interval 6/6');
assert.equal(enhancedOther.context.intervalPosition(1650).name,'Cool-down');
assert.equal(enhancedOther.context.intervalPosition(1950).name,'Session complete');
enhancedOther.context.toggleInterval();
assert.equal(enhancedOther.context.intervalElapsed(Date.now())>=0,true);
vm.runInContext('intervalState.started=Date.now()-10000',enhancedOther.context);
enhancedOther.context.toggleInterval();
assert.equal(enhancedOther.context.intervalElapsed(),10);
enhancedOther.context.toggleInterval();
assert.equal(enhancedOther.context.intervalElapsed(),10);
enhancedOther.context.resetInterval();
assert.equal(enhancedOther.context.intervalElapsed(),0);
assert.equal(enhancedOther.context.rollingWeightAverage({'2026-08-01':80,'2026-08-18':90,'2026-08-24':92},'2026-08-24'),91);
assert.equal(enhancedOther.context.dateChartX('2026-08-02',['2026-08-01','2026-08-11'],0,100),10);
enhancedOther.element('weightDate').value='2026-08-20';
enhancedOther.element('weightIn').value='91.3';
await enhancedOther.context.doSaveWeight();
assert.equal(serverState.weights['2026-08-20'],91.3);
enhancedOther.element('runRoute').value='Park <loop>';
enhancedOther.element('runEffort').value='Hard';
enhancedOther.element('runSurface').value='Outdoor';
enhancedOther.context.saveRunTime('2026-08-24','24:30');
await enhancedOther.context.saveAllChanges();
assert.equal(serverState.training['2026-08-24'].runDetails.route,'Park <loop>');
enhancedOther.context.switchTab(4);
assert.match(enhancedOther.element('main').innerHTML,/Park &lt;loop&gt;/);
assert.match(enhancedOther.element('main').innerHTML,/5K finish times by date/);
enhancedOther.context.loadRunTime('2026-08-24');
assert.equal(enhancedOther.element('runRoute').value,'Park <loop>');
enhancedOther.context.filterFoods('rice','2026-08-25','m1');
assert.match(enhancedOther.element('food-select-2026-08-25-m1').innerHTML,/Cooked rice/);
assert.doesNotMatch(enhancedOther.element('food-select-2026-08-25-m1').innerHTML,/Banana/);
enhancedOther.element('portion-2026-08-25-m1').value='125';
enhancedOther.context.addFoodToMeal('m1','2026-08-25','cooked-rice');
assert.equal(enhancedOther.context.todayMeals().m1.items.at(-1).qty,125);
enhancedOther.context.switchTab(2);
assert.doesNotMatch(enhancedOther.element('main').innerHTML,/Courbe de poids/);
console.log('Round tracking, strength history, interval boundaries, navigation, charts, dated weight and portions: OK');

const aiDevice=createDevice();await new Promise(resolve=>setImmediate(resolve));
const syncFetch=aiDevice.context.fetch;
aiDevice.context.fetch=async()=>({ok:true,json:async()=>({items:[{name:'Cooked rice',grams:200,kcalPer100g:130}],assumptions:'Cooked weight.',question:''})});
aiDevice.context.setAiDescription('2026-08-25','m2','200g cooked rice');
const beforeAi=JSON.stringify(aiDevice.context.todayMeals().m2);
await aiDevice.context.estimateMeal('2026-08-25','m2');
assert.equal(JSON.stringify(aiDevice.context.todayMeals().m2),beforeAi,'Estimation must not save a meal');
aiDevice.context.editAiIngredient('2026-08-25','m2',0,'grams','150');
assert.equal(vm.runInContext("aiEstimateTotal(aiMeals['2026-08-25:m2'].result.items)",aiDevice.context),195);
aiDevice.context.saveAiMeal('2026-08-25','m2');
assert.equal(aiDevice.context.todayMeals().m2.items[0].source,'ai');
assert.equal(aiDevice.context.itemsCalories(aiDevice.context.todayMeals().m2),195);
aiDevice.context.fetch=syncFetch;await aiDevice.context.saveAllChanges();
assert.equal(serverState.meals['2026-08-25'].m2.items[0].qty,150);
aiDevice.context.setAiDescription('2026-08-25','m2','A different meal');
assert.equal(vm.runInContext("aiMeals['2026-08-25:m2'].result",aiDevice.context),null);
console.log('AI meal review, editable portions, explicit save and sync: OK');

const photoDevice=createDevice();await new Promise(resolve=>setImmediate(resolve));
const photoSyncFetch=photoDevice.context.fetch;
const samplePhoto='data:image/jpeg;base64,/9j/AAAAAAAAAAAA';
photoDevice.context.prepareAiPhoto=async()=>samplePhoto;
await photoDevice.context.selectAiPhoto('2026-08-25','m3',{type:'image/jpeg',size:100});
assert.match(photoDevice.context.aiMealPanel('m3','2026-08-25'),/Selected meal or nutrition label/);
photoDevice.context.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);assert.equal(body.image,samplePhoto);assert.equal(body.description,'');
 return {ok:true,json:async()=>({items:[{name:'Rice',grams:150,kcalPer100g:130}],assumptions:'Photo portion estimated.',question:''})};
};
await photoDevice.context.estimateMeal('2026-08-25','m3');
assert.equal(vm.runInContext("aiMeals['2026-08-25:m3'].result.items.length",photoDevice.context),1);
photoDevice.context.saveAiMeal('2026-08-25','m3');
photoDevice.context.fetch=photoSyncFetch;await photoDevice.context.saveAllChanges();
assert.equal(serverState.meals['2026-08-25'].m3.items[0].qty,150);
assert.doesNotMatch(JSON.stringify(serverState),/data:image/);
assert.doesNotMatch(JSON.stringify([...photoDevice.values.values()]),/data:image/);
await photoDevice.context.selectAiPhoto('2026-08-25','m3',{});
photoDevice.context.removeAiPhoto('2026-08-25','m3');
assert.equal(vm.runInContext("aiMeals['2026-08-25:m3'].image",photoDevice.context),undefined);
assert.equal(vm.runInContext("aiMeals['2026-08-25:m3'].result",photoDevice.context),null);
console.log('Photo preview, photo-only estimate, removal and image-free persistence: OK');

assert.ok(html.includes('capture="environment"'));
assert.ok(html.includes('📷 Take a photo'));
assert.ok(html.includes('Or write what you ate'));
assert.ok(!html.includes('aiAccessCode'));
assert.ok(!html.includes('x-ai-access-code'));

const simple=createDevice();await new Promise(resolve=>setImmediate(resolve));
assert.match(simple.element('main').innerHTML,/What did you eat/);
assert.doesNotMatch(simple.element('main').innerHTML,/Build this meal|Search foods|Suggested plan|Copy yesterday/);
const existing=JSON.stringify(simple.context.todayMeals().m2);
vm.runInContext("aiMeals[aiMealKey(today(),'quick')]={description:'Two eggs',result:{items:[{name:'Eggs',grams:100,kcalPer100g:155}],assumptions:'Estimated portion.',question:''}}",simple.context);
simple.context.saveAiMeal('2026-08-25','quick');
const simpleEntries=Object.values(simple.context.todayMeals()).filter(entry=>entry.extra&&entry.name==='Eggs');
assert.equal(simpleEntries.length,1);
assert.equal(simple.context.itemsCalories(simpleEntries[0]),155);
assert.equal(JSON.stringify(simple.context.todayMeals().m2),existing);
simple.context.saveAiMeal('2026-08-25','quick');
assert.equal(Object.values(simple.context.todayMeals()).filter(entry=>entry.extra&&entry.name==='Eggs').length,1);
await simple.context.saveAllChanges();
assert.equal(Object.values(serverState.meals['2026-08-25']).some(entry=>entry.extra&&entry.name==='Eggs'),true);
console.log('Simple meal entry: clean home, new meal save, no duplicate save, existing meals preserved: OK');

const revised=createDevice();await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(TRAINING_PLAN[3].items.slice(0,3))',revised.context)),['Cable crunch : 5x10 at 40kg','Crunch : 25x7 at 20kg','Plank : 1m20']);
assert.equal(revised.context.exerciseVideoId('EZ bar curl'),'njzRGdW0PGk');
vm.runInContext("cloudState.training['2026-08-19']={done:{0:true,13:true},notes:{0:'Bench note',13:'Cable note'}}",revised.context);
assert.equal(revised.context.training()['2026-08-19'].notes[3],'Bench note');
assert.equal(revised.context.training()['2026-08-19'].notes[0],'Cable note');
assert.equal(revised.context.training()['2026-08-19'].notes[0],'Cable note');
assert.equal(revised.context.isFiveK({runDistanceKm:2.51}),false);
assert.equal(revised.context.isFiveK({runDistanceKm:5.02}),true);
assert.equal(revised.context.runPace({runDistanceKm:2.51,runSeconds:945,runDetails:{recordedPace:'6:17'}}),'6:17');
revised.context.switchTab(2);assert.doesNotMatch(revised.element('main').innerHTML,/7-day/);
revised.context.switchTab(3);assert.doesNotMatch(revised.element('main').innerHTML,/7-day/);
console.log('Wednesday remapping, video, mixed-distance runs and removed averages: OK');

const concurrentA=createDevice(),concurrentB=createDevice();
await new Promise(resolve=>setImmediate(resolve));
concurrentA.context.selectTrainingDate('2026-08-24');
concurrentB.context.selectTrainingDate('2026-08-24');
concurrentA.context.setExerciseComment(1,'Device A note');
concurrentB.context.setExerciseComment(2,'Device B note');
assert.equal(await concurrentA.context.saveAllChanges(),true);
assert.equal(await concurrentB.context.saveAllChanges(),true);
assert.equal(serverState.training['2026-08-24'].notes[1],'Device A note');
assert.equal(serverState.training['2026-08-24'].notes[2],'Device B note');
await concurrentA.context.syncNow();
concurrentA.context.setExerciseComment(1,'New A note');
concurrentB.context.setExerciseComment(1,'Conflicting B note');
assert.equal(await concurrentA.context.saveAllChanges(),true);
assert.equal(await concurrentB.context.saveAllChanges(),false);
assert.equal(serverState.training['2026-08-24'].notes[1],'New A note');
assert.equal(concurrentB.context.training()['2026-08-24'].notes[1],'Conflicting B note');
assert.ok(Object.keys(JSON.parse(concurrentB.values.get('nut_90_97_pending_sync'))).length);
const offlineReload=createDevice({storedValues:[...concurrentA.values],startOffline:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(offlineReload.context.training()['2026-08-24'].notes[1],'New A note');
assert.equal(offlineReload.context.todayMeals().m2.items[0].qty,150);
offlineReload.context.setTrainingComment('Offline cache change');
assert.notEqual(vm.runInContext("confirmedState.training[today()]?.comment",offlineReload.context),'Offline cache change','Editing the cache cannot mutate the confirmed baseline');
assert.equal(concurrentA.context.exerciseId('Bench press close grip : 3x4 at 100kg'),concurrentA.context.exerciseId('Bench press close grip : 4x4 at 110kg'));
const earlier={strength:{'Bench press close grip : 3x4 at 100kg':{sets:3,reps:4,kg:100}}};
assert.equal(concurrentA.context.matchingStrength(earlier,'Bench press close grip : 4x4 at 110kg').value.kg,100);
assert.ok(concurrentA.context.sessionPlan('2026-08-19',earlier).items.includes('Bench press close grip : 3x4 at 100kg'));
concurrentA.context.setHistoryFilter('runs');
assert.doesNotMatch(concurrentA.element('main').innerHTML,/Device A note|New A note/);
concurrentA.context.setHistoryFilter('strength');
assert.match(concurrentA.element('main').innerHTML,/New A note/);
assert.doesNotMatch(concurrentA.element('main').innerHTML,/km Run ·/);
const corruptCache=createDevice({storedValues:[['nut_90_97_confirmed','{broken']]});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(corruptCache.context.todayMeals().m2.items[0].qty,150);
const deletedParent=createDevice();await new Promise(resolve=>setImmediate(resolve));
deletedParent.context.selectTrainingDate('2026-08-24');
delete serverState.training['2026-08-24'];
deletedParent.context.setExerciseComment(4,'Stale addition');
assert.equal(await deletedParent.context.saveAllChanges(),false);
assert.equal(serverState.training['2026-08-24'],undefined,'A stale edit cannot recreate a session deleted elsewhere');
console.log('Concurrent edits, conflict preservation, offline reload, stable strength lookup and history filters: OK');
