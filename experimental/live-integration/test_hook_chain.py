#!/usr/bin/env python3
"""Read-only live hook-chain inspection in a separate Node process.
Loads (but never evaluates) the existing Gacha Forge ESM module.
The final hook substitutes an inert stub after inspecting transformed source.
"""
import argparse,json,pathlib,subprocess,sys
p=argparse.ArgumentParser()
p.add_argument("--container",default="marinara-engine-marinara-1")
args=p.parse_args()
here=pathlib.Path(__file__).resolve().parent
loader=(here/"gf-customizer-runtime.cjs").read_text()
recipe=json.loads((here/"gf-customizer-edits.json").read_text())
original=(here/"server-original.mjs").read_text()
script=r'''import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const Module=require('node:module');
const assert=require('node:assert/strict');
process.env.GF_CUSTOMIZER_HOOK_TEST='1';
const m=new Module('/tmp/gf-customizer-runtime.cjs',module);
m.filename='/tmp/gf-customizer-runtime.cjs';
m._compile(__LOADER__,m.filename);
const recipe=__RECIPE__;
const baseline=__ORIGINAL__;
const path='/app/data/capability-runtime-snapshots/gacha-forge-1.8.12-7d3883c2-c1f5-4f22-a362-2b1d04e868ae/server.mjs';
const target=pathToFileURL(path).href;
let intercepted=false;
registerHooks({load(url,ctx,nextLoad){
  if(url!==target)return nextLoad(url,ctx);
  const result=nextLoad(url,ctx);
  const source=result.source==null?readFileSync(path,'utf8'):Buffer.isBuffer(result.source)?result.source.toString('utf8'):String(result.source);
  assert.notEqual(source.length,0);
  assert.equal(m.exports.applyEdits(baseline,recipe).ok,true,'baseline recipe must work');
  const applied=m.exports.applyEdits(source,recipe);
  assert.equal(applied.ok,true,'upstream composition signature mismatch at edit #'+applied.index);
  assert.ok(applied.source.includes('function gfPity('));
  assert.ok(applied.source.includes('/gf-customizer/settings'));
  assert.ok(applied.source.length>source.length);
  const koTag=source.includes('gacha-ko-bg-and-speaker-runtime-v2');
  console.log('PASS combined real upstream hook source + customizer edits (ESM not evaluated)');
  console.log('Upstream bytes:',source.length,'combined bytes:',applied.source.length,'KO tag in server:',koTag);
  intercepted=true;
  return {...result,format:'module',source:'export const isolatedHookCheck = true;',shortCircuit:true};
}});
await import(target);
assert.equal(intercepted,true,'target hook not triggered');
''' 
script=script.replace("__LOADER__",json.dumps(loader,ensure_ascii=True)).replace("__RECIPE__",json.dumps(recipe,ensure_ascii=True)).replace("__ORIGINAL__",json.dumps(original,ensure_ascii=True))
# module is not defined in ES module; create CommonJS module with null parent instead.
script=script.replace("new Module('/tmp/gf-customizer-runtime.cjs',module)","new Module('/tmp/gf-customizer-runtime.cjs')")
result=subprocess.run(["sudo","docker","exec","-i",args.container,"node","--input-type=module","-"],input=script,text=True,capture_output=True)
if result.stdout:print(result.stdout,end="")
if result.stderr:print(result.stderr,end="",file=sys.stderr)
sys.exit(result.returncode)
