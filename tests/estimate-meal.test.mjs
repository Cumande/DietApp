import assert from 'node:assert/strict';
import handler,{validateEstimate} from '../api/estimate-meal.js';
const oldFetch=globalThis.fetch;
let calls=0;
const estimate={items:[{name:'Cooked rice',grams:200,kcalPer100g:130}],assumptions:'Cooked weight supplied.',question:''};
globalThis.fetch=async (url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(estimate)}]}]})}};
async function request(method='POST',body={description:'200g cooked rice'},code='test-access-code-1234'){
 let status,data;await handler({method,body,headers:{'x-ai-access-code':code}},{setHeader(){},status(value){status=value;return this},json(value){data=value}});return {status,data};
}
delete process.env.OPENAI_API_KEY;assert.equal((await request()).status,503);
process.env.OPENAI_API_KEY='test-key';process.env.AI_ACCESS_CODE='test-access-code-1234';
assert.equal((await request('GET')).status,405);
assert.equal((await request('POST',{},'wrong')).status,401);
assert.equal((await request('POST',{description:'x'})).status,400);
assert.equal(calls,0);
assert.deepEqual((await request()).data,estimate);
assert.throws(()=>validateEstimate({...estimate,items:[{name:'x',grams:-1,kcalPer100g:130}]}));
assert.throws(()=>validateEstimate({...estimate,items:[{name:'x',grams:100,kcalPer100g:1001}]}));
assert.deepEqual(validateEstimate({items:[],assumptions:'',question:'How much rice?'}).items,[]);
globalThis.fetch=async()=>({ok:false,status:429});assert.equal((await request()).status,429);
globalThis.fetch=async()=>({ok:true,json:async()=>({status:'incomplete'})});assert.equal((await request()).status,502);
globalThis.fetch=async()=>{throw new Error('secret upstream text')};const failure=await request();assert.equal(failure.status,502);assert.doesNotMatch(JSON.stringify(failure),/secret upstream/);
globalThis.fetch=oldFetch;
console.log('AI meal API: configuration, access, validation, structured output and failures OK');
