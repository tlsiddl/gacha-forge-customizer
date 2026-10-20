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
 assert.equal((await fn({body:{runId:"other",characterId:"c4"}})).error,"bad-request");
 assert.equal((await fn({body:{runId:"valid",characterId:"weapon"}})).error,"not-for-sale");
 assert.equal((await fn({body:{runId:"valid",characterId:"c3"}})).error,"not-for-sale");
 assert.equal((await fn({body:{runId:"valid",characterId:"c4"}})).isNew,true);
 assert.equal(state.wallet.glimmer,630);
 assert.deepEqual(state.roster.c4,{level:1,bondFights:0});
 assert.equal((await fn({body:{runId:"valid",characterId:"c4"}})).facet.facet,1);
 assert.equal(state.wallet.glimmer,510);
 assert.equal((await fn({body:{runId:"valid",characterId:"c5"}})).error,"insufficient-glimmer");
 assert.equal(state.roster.c5,undefined);
 state.wallet.glimmer=750;
 saveSuccess=false;const snapshot=structuredClone(state);
 assert.equal((await fn({body:{runId:"valid",characterId:"c5"}})).error,"write-conflict");
 assert.deepEqual(state,snapshot);
 saveSuccess=true;
 assert.equal((await fn({body:{runId:"valid",characterId:"c5"}})).isNew,true);
 assert.equal(state.wallet.glimmer,150);
 console.log("PASS exchange: rarity guard, fixed prices, duplicates, funds, single save and conflict rollback");
})().catch(e=>{console.error(e);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("ERROR: docker missing")
r=subprocess.run(["docker","exec","-i",a.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
