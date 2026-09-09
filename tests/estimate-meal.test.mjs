import assert from 'node:assert/strict';
import handler,{validateEstimate} from '../api/estimate-meal.js';
const oldFetch=globalThis.fetch;
let calls=0;
const estimate={items:[{name:'Cooked rice',grams:200,kcalPer100g:130}],assumptions:'Cooked weight supplied.',question:''};
globalThis.fetch=async (url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(estimate)}]}]})}};
async function request(method='POST',body={description:'200g cooked rice'}){
 let status,data;await handler({method,body,headers:{}},{setHeader(){},status(value){status=value;return this},json(value){data=value}});return {status,data};
}
delete process.env.OPENAI_API_KEY;assert.equal((await request()).status,503);
process.env.OPENAI_API_KEY='test-key';delete process.env.AI_ACCESS_CODE;
assert.equal((await request('GET')).status,405);
assert.equal((await request('POST',{})).status,400);
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
console.log('AI meal API: configuration, code-free access, validation, structured output and failures OK');

const {validPhoto}=await import('../api/estimate-meal.js');
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
assert.equal(validPhoto(photo),true);
assert.equal(validPhoto('https://example.com/photo.jpg'),false);
assert.equal(validPhoto('data:image/jpeg;base64,'+Buffer.from('not a photograph').toString('base64')),false);
assert.equal(validPhoto('data:image/png;base64,'+'A'.repeat(2800000)),false);
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 assert.equal(body.input[0].content[1].type,'input_image');
 assert.equal(body.input[0].content[1].image_url,photo);
 assert.equal(body.input[0].content[1].detail,'high');
 return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(estimate)}]}]})};
};
assert.equal((await request('POST',{description:'',image:photo})).status,200);
assert.equal((await request('POST',{description:'A meal',image:'data:image/svg+xml;base64,AAAA'})).status,400);
globalThis.fetch=oldFetch;
console.log('Photo input: validation, size limits and multimodal request OK');
