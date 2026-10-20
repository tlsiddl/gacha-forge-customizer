#!/usr/bin/env python3
"""Isolated HTTP contract test using source-extracted settings handlers.
No production server port, data volume, or operational API is accessed.
"""
import argparse, subprocess, pathlib, shutil, sys
p=argparse.ArgumentParser()
p.add_argument("source",help="Locally generated patched server-test.mjs")
p.add_argument("--container",default="marinara-engine-marinara-1")
a=p.parse_args()
if not shutil.which("docker"): sys.exit("Docker not found")
source=pathlib.Path(a.source).read_text()
def extract(start,end):
    i=source.index(start); j=source.index(end,i)
    return source[i:j]
normal=extract("function gfNormalize(", "let GF_SETTINGS=")
save=extract("function gfSave(", "var rb=[")
routes=extract('s.get("/gf-customizer/settings"', 's.get("/ping",async()=>').rstrip(",")
script=r"""
const assert=require("node:assert/strict");
const http=require("node:http");
const GF_DEFAULT=Object.freeze({bannerDays:14,characterPity:80,weaponPity:80,featuredGuarantee:false,fullFacetGlimmer4:0,fullFacetGlimmer5:0});
let GF_SETTINGS={...GF_DEFAULT};
const process=globalThis.process;
process.env.GF_CUSTOMIZER_SECRET="test-only-secret-32-chars-long-0000";
const GF_FILE="/not-used/settings.json",gfDirname=()=>"/not-used";
let stored=null;
const gfMkdir=()=>{},gfWriteFile=(path,data)=>{stored=JSON.parse(data)},gfRenameFile=()=>{};
const registry={GET:new Map(),POST:new Map()};
const s={get:(p,h)=>registry.GET.set(p,h),post:(p,h)=>registry.POST.set(p,h)};
""" + normal + save + routes + r""";
const server=http.createServer(async(req,res)=>{
  if(req.url!=="/gf-customizer/settings"){res.writeHead(404);res.end();return}
  const fn=registry[req.method]?.get(req.url);
  if(!fn){res.writeHead(405);res.end();return}
  let body={};
  if(req.method==="POST"){
    let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>8192){res.writeHead(413);res.end();return}}
    try{body=JSON.parse(raw)}catch{res.writeHead(400);res.end();return}
  }
  const result=await fn({body});
  res.writeHead(result.ok?200:result.error==="unauthorized"?401:400,{"content-type":"application/json"});
  res.end(JSON.stringify(result));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
   const base="http://127.0.0.1:"+server.address().port+"/gf-customizer/settings";
   async function req(method,body){
     const r=await fetch(base,{method,headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
     return {status:r.status,data:await r.json()};
   }
   assert.equal((await req("GET")).data.settings.characterPity,80);
   const invalid=await req("POST",{settings:{...GF_DEFAULT,characterPity:40}});
   assert.equal(invalid.status,401);
   assert.equal(GF_SETTINGS.characterPity,80);
   const next={...GF_DEFAULT,characterPity:40,bannerDays:7};
   const good=await req("POST",{secret:process.env.GF_CUSTOMIZER_SECRET,settings:next});
   assert.equal(good.status,200);
   assert.equal(stored.bannerDays,7);
   assert.equal((await req("GET")).data.settings.characterPity,40);
   const bad=await req("POST",{secret:process.env.GF_CUSTOMIZER_SECRET,settings:{...next,bannerDays:0}});
   assert.equal(bad.status,400);
   assert.equal(GF_SETTINGS.bannerDays,7);
   console.log("PASS isolated HTTP GET/POST/auth/invalid settings on 127.0.0.1 ephemeral port");
 }finally{await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
"""
r=subprocess.run(["docker","exec","-i",a.container,"node","-"],input=script,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
sys.exit(r.returncode)
