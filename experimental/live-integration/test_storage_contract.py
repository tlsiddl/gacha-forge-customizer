#!/usr/bin/env python3
"""Offline revision-write contract regression for actual Gacha Forge Pe()."""
import argparse, subprocess, shutil, pathlib, sys
arg=argparse.ArgumentParser()
arg.add_argument("source")
arg.add_argument("--container",default="marinara-engine-marinara-1")
args=arg.parse_args()
source=pathlib.Path(args.source).read_text()
start=source.index("async function Pe(s,c,d){")
end=source.index("async function qr(",start)
fn=source[start:end]
script=r'''const assert=require("node:assert/strict");
const n={id:"pkg"},Iy="session",h=id=>"save:"+id;
let revision=1,stored={wallet:{glimmer:500}},updates=0,creates=0,received=[];
const a={
 update:async arg=>{
   updates++;received.push({id:arg.id,revision:arg.expectedRevision});
   if(arg.expectedRevision!==revision)return null;
   revision++;stored=structuredClone(arg.data);return{revision,data:stored}
 },
 create:async arg=>{creates++;return {revision:1,data:arg.data}}
};
''' + fn + r''';
(async()=>{
 const old={revision:1};
 const first=await Pe("run",old,{wallet:{glimmer:400}});
 assert.ok(first);assert.equal(stored.wallet.glimmer,400);
 const second=await Pe("run",old,{wallet:{glimmer:300}});
 assert.equal(second,null);
 assert.equal(stored.wallet.glimmer,400);
 assert.deepEqual(received,[{id:"save:run",revision:1},{id:"save:run",revision:1}]);
 assert.equal(updates,2);assert.equal(creates,0);
 console.log("PASS original Pe expectedRevision contract and mocked stale-write rejection");
})().catch(e=>{console.error(e);globalThis.process.exitCode=1});
''';
if not shutil.which("docker"):sys.exit("Docker unavailable")
proc=subprocess.run(["docker","exec","-i",args.container,"node","-"],input=script,text=True,capture_output=True)
if proc.stdout:print(proc.stdout,end="")
if proc.stderr:print(proc.stderr,end="",file=sys.stderr)
sys.exit(proc.returncode)
