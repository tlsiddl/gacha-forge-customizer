#!/usr/bin/env python3
"""Offline catalog regression test. Never touches real runs or inventory."""
import argparse, pathlib, shutil, subprocess, sys
p=argparse.ArgumentParser()
p.add_argument("patched")
p.add_argument("--container",default="marinara-engine-marinara-1")
a=p.parse_args()
source=pathlib.Path(a.patched).read_text()
start=source.index('s.post("/gf-customizer/exchange/catalog"')
end=source.index('s.post("/shop/buy",async p=>',start)
handler=source[start:end].rstrip(",")
script=r'''const assert=require("node:assert/strict");
const handlers={};
const s={post:(path,fn)=>{handlers[path]=fn}};
const l=x=>String(x||"").trim(),n={id:"pkg"},kt="unit",Sn=6,Xe={glimmer:0};
const At=x=>x,sn=()=>null;
const process={env:{GF_CUSTOMIZER_SECRET:"q".repeat(32)}};
const docs=[
 {id:"r1:unit:a",data:{kind:"character",rarity:4,name:"A"}},
 {id:"r1:unit:b",data:{kind:"character",rarity:5,name:"B"}},
 {id:"r1:unit:w",data:{kind:"weapon",rarity:5,name:"W"}},
 {id:"r2:unit:c",data:{kind:"character",rarity:5,name:"Other"}}
];
let reads=0;
const a={list:async()=>{reads++;return docs}};
const be=async()=>({data:{runs:[{runId:"r1"}]}});
const Ae=(_,id)=>id==="r1";
const pe=async()=>({data:{
 wallet:{glimmer:750},
 roster:{"r1:unit:a":{facet:6}},
 gfCustomizer:{exchangeCounts:{"r1:unit:a":2,"r1:unit:b":1}}
}});
''' +handler+r''';
(async()=>{
 const fn=handlers["/gf-customizer/exchange/catalog"];
 assert.equal(typeof fn,"function");
 assert.equal((await fn({body:{runId:"r1"}})).error,"unauthorized");
 assert.equal(reads,0);
 assert.equal((await fn({body:{runId:"r2",secret:process.env.GF_CUSTOMIZER_SECRET}})).error,"bad-request");
 assert.equal(reads,0);
 const out=await fn({body:{runId:"r1",secret:process.env.GF_CUSTOMIZER_SECRET}});
 assert.equal(out.ok,true);
 assert.equal(out.readOnly,true);
 assert.equal(out.glimmer,750);
 assert.equal(out.characters.length,2);
 const first=out.characters.find(x=>x.name==="A");
 const second=out.characters.find(x=>x.name==="B");
 assert.equal(first.maxed,true);
 assert.equal(first.price,140);
 assert.equal(first.facet,6);
 assert.equal(second.maxed,false);
 assert.equal(second.price,320);
 assert.equal(second.owned,false);
 assert.ok(out.characters.every(x=>x.id.startsWith("r1:unit:")));
 console.log("PASS catalog mock: admin key, run filtering, actual roster IDs, prices and facet");
})().catch(error=>{console.error(error);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("Docker not found")
r=subprocess.run(["docker","exec","-i",a.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
