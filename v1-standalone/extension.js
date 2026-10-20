(() => {
  'use strict';
  const KEY = '__gachaForgeCustomizerV1';
  if (typeof window[KEY] === 'function') window[KEY]();
  const STORE = 'gacha-forge-customizer-v1:settings';
  const fields = {
    bannerDays: { label: '배너 기간 (일)', min: 1, max: 14, value: 3 },
    characterPity: { label: '캐릭터 천장 (회)', min: 1, max: 100, value: 70 },
    weaponPity: { label: '무기 천장 (회)', min: 1, max: 100, value: 60 },
    dup4: { label: '4성 풀돌 Glimmer', min: 0, max: 999999, value: 8 },
    dup5: { label: '5성 풀돌 Glimmer', min: 0, max: 999999, value: 40 },
    shop4: { label: '4성 정가 Glimmer', min: 1, max: 999999, value: 40 },
    shop5: { label: '5성 정가 Glimmer', min: 1, max: 999999, value: 200 }
  };
  const fresh = () => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value]));
  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
      const next = fresh();
      for (const [k, def] of Object.entries(fields)) {
        const n = Number(raw[k]);
        if (raw[k] !== undefined && Number.isInteger(n) && n >= def.min && n <= def.max) next[k] = n;
      }
      return next;
    } catch { return fresh(); }
  }
  let data = read(), panel = null, button = null, timer = null, closed = false;
  // Keep the settings entry visible: Gacha Forge's actual root need not expose a gacha-specific selector.
  const isGacha = () => !closed;
  function show() {
    if (!document.body) return;
    const visible = isGacha();
    if (button) button.hidden = !visible;
    if (panel && !visible) panel.hidden = true;
  }
  function init() {
    if (closed || !document.body || button) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'gf-customizer-v1-button'; b.textContent = '가챠 설정';
    b.setAttribute('aria-label', '가챠 커스터마이저 V1 설정');
    Object.assign(b.style, { position:'fixed',right:'14px',bottom:'82px',zIndex:'2147483000',padding:'9px 13px',border:'1px solid #8c9ab0',borderRadius:'14px',background:'#1b2941',color:'#fff',cursor:'pointer',fontFamily:'system-ui' });
    const p = document.createElement('section');
    p.id = 'gf-customizer-v1-panel'; p.hidden = true;
    Object.assign(p.style,{position:'fixed',right:'12px',bottom:'126px',width:'min(340px,calc(100vw - 24px))',maxHeight:'min(70vh,640px)',overflowY:'auto',zIndex:'2147483001',background:'#172238',border:'1px solid #7185a6',borderRadius:'18px',padding:'16px',color:'#fff',boxShadow:'0 10px 45px #0008',font:'14px/1.55 system-ui'});
    const head = document.createElement('div');
    head.style.display='flex';head.style.justifyContent='space-between';head.style.alignItems='center';
    const title=document.createElement('strong');title.textContent='가챠 커스터마이저 V1';
    const close=document.createElement('button');close.type='button';close.textContent='✕';close.setAttribute('aria-label','닫기');
    Object.assign(close.style,{background:'transparent',border:0,color:'#fff',cursor:'pointer',fontSize:'18px'});
    head.append(title,close);p.append(head);
    const notice=document.createElement('p');notice.textContent='설정값만 저장하는 독립 버전입니다. 실제 배너·천장·재화는 변경하지 않습니다.';notice.style.color='#d2dbed';p.append(notice);
    const inputs={};
    for(const [key,def] of Object.entries(fields)){
      const label=document.createElement('label');label.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;margin:9px 0';
      const span=document.createElement('span');span.textContent=def.label;
      const input=document.createElement('input');input.type='number';input.min=def.min;input.max=def.max;input.step='1';input.value=data[key];input.style.cssText='width:90px;padding:7px;border-radius:7px;background:#0b1528;color:#fff;border:1px solid #637a9d';
      input.addEventListener('change',()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<def.min||n>def.max){input.value=data[key];return;}data[key]=n;try{localStorage.setItem(STORE,JSON.stringify(data));status.textContent='설정값이 이 브라우저에 저장되었습니다.';}catch{status.textContent='로컬 저장에 실패했습니다.'}});
      label.append(span,input);p.append(label);inputs[key]=input;
    }
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:12px';
    const copy=document.createElement('button');copy.type='button';copy.textContent='JSON 복사';
    const reset=document.createElement('button');reset.type='button';reset.textContent='기본값';
    for(const el of [copy,reset])el.style.cssText='padding:8px 10px;border:1px solid #8596b6;background:#2f4c7a;color:white;border-radius:8px;cursor:pointer';
    const status=document.createElement('p');status.setAttribute('role','status');status.style.color='#d2dbed';
    copy.onclick=()=>{const txt=JSON.stringify({bannerDays:data.bannerDays,characterPity:data.characterPity,weaponPity:data.weaponPity,fullFacetGlimmer:{4:data.dup4,5:data.dup5},shopPrices:{4:data.shop4,5:data.shop5}},null,2);navigator.clipboard?.writeText(txt).then(()=>{status.textContent='설정 JSON을 복사했습니다.'}).catch(()=>{status.textContent='클립보드 접근이 차단되었습니다.'});};
    reset.onclick=()=>{data=fresh();for(const [k,input] of Object.entries(inputs))input.value=data[k];try{localStorage.setItem(STORE,JSON.stringify(data));status.textContent='기본값을 복원했습니다.'}catch{status.textContent='로컬 저장에 실패했습니다.'}};
    actions.append(copy,reset);p.append(actions,status);
    b.onclick=()=>{p.hidden=!p.hidden;};close.onclick=()=>{p.hidden=true};
    document.body.append(b,p);button=b;panel=p;show();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  timer=setInterval(()=>{if(!button)init();show()},1500);
  window[KEY]=()=>{closed=true;if(timer)clearInterval(timer);button?.remove();panel?.remove();button=null;panel=null;delete window[KEY];};
})();