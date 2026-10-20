#!/usr/bin/env python3
"""Test the real extracted exchange handler against a revision-CAS mock storage."""
from pathlib import Path
import argparse, subprocess, shutil, sys
p=argparse.ArgumentParser()
p.add_argument("patched")
p.add_argument("--container",default="marinara-engine-marinara-1")
args=p.parse_args()
src=Path(args.patched).read_text()
start=src.index('s.post("/gf-customizer/exchange"')
end=src.index('s.post("/shop/buy",async p=>',start)
handler=src[start:end].rstrip(",")
script=r'''const assert=require("node:assert/strict");
const handlers={},s={post:(path,fn)=>handlers[path]=fn};
const process={env:{GF_CUSTOMIZER_SECRET:"local-test-secret-123456789012345"}};
const l=x=>String(x||"").trim(),Xe={glimmer:0},At=x=>x,at=x=>x,Sn=6,aa=(n,d)=>Number(n)||d;
function vf(e){const t=Math.max(0,Math.min(Sn,Math.floor(aa(e,0))));return{facet:Math.min(Sn,t+1),gained:t<Sn,max:Sn}}
const be=async()=>({data:{}}),Ae=(_,id)=>id==="valid";
const Gn=async id=>({c4:{kind:"character",rarity:4}}[id]||null);
let state={wallet:{glimmer:500},roster:{}},revision=0;
let waiting=[],releases=[];
const pe=async()=>{const snapshot={doc:{revision},data:structuredClone(state)};
 if(waiting.length<2){await new Promise(resolve=>{waiting.push(resolve)})}
 return snapshot;
};
const Pe=async(_,doc,next)=>{
 if(doc.revision!==revision)return false;
 state=structuredClone(next);revision++;return true;
};
''' +handler+r''';
(async()=>{
const buy=(rid)=>handlers["/gf-customizer/exchange"]({body:{runId:"valid",characterId:"c4",requestId:rid,secret:process.env.GF_CUSTOMIZER_SECRET}});
const p1=buy("test_request_00000000001");
const p2=buy("test_request_00000000002");
await new Promise(resolve=>setImmediate(resolve));
assert.equal(waiting.length,2,"Both requests must reach the same revision before commit");
for(const release of waiting)release();
const [a,b]=await Promise.all([p1,p2]);
assert.equal(Number(a.ok)+Number(b.ok),1);
assert.equal([a.error,b.error].filter(x=>x==="write-conflict").length,1);
assert.equal(state.wallet.glimmer,400);
assert.equal(state.gfCustomizer.exchangeCounts.c4,1);
assert.equal(revision,1);
const success=a.ok?a:b;
const succeededRequest=a.ok?"test_request_00000000001":"test_request_00000000002";
const replay=await buy(succeededRequest);
assert.equal(replay.replayed,true);
assert.equal(state.wallet.glimmer,400);
assert.equal(revision,1);
console.log("PASS mock CAS concurrency: one of two competing requests commits, other conflicts; replay no extra charge");
})().catch(err=>{console.error(err);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("Docker CLI unavailable")
r=subprocess.run(["docker","exec","-i",args.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
