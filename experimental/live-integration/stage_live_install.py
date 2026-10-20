#!/usr/bin/env python3
"""Stage a reversible overlay for Gacha Forge Customizer. NEVER deploys automatically."""
import argparse, datetime, json, pathlib, secrets, shlex, subprocess, sys, os
p=argparse.ArgumentParser()
p.add_argument("--container",default="marinara-engine-marinara-1")
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent
def run(*cmd):
 r=subprocess.run(cmd,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(f"command failed: {shlex.join(cmd)}\n{r.stderr[:1200]}")
 return r.stdout.strip()
def abort(msg):raise SystemExit("ABORT: "+str(msg))
required=["gf-customizer-runtime.cjs","gf-customizer-edits.json","server-original.mjs","server-test.mjs"]
for name in required:
 if not (root/name).is_file():abort(f"missing {name}")
import hashlib
sha=hashlib.sha256((root/"server-original.mjs").read_bytes()).hexdigest()
if sha!="6bd9ec1f95f5296b65e974ea723e50e59a0335efabc97b6585c0979fb6153284":abort("original hash mismatch")
recipe=json.loads((root/"gf-customizer-edits.json").read_text())
if recipe.get("originalSha256")!=sha or len(recipe.get("edits",[]))<5:abort("recipe mismatch")
details=json.loads(run("sudo","docker","inspect",a.container))[0]
labels=details.get("Config",{}).get("Labels") or {}
service=labels.get("com.docker.compose.service")
project=labels.get("com.docker.compose.project")
files_label=labels.get("com.docker.compose.project.config_files")
working_dir=labels.get("com.docker.compose.project.working_dir")
if not (service and project and files_label and working_dir):abort("cannot identify existing compose config (no change made)")
files=[pathlib.Path(f) for f in files_label.split(",")]
if not all(f.is_file() for f in files):abort("existing compose files not readable (no change made)")
if (root/"docker-compose.gf-customizer.yml") in files:abort("customizer overlay already active")
env=dict(x.split("=",1) for x in details["Config"]["Env"] if "=" in x)
opts=env.get("NODE_OPTIONS","")
preloads=["/app/me-speedup.cjs","/app/gacha-ko-runtime.cjs","/app/gacha-cg-runtime.cjs","/app/novelai-gacha-delay.cjs"]
if not all(any(f"--require={x}" in opts or f"--require {x}" in opts for _ in [0]) for x in preloads):abort("existing 4 preloads missing from running container")
mounts=details.get("Mounts",[])
for item in preloads:
 if not any(m["Destination"]==item for m in mounts):abort(f"missing mount {item}")
base_cmd=["sudo","docker","compose","-p",project]
for f in files:base_cmd+=["-f",str(f)]
base_conf=json.loads(run(*(base_cmd+["config","--format","json"])))
if service not in base_conf.get("services",{}):abort("service missing in Compose config")
svc=base_conf["services"][service]
configured=svc.get("environment") or {}
if isinstance(configured,list):configured=dict(x.split("=",1) for x in configured if "=" in x)
if configured.get("NODE_OPTIONS","")!=opts:abort("running NODE_OPTIONS differ from Compose config; manual review required")
existing_secret=env.get("GF_CUSTOMIZER_SECRET")
if existing_secret:abort("existing customizer installation detected")
stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
stage=root/("gf-live-stage-"+stamp)
stage.mkdir(mode=0o700)
overlay=stage/"docker-compose.gf-customizer.yml"
secret=secrets.token_urlsafe(40)
newopts=opts+" --require=/app/gf-customizer-runtime.cjs"
# JSON scalars are valid YAML double-quoted scalars. Paths/secret remain in private staged file.
overlay.write_text("services:\n  "+json.dumps(service)+":\n    volumes:\n      - "+json.dumps(str(root/"gf-customizer-runtime.cjs")+":/app/gf-customizer-runtime.cjs:ro")+"\n      - "+json.dumps(str(root/"gf-customizer-edits.json")+":/app/gf-customizer-edits.json:ro")+"\n    environment:\n      NODE_OPTIONS: "+json.dumps(newopts)+"\n      GF_CUSTOMIZER_EDITS_PATH: \"/app/gf-customizer-edits.json\"\n      GF_CUSTOMIZER_SECRET: "+json.dumps(secret)+"\n      GF_CUSTOMIZER_ENABLE_EXCHANGE: \"0\"\n")
overlay.chmod(0o600)
full_cmd=base_cmd+["-f",str(overlay)]
try:
 cfg=json.loads(run(*(full_cmd+["config","--format","json"])))
 new=cfg["services"][service]
 volumes=new.get("volumes") or []
 destinations=[v.get("target") for v in volumes]
 if "/app/gf-customizer-runtime.cjs" not in destinations or "/app/gf-customizer-edits.json" not in destinations:abort("overlay mounts missing")
 ne=new.get("environment",{})
 if ne.get("NODE_OPTIONS")!=newopts or ne.get("GF_CUSTOMIZER_ENABLE_EXCHANGE")!="0":abort("overlay env unexpectedly altered")
except Exception:
 overlay.unlink(missing_ok=True)
 stage.rmdir()
 raise
apply=stage/"apply.sh"
rollback=stage/"rollback.sh"
base=" ".join(shlex.quote(x) for x in base_cmd)
extra=shlex.quote(str(overlay))
apply.write_text("#!/usr/bin/env bash\nset -euo pipefail\n"+base+" -f "+extra+" up -d --no-deps "+shlex.quote(service)+"\n")
rollback.write_text("#!/usr/bin/env bash\nset -euo pipefail\n"+base+" up -d --no-deps --force-recreate "+shlex.quote(service)+"\n")
for f in (apply,rollback):f.chmod(0o700)
print("PASS STAGED: no running container or source data changed")
print("Compose service:",service)
print("Original Compose files:",*[str(f) for f in files],sep="\n  ")
print("Stage:",stage)
print("Secret: stored privately in staged overlay (not printed)")
print("Exchange: DISABLED")
print("Apply (recreates service; after review): bash "+shlex.quote(str(apply)))
print("Rollback: bash "+shlex.quote(str(rollback)))
