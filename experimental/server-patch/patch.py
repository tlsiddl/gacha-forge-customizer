#!/usr/bin/env python3
"""Offline, strict-match source patcher. Does not write production files."""
import argparse, json, hashlib
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('source')
p.add_argument('--output', required=True)
p.add_argument('--config', default=str(Path(__file__).with_name('config.json')))
a = p.parse_args()
source = Path(a.source)
src = source.read_text()
c = json.loads(Path(a.config).read_text())
settings = {
    'bannerDays': int(c['bannerDays']),
    'characterPity': int(c['characterPity']),
    'weaponPity': int(c['weaponPity']),
    'characterFeaturedGuarantee': bool(c['characterFeaturedGuarantee']),
    'weaponFeaturedGuarantee': bool(c['weaponFeaturedGuarantee']),
    'fullFacetGlimmer': {str(i): int(c['fullFacetGlimmer'][str(i)]) for i in (4, 5)},
    'shopPrices': {str(i): int(c['shopPrices'][str(i)]) for i in (4, 5)},
}
assert 1 <= settings['bannerDays'] <= 14
assert 1 <= settings['characterPity'] <= 100 and 1 <= settings['weaponPity'] <= 100
assert all(0 <= x <= 1000000 for x in settings['fullFacetGlimmer'].values())
assert all(1 <= x <= 1000000 for x in settings['shopPrices'].values())

def replace(old, new):
    global src
    count = src.count(old)
    if count != 1:
        raise ValueError(f'Expected exact occurrence once, found {count}: {old[:100]}')
    src = src.replace(old, new, 1)

replace('var Wu=336*60*60*1e3;', f'var Wu={settings["bannerDays"]}*24*60*60*1e3;')
replace('let vt=(Number(U.count)||0)+1,Kt=MA(U,Q,ne),Tt=null;', 'let vt=(Number(U.count)||0)+1,Kt=GFroll(U,Q,ne,m),Tt=null;')

additional = """function GFroll(e,t,n,r){let hard=r==="wpn"?GFsettings.weaponPity:GFsettings.characterPity,soft=Math.min(hard,Math.max(1,hard-6)),count=(e.count||0)+1,rate=count>=hard?1:count>=soft?t+(count-soft+1)*((1-t)/(hard-soft+1)):t;if(Math.random()<rate){e.count=0;e.since4=0;return 5}e.count=count;let four=(e.since4||0)+1;if(four>=xA||Math.random()<n){e.since4=0;return 4}e.since4=four;return 3}function GFfeatured(e,t,n,r,kind){return GFsettings[kind==="wpn"?"weaponFeaturedGuarantee":"characterFeaturedGuarantee"]?(e.sinceFeatured=0,t):RA(e,t,n,r)}"""
replace('function RA(e,t,n,r){', additional + 'function RA(e,t,n,r){')
replace('RA(U,x.fiveId,ee,Y)', 'GFfeatured(U,x.fiveId,ee,Y,m)')
replace('In.gained||(Pt=jg(!1,Ft.rarity))', 'In.gained||(Pt=GFsettings.fullFacetGlimmer[String(Ft.rarity)]??jg(!1,Ft.rarity))')

# WARNING: Prototype only. Exchange route does not validate unit/world membership.
shop = """s.post("/gf-custom/exchange",async p=>{let q=p&&p.body||{},run=l(q.runId),id=l(q.unitId);if(!run||!id)return{ok:!1,error:"bad-request"};let{data:all}=await be();if(!Ae(all,run))return{ok:!1,error:"bad-request"};let unit=await Gn(id);if(!unit||unit.kind==="weapon"||![4,5].includes(Number(unit.rarity)))return{ok:!1,error:"invalid-unit"};let{doc,data}=await pe(run),wallet=At(data.wallet||{...Xe},data),price=GFsettings.shopPrices[String(unit.rarity)],held=Math.max(0,Math.round(Number(wallet.glimmer)||0));if(held<price)return{ok:!1,error:"insufficient-glimmer",held,price};data.roster=data.roster||{};let owned=data.roster[id];if(owned&&vf(owned.facet).gained===false)return{ok:!1,error:"max-facet"};if(!owned)data.roster[id]={level:1,bondFights:0};else owned.facet=vf(owned.facet).facet;wallet.glimmer=held-price;data.wallet=wallet;if(!await Pe(run,doc,data))return{ok:!1,error:"write-conflict"};return{ok:!0,unitId:id,price,wallet:at(wallet,data),facet:Number(data.roster[id].facet)||0}}),"""
replace('s.post("/shop/buy",async p=>{', shop + 's.post("/shop/buy",async p=>{')
replace('function GFroll(e,t,n,r){', 'const GFsettings=' + json.dumps(settings, separators=(',', ':')) + ';function GFroll(e,t,n,r){')
Path(a.output).write_text(src)
print('Source SHA256:', hashlib.sha256(source.read_bytes()).hexdigest())
print('Output SHA256:', hashlib.sha256(src.encode()).hexdigest())
print('Created:', a.output)
