#!/usr/bin/env python3
"""Extract original and patched banner functions; offline deterministic rotation tests."""
from pathlib import Path
import argparse, subprocess, shutil, sys
p=argparse.ArgumentParser()
p.add_argument("original")
p.add_argument("patched")
p.add_argument("--container",default="marinara-engine-marinara-1")
args=p.parse_args()
def take(source):
    begin=source.index("function ht(")
    end=source.index("function Fc(",begin)
    return source[begin:end]
original=Path(args.original).read_text()
patched=Path(args.patched).read_text()
assert "endsAt:n+Wu" in take(original), "Original banner function signature mismatch"
assert "endsAt:n+GF_SETTINGS.bannerDays*24*60*60*1e3" in take(patched), "Patch is missing banner duration"
assert "days:r&&Number(r.endsAt)>Number(r.startedAt)?" in take(patched), "Patch is missing banner label"
script=r"""const assert=require("node:assert/strict");
const DAY=86400000,now=1780000000000;
const Wu=14*DAY;
const l=x=>x||"";
let GF_SETTINGS={bannerDays:14};
const old=(()=>{""" + take(original) + r"""return {ht,cy,ly,ow};})();
const modified=(()=>{""" + take(patched) + r"""return {ht,cy,ly,ow};})();
const initial={featured:{seq:3,startedAt:now-10*DAY,endsAt:now+4*DAY}};
assert.deepEqual(modified.ht(initial,now),old.ht(initial,now));
assert.deepEqual(modified.cy(initial,now),old.cy(initial,now));
GF_SETTINGS.bannerDays=7;
const status=modified.ht(initial,now);
assert.equal(status.endsAt,initial.featured.endsAt,"existing expiration must not change");
assert.equal(status.expired,false);
assert.equal(status.days,14,"existing banner should retain its actual 14-day duration");
assert.equal(modified.ht(initial,initial.featured.endsAt-1).expired,false);
assert.equal(modified.ht(initial,initial.featured.endsAt).expired,true);
const rotated=modified.cy(initial,initial.featured.endsAt);
assert.deepEqual(rotated,{seq:4,startedAt:initial.featured.endsAt,endsAt:initial.featured.endsAt+7*DAY});
assert.equal(modified.ht({featured:rotated},rotated.startedAt+7*DAY).expired,true);
assert.equal(modified.ht({featured:rotated},rotated.startedAt).days,7);
assert.equal(modified.ht({featured:rotated},rotated.startedAt+7*DAY-1).expired,false);
const constructed=modified.ly({
 startedAt:rotated.startedAt,endsAt:rotated.endsAt,key:"f4",mode:modified.ow(4),
 shortName:"Test",cFiveId:"character-five",cFourId:"character-four",
 wFiveId:"weapon-five",wFourId:"weapon-four",bannerArt:null
});
assert.equal(constructed.charBanner.endsAt,rotated.endsAt);
assert.equal(constructed.weaponBanner.endsAt,rotated.endsAt);
assert.equal(constructed.charBanner.fiveId,"character-five");
assert.equal(constructed.weaponBanner.fiveId,"weapon-five");
assert.equal(modified.ow(3),"story");
assert.equal(modified.ow(4),"fresh");
assert.equal(modified.cy({featured:rotated},rotated.endsAt).seq,5);
const omitted={featured:null};
assert.equal(modified.ht(omitted,now).expired,true);
assert.equal(modified.cy(omitted,now).seq,1);
console.log("PASS extracted banner rotation: 14d baseline, 7d next, expiration boundaries, sequence, paired banners");
""";
if not shutil.which("docker"): sys.exit("ERROR: Docker executable missing")
r=subprocess.run(["docker","exec","-i",args.container,"node","-"],input=script,text=True,capture_output=True)
if r.stdout:print(r.stdout,end="")
if r.stderr:print(r.stderr,end="",file=sys.stderr)
if r.returncode:sys.exit(r.returncode)
print("NOTE: hl() database writes and automatic scheduler execution are NOT tested.")
