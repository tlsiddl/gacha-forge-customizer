"""Local-only regression test for supplied 1.8.12 server source. No server changes."""
from pathlib import Path
import subprocess, tempfile, argparse
parser=argparse.ArgumentParser()
parser.add_argument("source",help="Local copy of server.mjs")
args=parser.parse_args()
src=Path(args.source); root=Path(__file__).parent
with tempfile.TemporaryDirectory() as temp:
    target=Path(temp)/"server.mjs"
    subprocess.run(["python3",str(root/"patch.py"),str(src),str(target)],check=True)
    subprocess.run(["node","--check",str(target)],check=True)
    original=src.read_text(); patched=target.read_text()
    start=patched.index("function gfPity("); end=patched.index("function gfPick(",start)
    s=original.index("function MA("); e=original.index("function RA(",s)
    testjs='''const assert=require("node:assert/strict");
let yi=80,Ko=74,xA=10,GF_SETTINGS={characterPity:80,weaponPity:80};
'''+original[s:e]+patched[start:end]+'''
for(const kind of ["char","wpn"])for(const count of [0,70,73,74,79])for(const rand of [0,.009,.1,.6,.99]){
 const old=Math.random;Math.random=()=>rand;
 try{const a={count,since4:5},b={...a};const r5=kind==="wpn"?.007:.006,r4=kind==="wpn"?.06:.051;
 assert.equal(gfPity(a,r5,r4,kind),MA(b,r5,r4));assert.deepEqual(a,b)
 }finally{Math.random=old}
}
GF_SETTINGS.characterPity=40;
const old=Math.random;Math.random=()=>.999999;
try{assert.equal(gfPity({count:39,since4:0},.006,.051,"char"),5)}finally{Math.random=old}
console.log("PASS native default equivalence and custom hard pity");
'''
    test=Path(temp)/"test.cjs";test.write_text(testjs)
    subprocess.run(["node",str(test)],check=True)
    twice=subprocess.run(["python3",str(root/"patch.py"),str(target),str(Path(temp)/"again.mjs")],capture_output=True)
    assert twice.returncode!=0,"Patch must reject double application"
    assert src.read_text()==original,"Original must remain untouched"
    print("PASS syntax, exact-match guard, source preservation")
