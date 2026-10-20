#!/usr/bin/env python3
"""Strict-match offline patch for the exact supplied Gacha Forge server.mjs. Never edits input."""
import argparse, pathlib, hashlib
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');a=p.parse_args()
src=pathlib.Path(a.input).read_text();before=src

def rep(old,new):
 global src
 n=src.count(old)
 if n!=1: raise SystemExit(f'ABORT: expected one match ({n}): {old[:90]}')
 src=src.replace(old,new,1)

# Persist data under private server volume and block unauthenticated writes.
boot='''import {readFileSync as gfReadFile,writeFileSync as gfWriteFile,renameSync as gfRenameFile,mkdirSync as gfMkdir} from "node:fs";
import {dirname as gfDirname} from "node:path";
const GF_FILE=process.env.GF_CUSTOMIZER_CONFIG_FILE||"/app/data/gacha-customizer-settings.json";
const GF_DEFAULT=Object.freeze({bannerDays:14,characterPity:80,weaponPity:80,featuredGuarantee:false,fullFacetGlimmer4:0,fullFacetGlimmer5:0});
function gfNormalize(raw){let r={...GF_DEFAULT};for(const key of ["bannerDays","characterPity","weaponPity","fullFacetGlimmer4","fullFacetGlimmer5"]){if(raw&&Object.hasOwn(raw,key)){let v=raw[key];if(!Number.isInteger(v)||v<(key.startsWith("fullFacet")?0:1)||v>(key.startsWith("fullFacet")?100000: key==="bannerDays"?30:100))throw Error("invalid "+key);r[key]=v;}}if(raw&&Object.hasOwn(raw,"featuredGuarantee")){if(typeof raw.featuredGuarantee!=="boolean")throw Error("invalid featuredGuarantee");r.featuredGuarantee=raw.featuredGuarantee;}return r;}
let GF_SETTINGS={...GF_DEFAULT};try{GF_SETTINGS=gfNormalize(JSON.parse(gfReadFile(GF_FILE,"utf8")))}catch(e){if(e.code!=="ENOENT")console.error("[gf-customizer] settings load failed; defaults kept",e.message)}
function gfPity(state,rate5,rate4,kind){const hard=kind==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity;if(hard===80)return MA(state,rate5,rate4);const soft=Math.max(1,hard-6);const count=(state.count||0)+1;const odds=count>=hard?1:count>=soft?rate5+(count-soft+1)*(1-rate5)/(hard-soft+1):rate5;if(Math.random()<odds){state.count=0;state.since4=0;return 5;}state.count=count;const four=(state.since4||0)+1;if(four>=xA||Math.random()<rate4){state.since4=0;return 4;}state.since4=four;return 3;}
function gfPick(state,up,pool,rate){if(GF_SETTINGS.featuredGuarantee){state.sinceFeatured=0;return up;}return RA(state,up,pool,rate);}
function gfSave(next){const validated=gfNormalize(next);const tmp=GF_FILE+"."+process.pid+".tmp";gfMkdir(gfDirname(GF_FILE),{recursive:true});gfWriteFile(tmp,JSON.stringify(validated,null,2),{mode:0o600});gfRenameFile(tmp,GF_FILE);GF_SETTINGS=validated;return validated;}
'''
rep('var rb=[',boot+'var rb=[')
rep('var Wu=336*60*60*1e3;','var Wu=336*60*60*1e3;') if False else None
rep('days:Math.round(Wu/(1440*60*1e3))','days:r&&Number(r.endsAt)>Number(r.startedAt)?Math.max(1,Math.round((Number(r.endsAt)-Number(r.startedAt))/(1440*60*1e3))):GF_SETTINGS.bannerDays')
rep('endsAt:n+Wu','endsAt:n+GF_SETTINGS.bannerDays*24*60*60*1e3')
rep('Kt=MA(U,Q,ne)','Kt=gfPity(U,Q,ne,m)')
rep('RA(U,x.fiveId,ee,Y)','gfPick(U,x.fiveId,ee,Y)')
rep('In.gained||(Pt=jg(!1,Ft.rarity))','In.gained||(Pt=(GF_SETTINGS["fullFacetGlimmer"+Ft.rarity]===0?jg(!1,Ft.rarity):GF_SETTINGS["fullFacetGlimmer"+Ft.rarity]))')
rep('pity:{count:U.count,soft:Ko,hard:yi,guaranteed:!!U.sinceFeatured}', 'pity:{count:U.count,soft:Math.min(m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,Math.max(1,(m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity)-6)),hard:m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,guaranteed:!!U.sinceFeatured}')
# Authenticated live settings update. The host request handler is not yet confirmed to expose headers;
# use a body secret, sent transiently and NEVER stored client-side. Block if secret absent.
route='''s.get("/gf-customizer/settings",async()=>({ok:!0,settings:GF_SETTINGS})),s.post("/gf-customizer/settings",async p=>{const secret=process.env.GF_CUSTOMIZER_SECRET||"";const body=p&&p.body||{};if(secret.length<24||typeof body.secret!=="string"||body.secret!==secret)return{ok:!1,error:"unauthorized"};try{const settings=gfSave(body.settings);return{ok:!0,settings}}catch(e){return{ok:!1,error:"invalid-settings",message:String(e.message||e)}}}),'''
rep('s.get("/ping",async()=>',route+'s.get("/ping",async()=>')
pathlib.Path(a.output).write_text(src)
print('Patched output only:',a.output,'size=',len(src),'input SHA256=',hashlib.sha256(before.encode()).hexdigest())
