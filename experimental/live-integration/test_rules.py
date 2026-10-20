"""Local-only regression test for supplied 1.8.12 server source. No server changes."""
from pathlib import Path
import subprocess, tempfile, argparse, shutil
parser=argparse.ArgumentParser()
parser.add_argument("source",help="Local copy of server.mjs")
parser.add_argument("--container",default="marinara-engine-marinara-1",help="Running Marinara container providing Node.js")
args=parser.parse_args()
if not shutil.which("docker"):
    raise SystemExit("ERROR: Docker CLI not found")
def node_check(code, check_only=False):
    cmd=["docker","exec","-i",args.container,"node"]
    if check_only: cmd+=["--input-type=module","--check","-"]
    result=subprocess.run(cmd,input=code,text=True,capture_output=True)
    if result.stdout: print(result.stdout,end="")
    if result.stderr: print(result.stderr,end="",file=__import__("sys").stderr)
    if result.returncode!=0: raise SystemExit(f"ERROR: Docker Node.js test failed ({result.returncode})")
src=Path(args.source); root=Path(__file__).parent
with tempfile.TemporaryDirectory() as temp:
    target=Path(temp)/"server.mjs"
    subprocess.run(["python3",str(root/"patch.py"),str(src),str(target)],check=True)
    node_check(target.read_text(),check_only=True)
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
    node_check(test.read_text())
    # Extract the exact injected validation/save code, then mock filesystem operations.
    nstart=patched.index("function gfNormalize(")
    nend=patched.index("let GF_SETTINGS=",nstart)
    save_start=patched.index("function gfSave(")
    save_end=patched.index("var rb=[",save_start)
    normalize_fn=patched[nstart:nend]
    save_fn=patched[save_start:save_end]
    api_test = r'''const assert=require("node:assert/strict");
const GF_DEFAULT=Object.freeze({bannerDays:14,characterPity:80,weaponPity:80,featuredGuarantee:false,fullFacetGlimmer4:0,fullFacetGlimmer5:0});
let GF_SETTINGS={...GF_DEFAULT},writes=[],failWrite=false;
const GF_FILE="/mock/settings.json",gfDirname=()=>"/mock",gfMkdir=()=>{};
const gfWriteFile=(name,data,opts)=>{if(failWrite)throw Error("disk full");writes.push({name,data,opts})};
const gfRenameFile=(a,b)=>{writes.push({rename:[a,b]})};
const process={pid:100};
'''+normalize_fn+save_fn+r'''
for (const [key,value] of [["bannerDays",0],["bannerDays",31],["characterPity",101],["weaponPity",1.5],["featuredGuarantee","yes"],["fullFacetGlimmer5",-1]]){
 assert.throws(()=>gfNormalize({...GF_DEFAULT,[key]:value}),/invalid/);
}
assert.deepEqual(gfNormalize({}),GF_DEFAULT);
const updated=gfSave({...GF_DEFAULT,characterPity:40,featuredGuarantee:true});
assert.equal(GF_SETTINGS.characterPity,40);
assert.equal(writes[0].opts.mode,0o600);
assert.deepEqual(JSON.parse(writes[0].data),updated);
const previous={...GF_SETTINGS};failWrite=true;
assert.throws(()=>gfSave({...updated,characterPity:50}),/disk full/);
assert.deepEqual(GF_SETTINGS,previous);
console.log("PASS settings validation, save permissions, mocked persistence failure");
'''
    api=Path(temp)/"api-test.cjs";api.write_text(api_test)
    node_check(api.read_text())
    # Mock the precise injected router handlers without HTTP or server writes.
    route_start=patched.index('s.get("/gf-customizer/settings"')
    route_end=patched.index('s.get("/ping",async()=>',route_start)
    route_code=patched[route_start:route_end].rstrip(",")
    route_test = r'''const assert=require("node:assert/strict");
const GF_DEFAULT={bannerDays:14,characterPity:80,weaponPity:80,featuredGuarantee:false,fullFacetGlimmer4:0,fullFacetGlimmer5:0};
let GF_SETTINGS={...GF_DEFAULT},calls=0;
const process={env:{GF_CUSTOMIZER_SECRET:"a".repeat(32)},pid:100};
const GF_FILE="/mock/settings.json",gfDirname=()=>"/mock",gfMkdir=()=>{},gfWriteFile=()=>{},gfRenameFile=()=>{};
const handlers={GET:{},POST:{}},s={get:(path,fn)=>handlers.GET[path]=fn,post:(path,fn)=>handlers.POST[path]=fn};
'''+normalize_fn+save_fn+route_code+r''';
(async()=>{
 const path="/gf-customizer/settings",get=handlers.GET[path],post=handlers.POST[path];
 assert.equal(typeof get,"function");assert.equal(typeof post,"function");
 assert.equal((await get()).settings.characterPity,80);
 assert.equal((await post({body:{settings:{characterPity:40}}})).error,"unauthorized");
 assert.equal((await post({body:{secret:"bad",settings:{characterPity:40}}})).error,"unauthorized");
 assert.equal(GF_SETTINGS.characterPity,80);
 let valid={...GF_DEFAULT,characterPity:40};
 assert.equal((await post({body:{secret:"a".repeat(32),settings:valid}})).ok,true);
 assert.equal((await get()).settings.characterPity,40);
 assert.equal((await post({body:{secret:"a".repeat(32),settings:{bannerDays:0}}})).error,"invalid-settings");
 assert.equal(GF_SETTINGS.characterPity,40);
 process.env.GF_CUSTOMIZER_SECRET="";
 assert.equal((await post({body:{secret:"a".repeat(32),settings:valid}})).error,"unauthorized");
 console.log("PASS mocked settings API auth, GET, POST, invalid settings");
})().catch(e=>{console.error(e);process.exitCode=1});
'''
    node_check(route_test)
    # Assert exact replacements for banner creation and displayed countdown.
    assert 'days:GF_SETTINGS.bannerDays' in patched
    assert 'endsAt:n+GF_SETTINGS.bannerDays*24*60*60*1e3' in patched
    assert 'days:Math.round(Wu/(1440*60*1e3))' not in patched
    assert 'endsAt:n+Wu' not in patched
    print("PASS banner duration patch sites (static only; no rotation simulation)")
    twice=subprocess.run(["python3",str(root/"patch.py"),str(target),str(Path(temp)/"again.mjs")],capture_output=True)
    assert twice.returncode!=0,"Patch must reject double application"
    assert src.read_text()==original,"Original must remain untouched"
    print("PASS syntax, exact-match guard, source preservation")
