/* ════════ INVENTORY — "What You Have" (left) ════════ */
function haveRows(){
  const filter=($('haveFilter').value||'').trim().toLowerCase();
  const rows=[];
  for(const fullId in state.inventory){
    const q=state.inventory[fullId];
    for(const ql in q){ const c=q[ql]; if(c>0){ if(filter && !nameOf(fullId).toLowerCase().includes(filter)) continue; rows.push({fullId,ql,c}); } }
  }
  rows.sort((a,b)=>nameOf(a.fullId).localeCompare(nameOf(b.fullId))||(+a.ql)-(+b.ql));
  return rows;
}
function renderHave(){
  const rows=haveRows();
  let html='';
  rows.forEach(r=>{
    const qm=QUAL.find(x=>x[0]===r.ql), cls=qm?qm[2]:'q1', qn=qm?qm[1]:r.ql;
    html+=`<div class="haverow">${iconHtml(r.fullId,36,{q:+r.ql})}
      <div class="meta"><span class="nm">${nameOf(r.fullId)}</span><span class="fam"><span class="qdot ${cls}"></span>${qn} · T${tierOf(r.fullId)}</span></div>
      <input type="number" min="0" data-havq="${r.fullId}" data-hq="${r.ql}" value="${r.c}">
      <button class="rm" data-havrm="${r.fullId}|${r.ql}" title="remove">✕</button></div>`;
  });
  $('haveList').innerHTML=html||'<div class="foot">Nothing owned yet. Pick items from the right to add them here.</div>';
  $('haveFoot').textContent=rows.length?`${rows.length} stack${rows.length===1?'':'s'} owned.`:'';
}

/* ════════ INVENTORY — catalog to add from (right) ════════ */
function catFamilies(){
  const tab=state.settings.invTab, filter=($('catFilter').value||'').trim().toLowerCase();
  const out=[];
  for(const key in FAMILIES){ const f=FAMILIES[key];
    if(tab!=='All' && f.cat!==tab) continue;
    if(filter && !f.name.toLowerCase().includes(filter)) continue;
    out.push(f);
  }
  out.sort((a,b)=>a.name.localeCompare(b.name));
  return out;
}
const famTiers=f=>Object.keys(f.tiers).map(Number).sort((a,b)=>a-b);
const famRep=f=>f.tiers[famTiers(f)[0]];
function famOwned(f){ let n=0; for(const t in f.tiers){ const base=f.tiers[t]; for(let e=0;e<=4;e++) n+=invTotal(withE(base,e)); } return n; }
function renderCatalog(){
  const fams=catFamilies(), shown=fams.slice(0,INV_CAP);
  let html='';
  shown.forEach(f=>{
    const owned=famOwned(f), ts=famTiers(f);
    html+=`<div class="invcell catcell${owned?' owned':''}" data-addfam="${f.key}">
      <div class="top">${iconHtml(famRep(f),38)}<span class="nm">${f.name}</span>${owned?`<span class="tot">${owned}</span>`:''}</div>
      <div class="tierbadge">T${ts[0]}${ts.length>1?'–T'+ts[ts.length-1]:''}${f.ench?' · ✦ enchantable':''}</div></div>`;
  });
  $('catGrid').innerHTML=html||'<div class="foot">No items match. Try another category or search.</div>';
  $('catFoot').textContent=fams.length>INV_CAP?`Showing ${INV_CAP} of ${fams.length} — search to narrow.`:`${fams.length} item type${fams.length===1?'':'s'}.`;
}

/* ════════ INVENTORY — add modal ════════ */
let addFam=null;
function openAddModal(key){
  const f=FAMILIES[key]; if(!f)return; addFam=f;
  $('addTier').innerHTML=famTiers(f).map(t=>`<option value="${t}">T${t}</option>`).join('');
  $('addEnch').innerHTML=(f.ench?[0,1,2,3,4]:[0]).map(e=>`<option value="${e}">.${e}</option>`).join('');
  $('addEnch').disabled=!f.ench;
  $('addQual').innerHTML=QUAL.map(([qn,ql])=>`<option value="${qn}">${ql}</option>`).join('');
  $('addQty').value=1;
  updateAddIcon();
  $('addModal').classList.add('open');
}
function curAddId(){ const f=addFam; if(!f)return null; const base=f.tiers[+$('addTier').value]; if(!base)return null; return withE(base,+$('addEnch').value||0); }
function updateAddIcon(){
  const f=addFam; if(!f)return; const id=curAddId(); const t=+$('addTier').value, e=+$('addEnch').value||0, q=+($('addQual').value||1);
  $('addIcon').innerHTML=`${iconHtml(id,44,{q})}<div><span class="nm">${f.name}</span><span class="fam">T${t}${e?' · .'+e:''} · own ${fmt(invTotal(id))} in total</span></div>`;
}
function closeAddModal(){ $('addModal').classList.remove('open'); addFam=null; }
function confirmAdd(){
  const f=addFam; if(!f)return; const id=curAddId(); if(!id)return;
  const ql=$('addQual').value, qty=Math.max(1,Math.floor(+$('addQty').value||1));
  setInvQ(id,ql,(invQ(id)[ql]||0)+qty);
  save(); closeAddModal(); renderHave(); renderCatalog();
  const qm=QUAL.find(x=>x[0]===ql);
  toast(`Added ${qty} × ${nameOf(id)}${qm?' ('+qm[1]+')':''}`);
}

function renderInventory(){ $('inpSilver').value=state.silver||0; renderHave(); renderCatalog(); }

