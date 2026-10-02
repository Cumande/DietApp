import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';
process.env.SUPABASE_URL='https://example.supabase.co';
const {default:handler,validateChanges}=await import('../api/nutrition-data.js');
const originalFetch=globalThis.fetch;
let calls=[],conflict=false;
globalThis.fetch=async(url,options={})=>{
  calls.push({url,options});
  const json=url.includes('/rpc/')?{data:{weights:{'2026-10-01':92}},updated_at:'v2'}:[{data:{weights:{'2026-10-01':92}},updated_at:'v1'}];
  return {ok:!(conflict&&url.includes('/rpc/')),json:async()=>conflict&&url.includes('/rpc/')?{code:'40001'}:json};
};
async function request(method,body,headers={}){
  const result={headers:{}};
  await handler({method,body,headers},{setHeader(k,v){result.headers[k]=v},status(code){result.status=code;return this},json(data){result.data=data},end(){}});
  return result;
}
assert.equal((await request('GET')).data.weights['2026-10-01'],92,'Existing no-login access remains available');
assert.ok(calls.every(c=>!c.url.includes('/auth/')));
assert.equal((await request('GET',null,{'if-none-match':'"v1"'})).status,304);
const change={path:['weights','2026-10-01'],exists:false,before:null,remove:false,value:92};
assert.equal((await request('POST',{changes:[change]})).status,200);
assert.equal(calls.at(-1).url.endsWith('/rpc/diet_apply_changes'),true);
assert.equal((await request('POST',{mutation:{scope:'weights',key:'date',value:1}})).status,409);
assert.throws(()=>validateChanges([{...change,path:['__proto__','x']}]));
assert.throws(()=>validateChanges([{...change,path:['training','x','constructor']}]));
assert.throws(()=>validateChanges([null]));
assert.throws(()=>validateChanges([{...change,parentDepth:5}]));
conflict=true;
assert.equal((await request('POST',{changes:[change]})).status,409);
assert.equal((await request('DELETE')).status,405);
globalThis.fetch=originalFetch;
console.log('No-login API, cache, patch validation and conflicts: OK');
