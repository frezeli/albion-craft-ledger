/* ════════ settings ════════ */
function renderSettings(){
  let html='<div class="h"></div>'+TIERS.map(t=>`<div class="h">T${t}</div>`).join('');
  RAW_KEYS.forEach(fam=>{ html+=`<div class="rl">${RAWMAP[fam][0]}</div>`; TIERS.forEach(t=>{const k=fam+'|'+t,v=state.gatherRates[k]; html+=`<input type="number" min="1" data-rate="${k}" value="${v!=null?v:''}" placeholder="${DEFAULT_RATES[t]||100}">`;}); });
  $('rateGrid').innerHTML=html;
}

/* ════════ chrome / render ════════ */
let current='ledger';
function renderMast(){
  const s=state.settings, lr=state.lastRefresh;
  const when=lr&&lr.server===s.server?`prices ${ago(lr.at)}`:'prices not refreshed';
  const tlab=s.tier==='all'?'all tiers':'T'+s.tier;
  const elab=s.enchant==='all'?' ·.all':(s.enchant?'.'+s.enchant:'');
  $('mastStatus').innerHTML=`${{europe:'Europe',west:'Americas',east:'Asia'}[s.server]} · ${cityLabel(s.city)} · ${tlab}${elab} · ${when}`;
  $('refreshStatus').textContent=lr&&lr.server===s.server?ago(lr.at):'';
}
function renderEnchNote(){
  const s=state.settings, n=$('enchNote');
  if(s.enchant==='all'){ n.textContent='Showing every enchant level (.0–.4) as its own row — the top of the list is the overall best, regardless of enchant.'; n.classList.remove('hidden'); return; }
  if(s.enchant && ['food','potions','tools','mounts','raw','artifacts','other'].includes(s.ledgerTab)){
    n.textContent=`The ${CAT_LABELS[s.ledgerTab]||'this'} category doesn't enchant — showing base (.0) items. Enchant applies to weapons, armour and resources.`; n.classList.remove('hidden');
  } else if(s.enchant){ n.textContent=`Enchant .${s.enchant}: costs use enchanted materials, and craftable counts assume your on-hand materials match .${s.enchant}.`; n.classList.remove('hidden'); }
  else n.classList.add('hidden');
}
function renderCityNote(){
  const n=$('cityNote'); if(!n)return;
  n.classList.add('hidden');   // All-cities mode removed; craft + sell are both the selected city
}
function syncControls(){
  const s=state.settings;
  $('selServer').value=s.server; $('selCity').value=s.city;
  $('chkPremium').checked=s.premium; $('chkCraftable').checked=s.craftableOnly; $('chkSuspicious').checked=s.hideSuspicious; $('inpReturn').value=s.returnRate; $('selSort').value=s.sortMode;
  $('selLedgerCat').value=s.ledgerTab; $('selTier').value=String(s.tier); $('selEnch').value=String(s.enchant);
  $('selInvCat').value=s.invTab;
  document.querySelectorAll('#segSell button').forEach(b=>b.classList.toggle('on',b.dataset.sell===s.sellMethod));
  renderEnchNote(); renderCityNote();
}
function renderActive(){ syncControls(); renderMast(); if(current==='ledger')renderLedger(); else if(current==='flips')renderFlips(); else if(current==='inventory')renderInventory(); else if(current==='tracking')renderTracking(); else if(current==='settings')renderSettings(); }

/* ════════ export / import ════════ */
function exportData(){const blob=new Blob([JSON.stringify(state,null,1)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='albion-ledger-backup-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); toast('Ledger exported');}
function importData(file){const fr=new FileReader(); fr.onload=()=>{try{const p=JSON.parse(fr.result); if(!p||typeof p.settings!=='object'||typeof p.inventory!=='object')throw 0; if(!confirm('Replace ALL current ledger data with this backup?'))return; state=merge(p); save(); colSort=null; renderActive(); toast('Ledger imported');}catch(e){toast('Import failed — not a valid ledger backup');}}; fr.readAsText(file);}

/* ════════ init controls ════════ */
// grouped category <select> options — "All" first, then Naz's optgroup tree
function catSelectOptions(){
  let h=`<option value="all">All categories</option>`;
  for(const [group,leaves] of CAT_GROUPS){
    h+=`<optgroup label="${group}">`;
    for(const [key,label] of leaves) h+=`<option value="${key}">${label}</option>`;
    h+=`</optgroup>`;
  }
  return h;
}
const tierSelectOptions=()=>`<option value="all">All tiers</option>`+TIERS.map(t=>`<option value="${t}">T${t}</option>`).join('');
const enchSelectOptions=()=>`<option value="all">All enchants</option>`+[0,1,2,3,4].map(e=>`<option value="${e}">.${e}</option>`).join('');
function initControls(){
  $('selCity').innerHTML=CITIES.map(c=>`<option value="${c}">${cityLabel(c)}</option>`).join('');
  const cat=catSelectOptions(), tier=tierSelectOptions(), ench=enchSelectOptions();
  $('selLedgerCat').innerHTML=cat; $('selTier').innerHTML=tier; $('selEnch').innerHTML=ench;
  $('flipCat').innerHTML=cat; $('selFlipTier').innerHTML=tier; $('selFlipEnch').innerHTML=ench;
  $('selInvCat').innerHTML=cat;
}

/* ════════ events ════════ */
document.addEventListener('click',ev=>{
  const b=ev.target.closest('button'); if(!b)return;
  if(b.dataset.view){document.querySelectorAll('nav#nav button').forEach(x=>x.classList.toggle('active',x===b)); document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+b.dataset.view)); current=b.dataset.view; renderActive(); return;}
  if(b.dataset.sell){state.settings.sellMethod=b.dataset.sell; save(); syncControls(); renderLedger(); return;}
  if(b.dataset.fmode){state.settings.flipMode=b.dataset.fmode; flipColSort=null; save(); renderFlips(); return;}
  if(b.id==='btnScanFlips'){scanFlips(); return;}
  if(b.id==='addCancel'){closeAddModal(); return;}
  if(b.id==='addConfirm'){confirmAdd(); return;}
  if(b.dataset.havrm){const [id,ql]=b.dataset.havrm.split('|'); setInvQ(id,ql,0); save(); renderHave(); renderCatalog(); return;}
  if(b.dataset.track){const id=b.dataset.track; const was=isTracked(id); if(was)state.tracked=state.tracked.filter(t=>t.id!==id); else state.tracked.push({id,qty:1}); save(); renderLedger(); if(currentModalId===id&&$('itemModal').classList.contains('open'))openItemModal(id); toast(was?'Untracked '+nameOf(id):'Tracking '+nameOf(id)); return;}
  if(b.dataset.untrack){state.tracked=state.tracked.filter(t=>t.id!==b.dataset.untrack); save(); renderTracking(); return;}
  if(b.dataset.texp){const p=b.dataset.texp; if(expanded.has(p))expanded.delete(p); else expanded.add(p); renderTracking(); return;}
  if(b.id==='btnRefresh'){doRefresh(); return;}
  if(b.id==='btnExport'){exportData(); return;}
  if(b.id==='btnImport'){$('fileImport').click(); return;}
  if(b.id==='btnReset'){if(confirm('Erase ALL ledger data — inventory, tracking, prices, rates? Cannot be undone.')){state=defaultState(); save(); colSort=null; expanded.clear(); renderActive(); toast('Ledger wiped clean');} return;}
});
document.addEventListener('click',ev=>{const th=ev.target.closest('th[data-sortcol]'); if(!th)return; const key=th.dataset.sortcol; colSort=colSort&&colSort.key===key?{key,dir:-colSort.dir}:{key,dir:1}; renderLedger();});
// toggle the per-item city/Black-Market compare panel (ignore clicks on the ⚑ button or Sell input)
// click a ledger row → open the item detail modal (recipe + all-city + Black Market)
document.addEventListener('click',ev=>{ if(ev.target.closest('button,input,select'))return; const ex=ev.target.closest('[data-expand]'); if(!ex)return; openItemModal(ex.dataset.expand);});
// item modal: close on ✕, backdrop click, or Escape
$('itemModalClose').addEventListener('click',closeItemModal);
// close on backdrop click, but ignore the stray click that can land on the freshly-shown
// overlay in the same instant a row opened it (guard by a short grace window)
$('itemModal').addEventListener('click',ev=>{if(ev.target.id==='itemModal'&&Date.now()-_imOpenedAt>350)closeItemModal();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if($('itemModal').classList.contains('open'))closeItemModal(); else if($('addModal').classList.contains('open'))closeAddModal();}});
document.addEventListener('click',ev=>{const th=ev.target.closest('th[data-fsort]'); if(!th)return; const k=th.dataset.fsort; flipColSort=flipColSort&&flipColSort.k===k?{k,dir:-flipColSort.dir}:{k,dir:1}; renderFlips();});
document.addEventListener('change',ev=>{
  const el=ev.target;
  if(el.id==='selServer'){state.settings.server=el.value; save(); renderActive(); autoRefresh(); return;}
  if(el.id==='selCity'){state.settings.city=el.value; save(); renderActive(); refreshTrends().then(()=>{save(); if(current==='ledger')renderLedger();}); autoRefresh(); return;}
  if(el.id==='chkPremium'){state.settings.premium=el.checked; save(); renderLedger(); return;}
  if(el.id==='chkCraftable'){state.settings.craftableOnly=el.checked; save(); renderLedger(); return;}
  if(el.id==='chkSuspicious'||el.id==='chkFlipSuspicious'){state.settings.hideSuspicious=el.checked; save(); if(current==='flips')renderFlips(); else renderLedger(); syncControls(); return;}
  if(el.id==='selLedgerCat'){state.settings.ledgerTab=el.value; colSort=null; save(); renderLedger(); syncControls(); renderMast(); autoRefresh(); return;}
  if(el.id==='selTier'){state.settings.tier=el.value==='all'?'all':+el.value; save(); renderLedger(); syncControls(); renderMast(); autoRefresh(); return;}
  if(el.id==='selEnch'){state.settings.enchant=el.value==='all'?'all':+el.value; save(); renderLedger(); syncControls(); renderMast(); autoRefresh(); return;}
  if(el.id==='selFlipTier'){state.settings.flipTier=el.value==='all'?'all':+el.value; save(); renderFlips(); return;}
  if(el.id==='selFlipEnch'){state.settings.flipEnch=el.value==='all'?'all':+el.value; save(); renderFlips(); return;}
  if(el.id==='selInvCat'){state.settings.invTab=el.value; save(); renderCatalog(); syncControls(); return;}
  if(el.id==='inpReturn'){state.settings.returnRate=Math.min(90,Math.max(0,+el.value||0)); save(); renderActive(); syncControls(); return;}
  if(el.id==='selSort'){state.settings.sortMode=el.value; colSort=null; save(); renderLedger(); return;}
  if(el.id==='flipCat'){state.settings.flipCat=el.value; save(); renderFlips(); return;}
  if(el.id==='flipMin'){state.settings.flipMinProfit=Math.max(0,Math.floor(+el.value||0)); save(); renderFlips(); return;}
  if(el.id==='inpSilver'){state.silver=Math.max(0,Math.floor(+el.value||0)); save(); if(current==='tracking')renderTrackAgg(); return;}
  if(el.id==='fileImport'){if(el.files[0])importData(el.files[0]); el.value=''; return;}
  if(el.dataset.priceov){const k=el.dataset.priceov+'|'+homeCity(),v=Math.floor(+el.value); if(!el.value||v<=0)delete state.manualPrices[k]; else state.manualPrices[k]=v; save(); renderLedger(); return;}
  if(el.dataset.havq){setInvQ(el.dataset.havq,el.dataset.hq,+el.value); save(); renderHave(); renderCatalog(); return;}
  if(el.id==='addTier'||el.id==='addEnch'||el.id==='addQual'){updateAddIcon(); return;}
  if(el.dataset.trackqty!=null){const i=+el.dataset.trackqty; state.tracked[i].qty=Math.max(1,Math.floor(+el.value||1)); save(); renderTracking(); return;}
  if(el.dataset.rate){const v=+el.value; if(!el.value||v<=0)delete state.gatherRates[el.dataset.rate]; else state.gatherRates[el.dataset.rate]=v; save(); if(current==='tracking')renderTrackAgg(); return;}
});
$('inpFilter').addEventListener('input',()=>renderLedger());
$('flipFilter').addEventListener('input',()=>renderFlips());
$('catFilter').addEventListener('input',()=>renderCatalog());
$('haveFilter').addEventListener('input',()=>renderHave());
// catalog cells are divs — open the add modal on click (separate from the button handler)
document.addEventListener('click',ev=>{const cell=ev.target.closest('[data-addfam]'); if(cell)openAddModal(cell.dataset.addfam);});
$('addModal').addEventListener('click',ev=>{if(ev.target.id==='addModal')closeAddModal();});
// track-search: quick add
$('trackSearch').addEventListener('input',function(){
  const q=this.value.trim().toLowerCase(); const box=$('trackResults');
  if(q.length<2){box.classList.add('hidden'); return;}
  const s=state.settings, hits=[];
  for(const base in DATA){const it=DATA[base]; if(!it.b&&!it.e)continue; if(!it.nm.toLowerCase().includes(q))continue; hits.push(base); if(hits.length>=40)break;}
  box.innerHTML='<option value="">— add to tracking —</option>'+hits.map(b=>`<option value="${withE(b,s.enchant&&isEnchantable(b)&&DATA[b].e&&DATA[b].e[s.enchant]?s.enchant:0)}">${DATA[b].nm} (T${DATA[b].t})</option>`).join('');
  box.classList.remove('hidden');
});
$('trackResults').addEventListener('change',function(){const id=this.value; if(id&&!isTracked(id)){state.tracked.push({id,qty:1}); save(); renderTracking(); toast('Tracking '+nameOf(id));} this.classList.add('hidden'); $('trackSearch').value='';});

/* ════════ boot ════════ */
buildFamilies(); initControls(); renderActive();
setInterval(renderMast,60000);
(function(){const s=state.settings; const anyCached=ledgerItems().some(id=>priceEntry(id)); if(!anyCached&&navigator.onLine!==false)doRefresh();})();