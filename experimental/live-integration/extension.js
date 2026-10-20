(()=>{'use strict';
 const KEY='__GF_CUSTOMIZER_UNIFIED';if(typeof window[KEY]==='function')window[KEY]();
 const API='/api/gacha-forge/gf-customizer/settings';
 const fields={bannerDays:['배너 기간 (일)',1,30],characterPity:['캐릭터 5성 천장',1,100],weaponPity:['무기 5성 천장',1,100],fullFacetGlimmer4:['4성 풀돌 중복 Glimmer',0,100000],fullFacetGlimmer5:['5성 풀돌 중복 Glimmer',0,100000]};
 let disposed=false,button,panel,interval,values={};let nativeView='',lastScreen='',activePane=null,hiddenNodes=[];let host=null,observer=null,scheduled=false;
 // Follow the Quest Extension's passive run discovery: observe successful game traffic, never poll /state.
 let observedRunId='',observedRunAt=0,observedRunListener=null;
 const priorGameFetch=window.fetch;
 function acceptRunId(value){const id=typeof value==='string'?value.trim():'';if(!id||id.length>128||!/^[a-zA-Z0-9:_-]+$/.test(id))return;
   const changed=observedRunId!==id;observedRunId=id;observedRunAt=Date.now();if(changed&&typeof observedRunListener==='function')observedRunListener(id);
 }
 function readRunResponse(payload){if(!payload||typeof payload!=='object')return;
   const id=payload.activeRun?.runId||payload.activeRunId||payload.run?.runId;
   if(id)acceptRunId(id);
 }
 const observedGameFetch=function(input,options){
   const promise=priorGameFetch.apply(this,arguments);
   try{const u=new URL(typeof input==='string'?input:input?.url,location.href);
     if(u.origin!==location.origin||!u.pathname.startsWith('/api/gacha-forge/'))return promise;
     if(u.pathname.includes('/gf-customizer/'))return promise;
     let requested='';
     const body=options?.body;
     if(typeof body==='string'){try{requested=JSON.parse(body)?.runId||'';}catch{}}
     // Requests carrying a run ID may still fail: only accept it when the game request succeeds.
     if(promise&&typeof promise.then==='function')promise.then(response=>{
       if(!response?.ok)return;
       if(requested)acceptRunId(requested);
       if(!/\/(state|runs)(\/|$)/.test(u.pathname))return;
       if(Number(response.headers?.get?.('content-length')||0)>1024*1024)return;
       response.clone().json().then(readRunResponse).catch(()=>{});
     }).catch(()=>{});
   }catch{}
   return promise;
 };
 window.fetch=observedGameFetch;
 const baseStyle='box-sizing:border-box;font-family:system-ui,sans-serif!important;font-size:13px!important;line-height:1.45!important;letter-spacing:normal!important;color:#f2f4fa;background:#162238;border:1px solid #576986;border-radius:9px;padding:8px;';
 const isGacha=()=>{let url=location.pathname+location.hash;if(url.includes('gacha-forge'))return true;return [...document.querySelectorAll('[aria-selected="true"],[aria-current="page"]')].some(x=>/gacha\s*forge|가챠\s*포지/i.test(x.textContent||''));};
 function privilegedHeaders(json=false){const headers={'X-Marinara-CSRF':'1'};if(json)headers['Content-Type']='application/json';try{const secret=window.localStorage.getItem('marinara_admin_secret')?.trim();if(secret)headers['X-Admin-Secret']=secret;}catch{}return headers;}
 async function request(method,body){const r=await fetch(API,{method,credentials:'same-origin',headers:privilegedHeaders(!!body),body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(!data.ok)throw Error(data.error||'서버 오류');return data.settings;}
 function init(){if(disposed||button||!document.body)return;
 button=document.createElement('button');button.textContent='가챠 설정';button.style.cssText=baseStyle+'position:fixed;right:14px;bottom:82px;z-index:2147483000;cursor:pointer';
 panel=document.createElement('section');panel.style.cssText=baseStyle+'position:fixed;right:12px;bottom:126px;z-index:2147483001;width:min(355px,calc(100vw - 24px));max-height:75vh;overflow:auto;box-shadow:0 12px 40px #0009;';panel.hidden=true;panel.style.setProperty('font-size','13px','important');panel.style.lineHeight='1.45';panel.style.letterSpacing='normal';
 const head=document.createElement('div');head.style.cssText='display:flex;align-items:center;justify-content:space-between';const title=document.createElement('strong');title.textContent='가챠 포지 커스터마이저';title.style.cssText='font-size:16px!important;line-height:1.3!important';const close=document.createElement('button');close.textContent='닫기';close.style.cssText=baseStyle;close.onclick=()=>panel.hidden=true;head.append(title,close);panel.append(head);
 const tabs=document.createElement('div');tabs.style.cssText='display:flex;gap:6px;margin:10px 0';const tabSettings=document.createElement('button');const tabShop=document.createElement('button');for(const [b,label] of [[tabSettings,'설정'],[tabShop,'Glimmer 상점']]){b.textContent=label;b.style.cssText=baseStyle+'flex:1;cursor:pointer';tabs.append(b)}panel.append(tabs);const settingSection=document.createElement('section');const shopSection=document.createElement('section');panel.append(settingSection,shopSection);function switchTab(name){settingSection.hidden=name!=='settings';shopSection.hidden=name!=='shop';tabSettings.setAttribute('aria-pressed',String(name==='settings'));tabShop.setAttribute('aria-pressed',String(name==='shop'));}tabSettings.onclick=()=>switchTab('settings');tabShop.onclick=()=>switchTab('shop');switchTab('settings');
 const note=document.createElement('p');note.textContent='Glimmer 교환은 관리자용 기능입니다. 서버에서 활성화한 경우에만 구매할 수 있습니다.';shopSection.append(note);
 const shop=document.createElement('section');shop.style.cssText='margin:16px 0;padding:12px;border:1px solid #576986;border-radius:10px;background:#1d2b45';const shopTitle=document.createElement('strong');shopTitle.textContent='Glimmer 캐릭터 교환';shop.append(shopTitle);
 const shopDesc=document.createElement('p');shopDesc.textContent='4성 100 · 5성 300 Glimmer부터 시작합니다. 같은 캐릭터를 교환할 때마다 다음 가격이 20씩 상승합니다. 최대 패싯은 구매할 수 없습니다.';shop.append(shopDesc);
 const browse=document.createElement('div');browse.style.cssText='margin-top:10px';
 const runInput=document.createElement('input');runInput.placeholder='가챠포지 Run ID';runInput.autocomplete='off';runInput.style.cssText=baseStyle+'width:100%;box-sizing:border-box';
 const secretInput=document.createElement('input');secretInput.type='password';secretInput.placeholder='구매 전용 관리자 비밀키 (저장되지 않음)';secretInput.autocomplete='off';secretInput.style.cssText=baseStyle+'width:100%;margin-top:8px;box-sizing:border-box';
 const browseButton=document.createElement('button');browseButton.textContent='캐릭터 및 잔액 새로고침';browseButton.style.cssText=baseStyle+'cursor:pointer;margin-top:8px;width:100%';
 const shopStatus=document.createElement('p');shopStatus.setAttribute('role','status');shopStatus.textContent='먼저 Run ID를 입력해 목록을 조회해 주세요. 구매는 서버에서 별도로 활성화해야 합니다.';
 const results=document.createElement('div');results.style.cssText='max-height:240px;overflow:auto';results.setAttribute('aria-live','polite');
 browse.append(runInput,secretInput,browseButton,shopStatus,results);shop.append(browse);shopSection.append(shop);
 let pendingPurchase=null,shopBusy=false;
 async function browseCatalog(){const rid=runInput.value.trim();if(!rid){shopStatus.textContent='Run ID를 입력해 주세요.';return;}if(shopBusy)return;shopBusy=true;browseButton.disabled=true;shopStatus.textContent='목록을 조회하고 있습니다…';results.replaceChildren();
  try{const response=await fetch('/api/gacha-forge/gf-customizer/exchange/catalog',{method:'POST',credentials:'same-origin',headers:privilegedHeaders(true),body:JSON.stringify({runId:rid})});const payload=await response.json();if(!response.ok||!payload.ok)throw Error(payload.error||'조회 실패');
   const enabled=payload.exchangeEnabled===true;shopStatus.textContent='Glimmer '+Number(payload.glimmer||0).toLocaleString('ko-KR')+' · '+payload.characters.length+'명'+(enabled?' · 구매 가능':' · 구매 비활성화');
   for(const ch of payload.characters){const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #576986;padding:9px 0';const desc=document.createElement('div');const name=document.createElement('strong');name.textContent=(ch.rarity||'?')+'성 '+(ch.name||ch.id);const info=document.createElement('div');info.textContent=(ch.owned?'보유 · Facet '+ch.facet+'/'+ch.maxFacet:'미보유')+' · 교환 '+ch.exchangeCount+'회 · '+ch.price+' Glimmer';info.style.cssText='font-size:12px;color:#c6d4ea';desc.append(name,info);
    const action=document.createElement('button');action.type='button';action.disabled=!enabled||ch.maxed||Number(payload.glimmer)<ch.price;action.textContent=ch.maxed?'최대 돌파':!enabled?'구매 비활성화':Number(payload.glimmer)<ch.price?'잔액 부족':'교환';action.style.cssText=baseStyle+'cursor:pointer;flex-shrink:0';line.append(desc,action);results.append(line);
    action.onclick=async()=>{if(shopBusy||action.disabled)return;const secret=secretInput.value;if(secret.length<24){shopStatus.textContent='구매 전용 비밀키를 입력해 주세요 (최소 24자).';return;}if(!window.confirm(ch.name+' 캐릭터를 '+ch.price+' Glimmer로 교환할까요?'))return;
     const key=rid+'|'+ch.id; if(!pendingPurchase||pendingPurchase.key!==key)pendingPurchase={key,requestId:crypto.randomUUID()};
     shopBusy=true;browseButton.disabled=true;action.disabled=true;shopStatus.textContent='구매 요청 중…';
     try{const response=await fetch('/api/gacha-forge/gf-customizer/exchange',{method:'POST',credentials:'same-origin',headers:privilegedHeaders(true),body:JSON.stringify({runId:rid,characterId:ch.id,requestId:pendingPurchase.requestId,secret})});const result=await response.json();if(!response.ok||!result.ok){if(result.error!=='write-conflict')pendingPurchase=null;throw Error(result.error||'구매 실패');}
      pendingPurchase=null;shopStatus.textContent=result.replayed?'기존 구매 요청 결과가 확인됐습니다.':'교환이 완료됐습니다.';shopBusy=false;await browseCatalog();
     }catch(e){shopStatus.textContent='구매 확인 필요: '+e.message+' · 응답이 불명확하면 같은 캐릭터의 교환 버튼으로 같은 요청 ID를 재시도할 수 있습니다.';}finally{shopBusy=false;browseButton.disabled=false;action.disabled=false;}
    };
   }
  }catch(e){shopStatus.textContent='조회 실패: '+e.message;}finally{shopBusy=false;browseButton.disabled=false;}
 }
 function applyObservedRun(id){
   if(!runInput||!id)return;
   if(runInput.value.trim()!==id){runInput.value=id;pendingPurchase=null;results.replaceChildren();}
   runInput.hidden=true;
   // An observed run is known from successful game traffic; never guess one.
   if(activePane===shopSection.closest('[data-screen]')||nativeView==='shop')browseCatalog();
 }
 observedRunListener=applyObservedRun;
 if(observedRunId)applyObservedRun(observedRunId);
 browseButton.onclick=()=>{pendingPurchase=null;if(observedRunId)runInput.value=observedRunId;browseCatalog();};

 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='서버 연결 확인 전';
 const inputs={};for(let [id,[label,min,max]] of Object.entries(fields)){const line=document.createElement('label');line.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin:10px 0';const text=document.createElement('span');text.textContent=label;const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=1;input.style.cssText=baseStyle+'width:92px;';inputs[id]=input;line.append(text,input);settingSection.append(line);}
 const guarantee=document.createElement('label');const toggle=document.createElement('input');toggle.type='checkbox';guarantee.append(toggle,document.createTextNode(' 픽업 5성 확정'));settingSection.append(guarantee);
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px';const refresh=document.createElement('button');refresh.textContent='서버 값 불러오기';const save=document.createElement('button');save.textContent='서버에 적용';for(const b of [refresh,save])b.style.cssText=baseStyle+'cursor:pointer;flex:1';actions.append(refresh,save);settingSection.append(actions,status);
 async function load(){status.textContent='연결 중…';try{values=await request('GET');for(const [id,input] of Object.entries(inputs))input.value=values[id];toggle.checked=values.featuredGuarantee;status.textContent='서버 설정을 불러왔습니다.';}catch(e){status.textContent='서버 패치 미연결: '+e.message;}}
 refresh.onclick=load;save.onclick=async()=>{const next={};for(let[id,input]of Object.entries(inputs)){const n=Number(input.value),[label,min,max]=fields[id];if(!Number.isInteger(n)||n<min||n>max){status.textContent=label+' 값이 허용 범위를 벗어났습니다.';return;}next[id]=n;}next.featuredGuarantee=toggle.checked;status.textContent='서버에 저장 중…';try{values=await request('POST',{settings:next});status.textContent='서버 저장이 완료되었습니다. 이후 뽑기에 적용됩니다.';}catch(e){status.textContent='서버 저장 실패: '+e.message;}};
 button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)load()};document.body.append(button,panel);button.hidden=true;panel.hidden=true;mountNative();observeHost();}
 function gameScreens(){const roots=[document],seen=new Set(),screens=[];for(let i=0;i<roots.length&&i<80;i++){const root=roots[i];if(seen.has(root))continue;seen.add(root);try{for(const screen of root.querySelectorAll('[data-screen="settings"],[data-screen="shop"]'))screens.push(screen);for(const el of root.querySelectorAll('*'))if(el.shadowRoot&&((el.id||'').includes('gacha')||(el.className&&typeof el.className==='string'&&el.className.includes('gacha'))||i===0))roots.push(el.shadowRoot);}catch{}}return screens.filter(el=>el.isConnected);}
 function restorePane(){for(const [el,display] of hiddenNodes)if(el.isConnected)el.style.display=display;hiddenNodes=[];if(panel&&panel.parentElement&&panel.parentElement!==document.body)document.body.append(panel);if(panel)panel.hidden=true;activePane=null;}
 function showPane(pane){if(activePane!==pane){restorePane();activePane=pane;for(const el of Array.from(pane.children)){if(el===panel)continue;hiddenNodes.push([el,el.style.display]);el.style.display='none';}pane.append(panel);}panel.hidden=false;}
 function scheduleMount(){if(disposed||scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;mountNative();},120);}
 function observeHost(){if(disposed)return;const screen=gameScreens().find(s=>s.getClientRects().length);const root=screen?.getRootNode();const next=(root&&root.nodeType===11)?root:(document.querySelector('[data-gacha-forge],#gacha-forge-root,[class*="gacha-forge"]')||document.body);if(host===next&&observer)return;observer?.disconnect();host=next;observer=new MutationObserver(records=>{if(disposed)return;let changed=false;for(const record of records){if(panel&&(panel.contains(record.target)||record.target===panel))continue;if(record.type==='childList'||record.attributeName==='data-screen'||record.attributeName==='style'||record.attributeName==='class'){changed=true;break;}}if(changed)scheduleMount();});observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['data-screen','class','style']});}
 function nativeButton(sample,text,label){const b=sample?sample.cloneNode(false):document.createElement('button');b.removeAttribute('data-view');b.removeAttribute('data-shop-cat');b.removeAttribute('disabled');b.removeAttribute('id');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.setAttribute('data-gf-customizer-tab','');b.style.setProperty('font-size','13px','important');b.style.setProperty('line-height','1.45','important');b.style.setProperty('min-height','38px');b.style.cursor='pointer';return b;}
 function mountNative(){if(disposed||!panel)return;button.hidden=true;let screens=gameScreens();let screen=screens.find(s=>s.getClientRects().length)||null;if(!screen){restorePane();nativeView='';return;}let type=screen.getAttribute('data-screen');if(type!==lastScreen){nativeView='';lastScreen=type;}const rail=screen.querySelector(type==='settings'?'.st-rail':'.sh-rail');const pane=screen.querySelector(type==='settings'?'.st-pane':'.sh-pane');if(!rail||!pane)return;
 let tab=rail.querySelector('[data-gf-customizer-tab]');if(!tab){const sample=rail.querySelector(type==='settings'?'.st-sect':'[data-shop-cat]');tab=nativeButton(sample,type==='settings'?'가챠 커스터마이저':'Glimmer 교환',type==='settings'?'가챠 설정':'Glimmer 교환');rail.append(tab);tab.addEventListener('click',e=>{e.stopPropagation();nativeView=type;mountNative();});}
 if(!tab.dataset.gfBound){tab.dataset.gfBound='1';rail.addEventListener('click',e=>{if(!e.target.closest('[data-gf-customizer-tab]')){nativeView='';restorePane();}},true);}
 if(nativeView!==type){restorePane();return;}
 if(type==='settings')tabSettingsClick();else tabShopClick();
 tab.setAttribute('aria-selected','true');for(const original of rail.querySelectorAll('[aria-selected="true"]'))if(original!==tab)original.setAttribute('aria-selected','false');
 showPane(pane);
 panel.hidden=false;panel.style.cssText=baseStyle+'position:relative!important;inset:auto!important;width:100%!important;max-width:100%!important;max-height:100%!important;overflow-y:auto!important;box-shadow:none!important;margin:0!important;padding:12px!important;z-index:1!important;';const header=panel.querySelector('strong');if(header)header.style.fontSize='16px';}
 function tabSettingsClick(){const b=panel&&[...panel.querySelectorAll('button')].find(el=>el.textContent==='설정');if(b)b.click();const tabBar=panel&&panel.children[1];if(tabBar)tabBar.hidden=true;const close=panel&&panel.querySelector('button');if(close&&close.textContent==='닫기')close.hidden=true;}
 function tabShopClick(){if(observedRunId&&typeof observedRunListener==='function')observedRunListener(observedRunId);const b=panel&&[...panel.querySelectorAll('button')].find(el=>el.textContent==='Glimmer 상점');if(b)b.click();const tabBar=panel&&panel.children[1];if(tabBar)tabBar.hidden=true;const close=panel&&panel.querySelector('button');if(close&&close.textContent==='닫기')close.hidden=true;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 const navigation=()=>scheduleMount();window.addEventListener('hashchange',navigation);window.addEventListener('popstate',navigation);
 // Infrequent fallback only when the game's root is replaced; no 700ms full DOM polling.
 interval=setInterval(()=>{if(disposed)return;if(!panel||!panel.isConnected)init();if(!host||!host.isConnected)observeHost();scheduleMount();},12000);
 window[KEY]=()=>{disposed=true;clearInterval(interval);observer?.disconnect();window.removeEventListener('hashchange',navigation);window.removeEventListener('popstate',navigation);restorePane();for(const t of document.querySelectorAll('[data-gf-customizer-tab]'))t.remove();button?.remove();panel?.remove();delete window[KEY];};
})();