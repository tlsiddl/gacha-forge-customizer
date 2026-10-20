'use strict';
// Gacha Forge Customizer: composable synchronous ESM source patch; does not write files.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {registerHooks}=require('node:module');
const {fileURLToPath}=require('node:url');
const TARGET=/[\\/]capability-runtime-snapshots[\\/]gacha-forge-1\.8\.13-[^\\/]+[\\/]server\.mjs$/; // \ or / so Windows paths match too
const RECIPE=process.env.GF_CUSTOMIZER_EDITS_PATH||'/app/gf-customizer-edits.json';
const ORIGINAL_SHA256='defce243452149ed999f24ca2c8ae6615ba9d743ea54a7987c7194b1ae0d3fec';
function hash(s){return crypto.createHash('sha256').update(s).digest('hex')}
function count(h,n){return h.split(n).length-1}
function validate(recipe){
 if(!recipe||recipe.originalSha256!==ORIGINAL_SHA256||!Array.isArray(recipe.edits)||recipe.edits.length<5||recipe.edits.length>32)throw Error('invalid or mismatched edit recipe');
 for(const edit of recipe.edits)if(!edit||typeof edit.old!=='string'||typeof edit.new!=='string'||!edit.old.length)throw Error('invalid edit entry');
 return recipe;
}
function applyEdits(source,recipe){
 const edits=validate(recipe).edits;
 let next=source;
 for(let i=0;i<edits.length;i++){
  const {old,new:replacement}=edits[i];
  if(count(next,old)!==1)return{ok:false,error:'signature mismatch',index:i+1,source};
  next=next.replace(old,replacement);
 }
 return{ok:true,source:next};
}
if(process.env.GF_CUSTOMIZER_HOOK_TEST!=='1'){
 if(typeof registerHooks!=='function'){process.stderr.write('[gf-customizer] this Node.js has no module.registerHooks (need 22.15+); loader disabled, game unchanged\n')}
 else{
  let recipe;
  try{recipe=validate(JSON.parse(fs.readFileSync(RECIPE,'utf8')))}
  catch(e){process.stderr.write('[gf-customizer] recipe unavailable; loader disabled: '+e.message+'\n')}
  if(recipe){
   registerHooks({load(url,context,nextLoad){
    if(!url.startsWith('file:'))return nextLoad(url,context);
    let filename;try{filename=fileURLToPath(url)}catch{return nextLoad(url,context)}
    if(!TARGET.test(filename))return nextLoad(url,context);
    const result=nextLoad(url,context);
    const source=result.source==null?fs.readFileSync(filename,'utf8'):Buffer.isBuffer(result.source)?result.source.toString('utf8'):String(result.source);
    const transformed=applyEdits(source,recipe);
    if(!transformed.ok){
      process.stderr.write('[gf-customizer] fail closed: '+transformed.error+' #'+transformed.index+'; existing loaders preserved\n');
      return result;
    }
    process.stderr.write('[gf-customizer] applied '+recipe.edits.length+' edits in memory, preserving upstream hook output\n');
    return{...result,source:transformed.source,shortCircuit:true};
   }});
   process.stderr.write('[gf-customizer] hook registered (no package files changed)\n');
  }
 }
}
module.exports={applyEdits,validate,TARGET};
