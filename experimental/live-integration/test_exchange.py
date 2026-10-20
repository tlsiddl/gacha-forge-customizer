#!/usr/bin/env python3
"""Execute source-extracted Glimmer exchange handler with mocked single-doc storage."""
import argparse, pathlib, subprocess, shutil, sys
p=argparse.ArgumentParser();p.add_argument("patched");p.add_argument("--container",default="marinara-engine-marinara-1");a=p.parse_args()
source=pathlib.Path(a.patched).read_text()
start=source.index('s.post("/gf-customizer/exchange"')
end=source.index('s.post("/shop/buy",async p=>',start)
route=source[start:end].rstrip(",")
assert route.count("await Pe(o,doc,next)")==1
script=r'''const assert=require("node:assert/strict");
const s={post:(route,fn)=>{handlers[route]=fn}},handlers={};
const process={env:{GF_CUSTOMIZER_SECRET:"local-test-secret-123456789012345"}};
const l=x=>String(x||"").trim(),Xe={glimmer:0,aether:0};
const At=x=>x,at=x=>x,Sn=6,aa=(n,d)=>Number(n)||d;
function vf(e){let t=Math.max(0,Math.min(Sn,Math.floor(aa(e,0))));return{facet:Math.min(Sn,t+1),gained:t<Sn,max:Sn}}
let state={wallet:{glimmer:750},roster:{}},saveSuccess=true,saveCount=0;
const be=async()=>({data:{}}),Ae=(_,id)=>id==="valid";
const Gn=async id=>({"c4":{kind:"character",rarity:4},"c5":{kind:"character",rarity:5},"weapon":{kind:"weapon",rarity:5},"c3":{kind:"character",rarity:3}}[id]||null);
const pe=async()=>({doc:{revision:1},data:state});
const Pe=async(_,doc,next)=>{saveCount++;if(!saveSuccess)return false;state=next;return true};
''' + route + r''';
(async()=>{
 const fn=handlers["/gf-customizer/exchange"];
 let sequence=0;
 const buy=(runId,characterId,requestId)=>fn({body:{runId,characterId,secret:process.env.GF_CUSTOMIZER_SECRET,requestId:requestId||"request_"+String(++sequence).padStart(18,"0")}});
 assert.equal((await fn({body:{runId:"valid",characterId:"c4",requestId:"request_000000000000000001"}})).error,"unauthorized");
 assert.equal((await buy("other","c4")).error,"bad-request");
 assert.equal((await buy("valid","weapon")).error,"not-for-sale");
 assert.equal((await buy("valid","c3")).error,"not-for-sale");
 assert.equal((await buy("valid","c4")).price,100);
 assert.equal(state.wallet.glimmer,650);
 const replaySnapshot=structuredClone(state);const replay=await buy("valid","c4","request_000000000000000004");
 // Next assertions separately exercise replay with a known successful identifier.
 assert.equal(replay.replayed,true);assert.deepEqual(state,replaySnapshot);
 assert.deepEqual(state.roster.c4,{level:1,bondFights:0});
 assert.equal(state.gfCustomizer.exchangeCounts.c4,1);
 let second=await buy("valid","c4");
 assert.equal(second.price,120);assert.equal(second.exchangeCount,2);
 assert.equal(second.facet.facet,1);
 assert.equal(state.wallet.glimmer,530);
 state.wallet.glimmer=299;
 const insufficientSnapshot=structuredClone(state);
 assert.equal((await buy("valid","c5")).error,"insufficient-glimmer");
 assert.deepEqual(state,insufficientSnapshot);
 assert.equal(state.gfCustomizer.exchangeCounts.c5,undefined);
 state.wallet.glimmer=750;
 saveSuccess=false;const snapshot=structuredClone(state);
 assert.equal((await buy("valid","c5")).error,"write-conflict");
 assert.deepEqual(state,snapshot);
 saveSuccess=true;
 let five=await buy("valid","c5");
 assert.equal(five.isNew,true);assert.equal(five.price,300);
 assert.equal(state.wallet.glimmer,450);assert.equal(state.gfCustomizer.exchangeCounts.c5,1);
 assert.equal(state.gfCustomizer.exchangeCounts.c4,2);
 state.roster.c4.facet=Sn;
 const maxSnapshot=structuredClone(state);
 assert.equal((await buy("valid","c4")).error,"max-facet");
 assert.deepEqual(state,maxSnapshot);
 state.roster.c5.facet=Sn-1;
 const last=await buy("valid","c5");
 assert.equal(last.price,320);assert.equal(last.facet.facet,Sn);
 assert.equal(state.wallet.glimmer,130);
 assert.equal((await buy("valid","c5")).error,"max-facet");
 assert.equal(state.gfCustomizer.exchangeCounts.c5,2);
 console.log("PASS exchange: rarity guard, per-character +20 prices, max facet block, funds and rollback");
})().catch(e=>{console.error(e);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("ERROR: docker missing")
r=subprocess.run(["docker","exec","-i",a.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
