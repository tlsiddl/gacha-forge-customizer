#!/usr/bin/env python3
"""Run actual hook transformation logic in an isolated Node process; never import server."""
import argparse, pathlib, json, shutil, subprocess, sys
p=argparse.ArgumentParser()
p.add_argument("--container",default="marinara-engine-marinara-1")
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent
baseline=(root/"server-original.mjs").read_text()
patched=(root/"server-test.mjs").read_text()
recipe=json.loads((root/"gf-customizer-edits.json").read_text())
loader=(root/"gf-customizer-runtime.cjs").read_text()
script='\n'.join([
 'const assert=require("node:assert/strict");',
 'const Module=require("node:module");',
 'process.env.GF_CUSTOMIZER_HOOK_TEST="1";',
 'const m=new Module("/tmp/gf-customizer-runtime.cjs",module);m.filename="/tmp/gf-customizer-runtime.cjs";',
 'm._compile('+json.dumps(loader)+',m.filename);',
 'const original='+json.dumps(baseline)+';',
 'const expected='+json.dumps(patched)+';',
 'const recipe='+json.dumps(recipe)+';',
 'const result=m.exports.applyEdits(original,recipe);',
 'assert.equal(result.ok,true);assert.equal(result.source,expected);',
 'const upstream="// upstream memory patch preserved\\n"+original;',
 'const chained=m.exports.applyEdits(upstream,recipe);',
 'assert.equal(chained.ok,true);assert.equal(chained.source,"// upstream memory patch preserved\\n"+expected);',
 'const bad=original.replace("days:Math.round(Wu/(1440*60*1e3))","days:123");',
 'assert.notEqual(bad,original);',
 'const failed=m.exports.applyEdits(bad,recipe);',
 'assert.equal(failed.ok,false);assert.equal(failed.source,bad);',
 'console.log("PASS runtime loader: exact patched output, upstream preservation, fail-closed mismatch");'
])
if not shutil.which("docker"):sys.exit("Docker not found")
r=subprocess.run(["sudo","docker","exec","-i",a.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
