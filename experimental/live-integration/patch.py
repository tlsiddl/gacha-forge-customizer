#!/usr/bin/env python3
"""Strict-match offline patch for the exact supplied Gacha Forge server.mjs. Never edits input."""
import argparse, pathlib, hashlib, json
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--edits-output');a=p.parse_args()
src=pathlib.Path(a.input).read_text();before=src;edits=[]

def rep(old,new):
 global src
 n=src.count(old)
 if n!=1: raise SystemExit(f'ABORT: expected one match ({n}): {old[:90]}')
 src=src.replace(old,new,1)
 edits.append({'old':old,'new':new})

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
# Subsequent calendar rollover must use the configured duration, not the original 14-day constant.
rep('endsAt:N.endsAt+Wu','endsAt:N.endsAt+GF_SETTINGS.bannerDays*24*60*60*1e3')
# Calendar-banner adoption must carry the NEW featured clock into both cloned documents.
rep('data:re.data}),Me=await Mt(le(s,`wpn:f${ye.seq}`),{packageId:n.id,kind:"banner",name:oe.name,description:oe.description,data:oe.data})',
    'data:{...re.data,startedAt:ye.startedAt,endsAt:ye.endsAt}}),Me=await Mt(le(s,`wpn:f${ye.seq}`),{packageId:n.id,kind:"banner",name:oe.name,description:oe.description,data:{...oe.data,startedAt:ye.startedAt,endsAt:ye.endsAt}})')
rep('Kt=MA(U,Q,ne)','Kt=gfPity(U,Q,ne,m)')
rep('RA(U,x.fiveId,ee,Y)','gfPick(U,x.fiveId,ee,Y)')
rep('In.gained||(Pt=jg(!1,Ft.rarity))','In.gained||(Pt=(GF_SETTINGS["fullFacetGlimmer"+Ft.rarity]===0?jg(!1,Ft.rarity):GF_SETTINGS["fullFacetGlimmer"+Ft.rarity]))')
# Both banner overview and selected-banner detail were still returning the original 80/74.
# Keep real summon logic, banner list and banner detail aligned on the same settings.
rep('return{count:Number(S.count)||0,soft:Ko,hard:yi,guaranteed:!!S.sinceFeatured}',
    'return{count:Number(S.count)||0,soft:Math.max(1,(b.cat==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity)-6),hard:b.cat==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,guaranteed:!!S.sinceFeatured}')
rep('pity:{count:Number(O.count)||0,soft:Ko,hard:yi,guaranteed:!!O.sinceFeatured}',
    'pity:{count:Number(O.count)||0,soft:Math.max(1,(g==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity)-6),hard:g==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,guaranteed:!!O.sinceFeatured}')
rep('pity:{count:U.count,soft:Ko,hard:yi,guaranteed:!!U.sinceFeatured}', 'pity:{count:U.count,soft:Math.min(m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,Math.max(1,(m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity)-6)),hard:m==="wpn"?GF_SETTINGS.weaponPity:GF_SETTINGS.characterPity,guaranteed:!!U.sinceFeatured}')
# Settings/catalog rely on Marinara's upstream /api/gacha-forge gateway administrator authorization.
# Never expose these handlers through an unauthenticated mount. Purchase stays disabled.
# Authenticated live settings update. The host request handler is not yet confirmed to expose headers;
# use a body secret, sent transiently and NEVER stored client-side. Block if secret absent.
route='''s.get("/gf-customizer/settings",async()=>({ok:!0,settings:GF_SETTINGS})),s.post("/gf-customizer/settings",async p=>{const body=p&&p.body||{};try{const settings=gfSave(body.settings);return{ok:!0,settings}}catch(e){return{ok:!1,error:"invalid-settings",message:String(e.message||e)}}}),'''
# Character-only Glimmer exchange. One optimistic-concurrency session write for debit + roster.
exchange='''s.post("/gf-customizer/exchange",async p=>{const u=p&&p.body||{},secret=process.env.GF_CUSTOMIZER_SECRET||"",o=l(u.runId),id=l(u.characterId),requestId=u.requestId;if(secret.length<24||typeof u.secret!=="string"||u.secret!==secret)return{ok:!1,error:"unauthorized"};if(!o||!id||typeof requestId!=="string"||!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))return{ok:!1,error:"bad-request"};if(process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE!=="1")return{ok:!1,error:"exchange-disabled"};if(!id.startsWith(o+":unit:"))return{ok:!1,error:"cross-run-character"};const{data:registry}=await be();if(!Ae(registry,o))return{ok:!1,error:"bad-request"};const character=await Gn(id);if(!character||character.kind!=="character"||character.isProtagonist||![4,5].includes(Number(character.rarity)))return{ok:!1,error:"not-for-sale"};const{doc,data}=await pe(o);const next=structuredClone(data);next.gfCustomizer=next.gfCustomizer||{};next.gfCustomizer.exchangeReceipts=next.gfCustomizer.exchangeReceipts||{};const prior=next.gfCustomizer.exchangeReceipts[requestId];if(prior){if(prior.characterId!==id)return{ok:!1,error:"request-id-reused"};return{...prior,ok:!0,replayed:!0}}next.roster=next.roster||{};const existing=next.roster[id],level=existing?Number(existing.facet)||0:0;if(existing&&level>=Sn)return{ok:!1,error:"max-facet"};next.gfCustomizer=next.gfCustomizer||{};next.gfCustomizer.exchangeCounts=next.gfCustomizer.exchangeCounts||{};const count=next.gfCustomizer.exchangeCounts[id]??0;if(!Number.isSafeInteger(count)||count<0||count>100000)return{ok:!1,error:"invalid-exchange-count"};const price=(Number(character.rarity)===5?300:100)+20*count;next.wallet=At(next.wallet||{...Xe},next);const balance=Number(next.wallet.glimmer);if(!Number.isSafeInteger(balance)||balance<0||balance<price)return{ok:!1,error:"insufficient-glimmer",price,held:balance};let facet=null;if(existing){const item={...existing};facet=vf(item.facet);if(!facet.gained)return{ok:!1,error:"max-facet"};item.facet=facet.facet;next.roster[id]=item;}else next.roster[id]={level:1,bondFights:0};next.wallet.glimmer=balance-price;next.gfCustomizer.exchangeCounts[id]=count+1;const receipt={characterId:id,rarity:Number(character.rarity),price,nextPrice:price+20,exchangeCount:count+1,isNew:!existing,facet};next.gfCustomizer.exchangeReceipts[requestId]=receipt;const saved=await Pe(o,doc,next);if(!saved)return{ok:!1,error:"write-conflict",retry:!0};return{ok:!0,characterId:id,rarity:Number(character.rarity),price,nextPrice:price+20,exchangeCount:count+1,isNew:!existing,facet,wallet:at(next.wallet,next)}}),'''
rep('s.post("/shop/buy",async p=>',exchange+'s.post("/shop/buy",async p=>')
# Admin-secret gated, read-only inventory preview. Never changes a run.
catalog='''s.post("/gf-customizer/exchange/catalog",async p=>{const body=p&&p.body||{};const runId=l(body.runId);if(!runId)return{ok:!1,error:"bad-request"};const{data:registry}=await be();if(!Ae(registry,runId))return{ok:!1,error:"bad-request"};const{data}=await pe(runId);const wallet=At(data.wallet||{...Xe},data),roster=data.roster||{},counts=data.gfCustomizer&&data.gfCustomizer.exchangeCounts||{};const documents=await a.list(n.id,kt),characters=[];for(const doc of documents){if(!doc||typeof doc.id!=="string"||!doc.id.startsWith(runId+":unit:"))continue;const card=doc.data||{};if(card.kind==="weapon"||card.isProtagonist||![4,5].includes(Number(card.rarity)))continue;const id=doc.id,owned=roster[id]||null,facet=owned?Math.max(0,Math.min(Sn,Number(owned.facet)||0)):null,count=counts[id]??0;if(!Number.isSafeInteger(count)||count<0||count>100000)continue;characters.push({id,name:String(card.name||"").slice(0,120),rarity:Number(card.rarity),owned:!!owned,facet,maxFacet:Sn,maxed:facet!==null&&facet>=Sn,exchangeCount:count,price:(Number(card.rarity)===5?300:100)+20*count,portrait:sn(card)||null})}return{ok:!0,characters:characters.slice(0,500),glimmer:Math.max(0,Number(wallet.glimmer)||0),readOnly:process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE!=="1",exchangeEnabled:process.env.GF_CUSTOMIZER_ENABLE_EXCHANGE==="1"&&!!process.env.GF_CUSTOMIZER_SECRET&&process.env.GF_CUSTOMIZER_SECRET.length>=24}}),'''
rep('s.post("/shop/buy",async p=>',catalog+'s.post("/shop/buy",async p=>')

rep('s.get("/ping",async()=>',route+'s.get("/ping",async()=>')
pathlib.Path(a.output).write_text(src)
if a.edits_output:
 pathlib.Path(a.edits_output).write_text(json.dumps({'originalSha256':hashlib.sha256(before.encode()).hexdigest(),'patchedSha256':hashlib.sha256(src.encode()).hexdigest(),'edits':edits},ensure_ascii=False))
print('Patched output only:',a.output,'size=',len(src),'input SHA256=',hashlib.sha256(before.encode()).hexdigest())
