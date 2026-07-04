/* ════════ TRACKING (recursive tree) ════════ */
const expanded=new Set(); // node path strings
function nodeHtml(fullId,need,rr,path,depth){
  const rec=recipeOf(fullId);
  const have=invTotal(fullId);
  const needR=Math.ceil(need);
  const ok=have>=needR;
  const isLeaf=!rec;
  const open=expanded.has(path);
  const artifactChild=false;
  let row=`<div class="tnode-row">
    <button class="toggle${isLeaf?' leaf':''}" ${isLeaf?'':`data-texp="${path}"`}>${isLeaf?'•':(open?'−':'+')}</button>
    ${iconHtml(fullId,30)}
    <div class="lbl">${nameOf(fullId)}<span class="sub">${isLeaf?(rawFamily(fullId)?'raw · gather':'buy at market'):'craftable'}</span></div>
    <span class="hn ${ok?'ok':'short'}" title="have / needed">${fmt(have)} / ${fmt(needR)}</span>
  </div>`;
  let children='';
  if(open && rec){
    // only the shortfall must actually be crafted
    const toCraft=Math.max(0,needR-have);
    const crafts=Math.ceil(toCraft/(rec.o||1));
    children='<div class="tnode-children">';
    rec.r.forEach((ing,idx)=>{
      const childNeed=crafts*ing.n*(ing.a?1:(1-rr));
      children+=`<div class="tnode">`+nodeHtml(ing.id,childNeed,rr,path+'>'+idx+':'+ing.id,depth+1)+`</div>`;
    });
    children+='</div>';
  }
  return row+children;
}
function renderTracking(){
  const s=state.settings, rr=s.returnRate/100;
  if(!state.tracked.length){ $('trackList').innerHTML='<div class="foot">Nothing tracked yet. Use the ⚑ button on any Ledger row, or search above.</div>'; $('trackAgg').innerHTML=''; return; }
  let html='';
  state.tracked.forEach((t,ti)=>{
    html+=`<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line-soft)">
      <div class="tracked-head">
        ${iconHtml(t.id,40)}
        <div><span class="nm">${nameOf(t.id)}</span><span class="fam">${DATA[stripE(t.id)].c} · T${tierOf(t.id)}</span></div>
        <label class="f" style="margin-left:auto">Qty <input type="number" min="1" data-trackqty="${ti}" value="${t.qty}"></label>
        <button class="rmgoal" data-untrack="${t.id}" title="stop tracking">✕</button>
      </div>
      <div class="tnode">${nodeHtml(t.id,t.qty,rr,'root'+ti,0)}</div>
    </div>`;
  });
  $('trackList').innerHTML=html;
  renderTrackAgg();
}
/* aggregate raw-resource shortfalls across all tracked items + advisor */
function collectRaw(fullId,need,rr,acc){
  const rec=recipeOf(fullId);
  const have=invTotal(fullId);
  if(!rec){ // leaf
    if(rawFamily(fullId)){ acc[fullId]=(acc[fullId]||0)+Math.max(0,Math.ceil(need)-have); }
    return;
  }
  const toCraft=Math.max(0,Math.ceil(need)-have);
  if(toCraft<=0)return;
  const crafts=Math.ceil(toCraft/(rec.o||1));
  rec.r.forEach(ing=>collectRaw(ing.id,crafts*ing.n*(ing.a?1:(1-rr)),rr,acc));
}
function renderTrackAgg(){
  const s=state.settings, rr=s.returnRate/100, acc={}, city=homeCity();
  state.tracked.forEach(t=>collectRaw(t.id,t.qty,rr,acc));
  const entries=Object.entries(acc).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){ $('trackAgg').innerHTML='<div class="panel"><div class="gotit" style="text-align:center">✓ You already hold everything these recipes need.</div></div>'; return; }
  let html=`<div class="panel"><h2 class="ph">Raw materials still needed <small>combined across tracked items · adjusted for ${s.returnRate}% return</small></h2>`;
  entries.forEach(([fullId,short])=>{
    const fam=rawFamily(fullId), info=RAWMAP[fam];
    const p=cityPrice(fullId,city), rate=gatherRate(fam,tierOf(fullId));
    const hours=rate>0?short/rate:null;
    html+=`<div class="aggpanel"><div class="agghead">${iconHtml(fullId,30)}<span class="t">${nameOf(fullId)}</span></div>`;
    html+=`<div class="advisor">`;
    if(p){const cost=short*p.price, after=state.silver-cost;
      html+=`<div class="ln">Need <span class="mono">${fmt(short)}</span> more — buying now: <span class="mono">~${fmt(cost)} silver</span> <span class="mono dim">(${fmt(p.price)}/ea in ${cityLabel(city)}${p.manual?', manual':''})</span> → leaves <span class="mono ${after<0?'flagneg':''}">${fmt(after)}</span>${after<0?' <span class="flag bad" title="Buying this material would push your silver balance below zero">⚠ can’t cover</span>':''}</div>`;
    } else html+=`<div class="ln dim">Need ${fmt(short)} more — no live price in ${cityLabel(city)}; refresh or check in-game.</div>`;
    html+=`<div class="ln">Gathering yourself: <span class="mono">~${hours!=null?fmt1(hours):'—'} h</span> <span class="mono dim">at ${fmt(rate)}/h (T${tierOf(fullId)} ${info?info[0]:fam})</span></div></div>`;
    if(info){const t=tierOf(fullId); const zone=t<=3?'inner <b>safe zones</b> near the starter towns':t<=5?'outer <b>yellow zones</b> — some risk':'the <b>Outlands / black zones</b> — full-loot PvP, check the map';
      html+=`<div class="hint">${info[0]}: <b>${info[1]}</b> primary · <b>${info[2]}</b> secondary. T${t} → ${zone}.</div>`;}
    html+=`</div>`;
  });
  html+='</div>';
  $('trackAgg').innerHTML=html;
}
const gatherRate=(fam,tier)=>{const v=state.gatherRates[fam+'|'+tier]; return v!=null?v:(DEFAULT_RATES[tier]||100);};

