'use strict';
// Runs solely against an offline edit recipe and in-memory mocks; never calls the live server.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const recipe=JSON.parse(fs.readFileSync(process.argv[2]||'gf-customizer-edits.exchange.json','utf8'));
const edit=recipe.edits.find(e=>e.new.includes('s.post("/gf-customizer/exchange",'));
assert(edit,'exchange edit missing');
const begin=edit.new.indexOf('s.post("/gf-customizer/exchange",');
const end=edit.new.indexOf(',s.post("/shop/buy",',begin);
assert(begin>=0&&end>begin,'exchange route boundaries not found');
const route=edit.new.slice(begin,end);
let handler;
let saved,revision,saveCalls,allowSave,card,accessAllowed;
const secret='isolated-test-secret-123456789';
const runId='run-isolated',characterId=runId+':unit:c1';
const env={GF_CUSTOMIZER_ENABLE_EXCHANGE:'1',GF_CUSTOMIZER_SECRET:secret};
const context={
 s:{post(name,fn){assert.equal(name,'/gf-customizer/exchange');handler=fn;}},
 process:{env},
 l:x=>typeof x==='string'?x:'',
 be:async()=>({data:{}}),Ae:()=>accessAllowed,
 Gn:async()=>card,
 pe:async()=>({doc:{revision},data:structuredClone(saved)}),
 Pe:async(run,doc,next)=>{saveCalls++;if(!allowSave||doc.revision!==revision)return false;saved=structuredClone(next);revision++;return true;},
 At:w=>w, Xe:{glimmer:0}, Sn:5,
 vf:f=>({facet:Number(f||0)+1,gained:Number(f||0)<5}),
 at:w=>w,
 structuredClone
};
vm.runInNewContext(route,context);
assert.equal(typeof handler,'function','route not registered');
function reset({balance=500,facet=null,enabled=true,authorized=true,rarity=4}={}){
 saved={wallet:{glimmer:balance},roster:{}};if(facet!==null)saved.roster[characterId]={level:1,facet};
 revision=0;saveCalls=0;allowSave=true;accessAllowed=authorized;
 card={id:characterId,kind:'character',rarity,isProtagonist:false};
 env.GF_CUSTOMIZER_ENABLE_EXCHANGE=enabled?'1':'0';
}
async function buy(requestId='req-000000000000001',overrides={}){
 return handler({body:{runId,characterId,requestId,secret,...overrides}});
}
async function main(){
 reset();
 const first=await buy();
 assert.equal(first.ok,true);assert.equal(first.price,100);assert.equal(saved.wallet.glimmer,400);assert(saved.roster[characterId]);assert.equal(saved.gfCustomizer.exchangeCounts[characterId],1);assert.equal(saveCalls,1);
 console.log('PASS: purchase debits wallet and grants character once');
 const replay=await buy();assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal(saveCalls,1);assert.equal(saved.wallet.glimmer,400);
 console.log('PASS: same request ID is idempotent');
 reset({balance:99});let r=await buy();assert.equal(r.error,'insufficient-glimmer');assert.equal(saveCalls,0);console.log('PASS: insufficient balance rejects');
 reset({facet:5});r=await buy();assert.equal(r.error,'max-facet');assert.equal(saveCalls,0);console.log('PASS: max facet rejects');
 reset();allowSave=false;r=await buy();assert.equal(r.error,'write-conflict');assert.equal(saved.wallet.glimmer,500);assert.equal(saved.roster[characterId],undefined);console.log('PASS: storage conflict rolls back');
 reset();r=await buy('req-000000000000002',{characterId:'run-other:unit:c1'});assert.equal(r.error,'cross-run-character');assert.equal(saveCalls,0);console.log('PASS: cross-run character rejects');
 reset({enabled:false});r=await buy();assert.equal(r.error,'exchange-disabled');assert.equal(saveCalls,0);console.log('PASS: feature flag disabled rejects');
 reset({authorized:false});r=await buy();assert.equal(r.ok,false);assert.equal(saveCalls,0);console.log('PASS: invalid registry access rejects');
 reset();r=await buy('req-000000000000003',{secret:'invalid'});assert.equal(r.error,'unauthorized');assert.equal(saveCalls,0);console.log('PASS: invalid secret rejects');
 reset();r=await buy();assert.equal(r.ok,true);r=await buy('req-000000000000001',{characterId:runId+':unit:c2'});assert.equal(r.error,'request-id-reused');console.log('PASS: request ID reuse with different character rejects');
 console.log('=== 10 offline purchase tests PASS; live game unchanged ===');
}
main().catch(e=>{console.error('FAIL:',e.stack||e);process.exitCode=1;});
