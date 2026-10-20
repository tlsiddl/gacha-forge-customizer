#!/usr/bin/env python3
"""Mock only storage boundaries of actual patched hl() for calendar adoption/expiry."""
import argparse, shutil, subprocess, sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument("patched");p.add_argument("--container",default="marinara-engine-marinara-1");a=p.parse_args()
source=Path(a.patched).read_text()
start=source.index("function ht(");end=source.index("function Fc(",start)
core=source[start:end]
begin=source.index("async function hl(");stop=source.index("async function Sh(",begin)
hl=source[begin:stop]
script=r'''const assert=require("node:assert/strict");
const DAY=86400000,Wu=14*DAY,le=(s,id)=>s+":"+id;
const n={id:"mock-package"},r={logger:{info:()=>{}}},GF_SETTINGS={bannerDays:7};
let stored=[],created=[],requested=[],featured=null,calendar=true,generated=[];
const pe=async()=>({doc:{id:"run"},data:{featured}});
const Pe=async(s,doc,data)=>{stored.push(structuredClone(data))};
const NA=()=>({year:2026,week:1}),_A=()=> "2026-F01";
const a={getById:async(_,key)=>{requested.push(key);if(calendar&&/:(char|wpn):2026-F01$/.test(key))return {name:key,description:"calendar",data:{startedAt:10,endsAt:20,fiveId:key}};return null}};
const Mt=async(key,opts)=>{created.push({key,opts});return {data:opts.data}};
const Sh=async(_,__,args)=>{generated.push(args);return {ok:true,...args}};
''' + core + hl + r'''
(async()=>{
 const adopt=await hl("run",{});
 assert.equal(adopt.ok,true);
 assert.equal(created.length,2);
 assert.equal(stored.length,1);
 const featuredClock=stored[0].featured;
 assert.equal(featuredClock.seq,1);
 assert.equal(featuredClock.endsAt-featuredClock.startedAt,7*DAY);
 for(const doc of created){assert.equal(doc.opts.data.startedAt,featuredClock.startedAt);assert.equal(doc.opts.data.endsAt,featuredClock.endsAt)}
 calendar=false;created=[];stored=[];requested=[];
 featured={seq:3,startedAt:Date.now()-20*DAY,endsAt:Date.now()-DAY};
 const expired=await hl("run",{});
 assert.equal(expired.ok,true);
 assert.equal(expired.key,"f4");
 assert.equal(stored.length,1);
 assert.equal(stored[0].featured.seq,4);
 assert.equal(stored[0].featured.endsAt-stored[0].featured.startedAt,7*DAY);
 assert.equal(generated[0].endsAt,stored[0].featured.endsAt);
 console.log("PASS mocked real hl() persistence: calendar adoption timestamps and expired banner round");
})().catch(e=>{console.error(e);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("ERROR: docker missing")
result=subprocess.run(["docker","exec","-i",a.container,"node","-"],input=script,text=True,capture_output=True)
if result.stdout:print(result.stdout,end="")
if result.stderr:print(result.stderr,end="",file=sys.stderr)
sys.exit(result.returncode)
