/* ════════ LEDGER ════════ */
let colSort=null;
let currentModalId=null; // fullId shown in the item detail modal, if open
let _imOpenedAt=0;       // timestamp the item modal was last opened (backdrop-close grace)
function ledgerItems(){
  const s=state.settings, tab=s.ledgerTab, ench=s.enchant, tierSel=s.tier;
  const rows=[];
  for(const base in DATA){
    const it=DATA[base];
    if(tierSel!=='all' && it.t!==tierSel) continue; // 'all' → every tier
    if(tab!=='all' && catOf(it)!==tab) continue;    // 'all' → every category
    if(!it.b && !(it.e)) continue;                  // must be craftable
    if(ench==='all'){                               // 'all' → each enchant as its own row
      if(it.b) rows.push(base);
      if(isEnchantable(base) && it.e){ for(let e=1;e<=4;e++) if(it.e[e]) rows.push(withE(base,e)); }
    } else if(!ench){                               // base (.0)
      if(it.b) rows.push(base);
    } else {                                        // a specific enchant level
      if(isEnchantable(base) && it.e && it.e[ench]) rows.push(withE(base,ench));
    }
  }
  return rows.filter(id=>recipeOf(id));
}
function computeLedger(){
  const s=state.settings, rr=s.returnRate/100, fee=feeRate(), city=s.city;
  _costCache={};
  return ledgerItems().map(fullId=>{
    // craft + sell both evaluated in the selected city
    const price=priceOf(fullId,city), sellCity=city;
    const net=price!=null?price*(1-fee):null;
    const cost=costToRaw(fullId,city,rr);
    const profit=(net!=null&&cost!=null)?net-cost:null;
    const margin=(profit!=null&&cost>0)?profit/cost*100:null;   // return on materials (ROI %)
    const craft=craftableCount(fullId,rr);
    const total=(profit!=null&&craft!=null)?profit*craft:null;
    const rec=recipeOf(fullId);
    let matUnits=0; rec.r.forEach(ing=>matUnits+=(ing.a?ing.n:ing.n*(1-rr)));
    const perMat=(profit!=null&&matUnits>0)?profit/matUnits:null;
    // hint when another city currently pays more for the finished item
    let best=null;
    const b=bestSellCity(fullId); if(b&&price!=null&&b.price>price&&b.city!==city)best={city:b.city,delta:b.price-price};
    const status=marketStatus(fullId,city);
    const trend=state.trendCache[s.server+'|'+fullId+'|'+city];
    const suspect=isSuspectPrice(fullId,price);
    return {fullId,rec,price,net,cost,profit,margin,craft,total,perMat,best,sellCity,status,suspect,trendPct:trend?trend.pct:null};
  });
}
let _ledgerCache=null;
function computeLedgerCached(){
  const s=state.settings;
  const sig=[s.server,s.city,s.tier,s.ledgerTab,s.enchant,s.premium,s.sellMethod,s.returnRate,dataVersion].join('|');
  if(_ledgerCache && _ledgerCache.sig===sig) return _ledgerCache.rows;
  const rows=computeLedger();
  _ledgerCache={sig,rows};
  return rows;
}
function orderLedger(rows){
  const s=state.settings, filter=($('inpFilter').value||'').trim().toLowerCase();
  let list=rows;
  if(filter)list=list.filter(r=>nameOf(r.fullId).toLowerCase().includes(filter));
  if(s.craftableOnly)list=list.filter(r=>r.craft>0);
  let hidden=0;
  if(s.hideSuspicious){ const before=list.length; list=list.filter(r=>!r.suspect); hidden=before-list.length; }
  const nv=x=>x==null||isNaN(x)?-Infinity:x;
  if(colSort){const{key,dir}=colSort; list.sort((a,b)=>(nv(b[key])-nv(a[key]))*dir);}
  else if(s.sortMode==='perCraft')list.sort((a,b)=>nv(b.profit)-nv(a.profit));
  else if(s.sortMode==='perMat')list.sort((a,b)=>nv(b.perMat)-nv(a.perMat));
  else list.sort((a,b)=>nv(b.total)-nv(a.total)||nv(b.profit)-nv(a.profit));
  return {list:list.slice(0,LEDGER_CAP),total:list.length,filtered:!!filter,hidden};
}
function recipeText(rec,rr){
  return rec.r.map(ing=>`<b>${ing.n}×</b> ${nameOf(ing.id)}${ing.a?' ✦':''}`).join(' · ');
}
function trendHtml(r){ if(r.trendPct==null)return''; const p=r.trendPct,cls=p>1?'up':p<-1?'dn':'fl',ch=p>1?'▲':p<-1?'▼':'–'; return `<span class="tr ${cls}" title="${p>0?'+':''}${p.toFixed(1)}% vs ~24h ago">${ch}</span>`; }
function statusBadge(st){
  switch(st&&st.kind){
    case 'soldout':    return `<span class="pmeta soldout badge" title="Buyers are bidding, but no one is selling here right now">⊘ sold out</span>`;
    case 'notforsale': return `<span class="pmeta dead badge" title="No sell or buy orders — no market for this here">✕ not for sale</span>`;
    case 'noscan':     return `<span class="pmeta noscan badge" title="Not scanned yet — press “Refresh prices”">◔ not scanned</span>`;
    case 'stale':      return `<span class="pmeta stale badge" title="Latest price is from an old scan — may be out of date">⚠ ${ago(st.date)} · stale</span>`;
    default: return '';
  }
}
function pmetaHtml(r){
  let o='', st=r.status;
  if(st&&st.kind==='manual')o+=`<span class="pmeta manual">✎ manual</span>`;
  else if(st&&st.kind==='ok')o+=`<span class="pmeta">${ago(st.date)}</span>`;
  else o+=statusBadge(st);
  if(r.best)o+=`<span class="flag good" title="Another city currently pays more for this finished item">best: ${cityLabel(r.best.city)} (+${fmt(r.best.delta)})</span>`;
  if(r.suspect)o+=`<span class="flag bad" title="This price is far above what the item sells for in other cities — probably a lone overpriced listing, not a real opportunity.">⚠ price outlier?</span>`;
  return o;
}
// small warn badge explaining a null price / cost, tooltip built from priceReason()
function noPriceFlag(fullId){
  const why=priceReason(fullId); if(!why)return '';
  return `<span class="flag warn" title="${why.replace(/"/g,'&quot;')}">no price data</span>`;
}
/* expandable panel: this item's price in every city + the Caerleon Black Market, best flip highlighted */
function compareHtml(fullId){
  const pe=priceEntry(fullId), fee=feeRate();
  if(!pe)return `<div class="cmp"><div class="cmp-flip dim">No market data yet — press “Refresh prices”.</div></div>`;
  const rows=CITIES.map(c=>{const cp=pe.cities[c]; return {c,sell:cp?cp.price:0,buy:cp?cp.buy:0};});
  const bs=bestSellCity(fullId);
  const buyable=rows.filter(r=>r.sell>0).sort((a,b)=>a.sell-b.sell);
  const cheapest=buyable[0]||null;
  const bm=pe.cities[BM_KEY]||null, bmBuy=bm?bm.buy:0, bmSell=bm?bm.price:0;
  const grid=rows.map(r=>{
    const hi=bs&&r.c===bs.city&&r.sell>0;
    return `<div class="cmp-cell${hi?' hi':''}"><span class="cmp-city">${cityLabel(r.c)}</span><span class="cmp-sell">${r.sell>0?fmt(r.sell):'<span class="dim">—</span>'}</span><span class="cmp-buy">${r.buy>0?fmt(r.buy):'·'}</span></div>`;
  }).join('');
  let bmLine;
  if(bmBuy>0&&cheapest){
    const gross=bmBuy*(1-fee), flip=gross-cheapest.sell;
    bmLine=`<div class="cmp-flip${flip>0?' good':''}"><b>Black Market flip:</b> buy in ${cityLabel(cheapest.c)} @ ${fmt(cheapest.sell)} → sell to Black Market @ ${fmt(bmBuy)} <span class="dim">(−${Math.round(fee*100)}% tax ≈ ${fmt(gross)})</span> → <span class="${flip>0?'pos':'neg'}">${flip>0?'+':''}${fmt(flip)}</span> each</div>`;
  } else if(bmBuy>0){
    bmLine=`<div class="cmp-flip"><b>Black Market</b> pays ~${fmt(bmBuy)} each${bmSell>0?` · lists at ${fmt(bmSell)}`:''} <span class="dim">(no royal-city listing to source from)</span></div>`;
  } else {
    bmLine=`<div class="cmp-flip dim">No Black Market buy orders scanned${bmSell>0?` · lists at ${fmt(bmSell)}`:''}.</div>`;
  }
  return `<div class="cmp"><div class="cmp-head"><span>City</span><span>Sell (list)</span><span>Buy (order)</span></div><div class="cmp-grid">${grid}</div>${bmLine}</div>`;
}
function isTracked(fullId){ return state.tracked.some(t=>t.id===fullId); }
const RANK_DESC={
  total:'<b>Total profit (from stock)</b> — profit per craft × how many you can craft right now from the materials in your Inventory. Ranks what makes you the most silver in total with what you already hold.',
  perCraft:'<b>Profit / craft</b> — sell price, minus market fees, minus the full craft-to-raw cost, for a single item. Ranks the most profitable item to make, ignoring how many you can make.',
  perMat:'<b>Value / material</b> — profit per craft ÷ the returnable material units each craft consumes. Ranks the best return on materials — useful when materials, not silver, are your bottleneck.'
};
function renderRankDesc(){
  const el=$('rankDesc'); if(!el)return;
  if(colSort){ el.innerHTML='Ranked by the <b>'+(colSort.dir>0?'':'')+'column you clicked</b> ('+ (colSort.dir>0?'high→low':'low→high') +'). Pick an option in <b>Rank</b> to return to a preset method.'; return; }
  el.innerHTML='Ranked by '+(RANK_DESC[state.settings.sortMode]||RANK_DESC.total);
}
function renderLedger(){
  const s=state.settings, rr=s.returnRate/100;
  renderRankDesc();
  renderCitySpec();
  const {list,total,filtered,hidden}=orderLedger(computeLedgerCached());
  const modeSorted=!colSort;
  const cols=[['','#'],['','Item',1],['price','Sell'],['net','Net'],['cost','Cost/craft'],['craft','Craftable'],['profit','Profit'],['total','Total'],['perMat','Per mat'],['margin','Margin'],['','⚑']];
  let thead='<tr>'+cols.map(c=>{const dir=colSort&&colSort.key===c[0]?(colSort.dir>0?' ▾':' ▴'):''; return `<th class="${c[2]?'l':''}" ${c[0]?`data-sortcol="${c[0]}"`:''}>${c[1]}${dir}</th>`;}).join('')+'</tr>';
  let trs='',cards='';
  list.forEach((r,i)=>{
    const top=modeSorted&&i===0&&r.profit!=null;
    const base=stripE(r.fullId), it=DATA[base], nm=it.nm, bonus=hasCityBonus(r.fullId);
    const star=bonus?'<span class="cellstar" title="This city gives a crafting bonus for this item">★</span>':'';
    const mCls=r.margin>0?'pos':r.margin<0?'neg':'';
    const mTxt=r.margin!=null?fmt(r.margin)+'%':'—';
    trs+=`<tr class="r${top?' top':''}">
     <td class="rk">${top?'<span class="star">★</span>':i+1}</td>
     <td><div class="itemcell" data-expand="${r.fullId}" title="Click for recipe, all-city prices & the Black Market">${iconHtml(r.fullId,null,{star:bonus})}${tierChipHtml(r.fullId)}<div><span class="nm">${nm}${star}</span><span class="fam">${it.c}</span></div></div></td>
     <td><div class="prwrap"><div class="prline">${trendHtml(r)}<input type="number" min="0" class="prin" data-priceov="${r.fullId}" value="${r.price!=null?r.price:''}" placeholder="—">${r.price==null?noPriceFlag(r.fullId):''}</div>${pmetaHtml(r)}</div></td>
     <td class="num">${fmt(r.net)}</td>
     <td class="num">${r.cost!=null?fmt(r.cost):'<span class="flag warn" title="'+((priceReason(r.fullId)||'A raw material in this recipe has no live market price yet — refresh prices.').replace(/"/g,'&quot;'))+'">need prices</span>'}</td>
     <td class="num">${r.craft!=null?fmt(r.craft):'—'}</td>
     <td class="num ${r.profit>0?'pos':r.profit<0?'neg':''}">${fmt(r.profit)}</td>
     <td class="num ${r.total>0?'pos':r.total<0?'neg':''}">${fmt(r.total)}</td>
     <td class="num">${fmt1(r.perMat)}</td>
     <td class="num ${mCls}">${mTxt}</td>
     <td><button class="trackbtn${isTracked(r.fullId)?' on':''}" data-track="${r.fullId}" title="track this item">⚑</button></td></tr>`;
    cards+=`<div class="card${top?' top':''}">
     <div class="head" data-expand="${r.fullId}" title="Tap for recipe & all-city prices">${iconHtml(r.fullId,44,{star:bonus})}${tierChipHtml(r.fullId)}<div><span class="nm">${nm}${star}</span><span class="fam">${it.c}</span></div><button class="trackbtn${isTracked(r.fullId)?' on':''}" data-track="${r.fullId}" style="margin-left:auto">⚑</button></div>
     <div class="prline"><span class="fam">Sell:</span>${trendHtml(r)}<input type="number" min="0" class="prin" data-priceov="${r.fullId}" value="${r.price!=null?r.price:''}" placeholder="—">${r.price==null?noPriceFlag(r.fullId):''}${pmetaHtml(r)}</div>
     <div class="stats">
       <div class="st"><span class="k">Cost/craft</span><span class="v">${r.cost!=null?fmt(r.cost):'—'}</span></div>
       <div class="st"><span class="k">Craftable</span><span class="v">${r.craft!=null?fmt(r.craft):'—'}</span></div>
       <div class="st"><span class="k">Profit</span><span class="v ${r.profit>0?'pos':r.profit<0?'neg':''}">${fmt(r.profit)}</span></div>
       <div class="st"><span class="k">Total</span><span class="v ${r.total>0?'pos':r.total<0?'neg':''}">${fmt(r.total)}</span></div>
       <div class="st"><span class="k">Margin</span><span class="v ${mCls}">${mTxt}</span></div>
       <div class="st"><span class="k">Per mat</span><span class="v">${fmt1(r.perMat)}</span></div>
     </div>
     <div class="foot" data-expand="${r.fullId}" style="text-align:right;padding:5px 0 0;cursor:pointer;color:var(--brass-dim)">▸ recipe · all cities · Black Market</div></div>`;
  });
  $('ledgerTable').innerHTML=list.length?`<table><thead>${thead}</thead><tbody>${trs}</tbody></table>`:'<div class="foot">No craftable items here. Try another category, tier, or enchant — or press “Refresh prices”.</div>';
  $('ledgerCards').innerHTML=cards||'<div class="foot">No craftable items match.</div>';
  const hid=hidden?` · ${hidden} hidden as suspicious price${hidden===1?'':'s'}`:'';
  $('ledgerFoot').textContent=(filtered?`${list.length} of ${total} match “${$('inpFilter').value}”.`:(total>LEDGER_CAP?`Showing top ${LEDGER_CAP} of ${total} — search to narrow.`:`${total} craftable item${total===1?'':'s'}.`))+hid;
}

/* specialty bonuses for the SELECTED city only + which items get the bonus */
function renderCitySpec(){
  const bar=$('citySpecBar'), lead=$('specLead'); if(!bar)return;
  const c=state.settings.city, col=CITY_COLOR[c]||'var(--brass)';
  bar.innerHTML=`<div class="cspec on" style="border-left-color:${col}; flex-basis:100%">`+
    `<span class="cn" style="color:${col}">${cityLabel(c)} ★ specialty bonuses</span>`+
    `<span class="cd">${CITY_SPEC_DESC[c]||'No crafting/refining specialty.'}</span></div>`;
  lead.innerHTML=`Crafting an item that <b style="color:var(--brass-bright)">${cityLabel(c)}</b> specialises in gives extra resource return (cheaper to make). Those items are marked <span class="cellstar">★</span> below.`;
}

/* item detail modal — recipe + all-city prices + Black Market, opened by clicking a row */
function openItemModal(fullId){
  const it=DATA[stripE(fullId)]; if(!it)return;
  const s=state.settings, rr=s.returnRate/100;
  const r=computeLedgerCached().find(x=>x.fullId===fullId);
  const cost = r?r.cost:costToRaw(fullId,homeCity(),rr);
  const price = r?r.price:priceOf(fullId,homeCity());
  const net = r?r.net:(price!=null?price*(1-feeRate()):null);
  const profit = r?r.profit:((net!=null&&cost!=null)?net-cost:null);
  const margin = r?r.margin:((profit!=null&&cost>0)?profit/cost*100:null);
  const craft = r?r.craft:craftableCount(fullId,rr);
  const rec = recipeOf(fullId);
  const sellCity = (r&&r.sellCity)?r.sellCity:homeCity();
  const bc=bonusCityOf(fullId), bonus=bc&&bc===homeCity();
  const bonusPill = bc
    ? `<span class="flag bonus" title="${CITY_SPEC_DESC[bc]||''}">★ ${it.c==='crafting'?'+40% refining':'+15% crafting'} in ${cityLabel(bc)}${bonus?' — active':''}</span>`
    : '';
  const body=
    `<div class="ihead">${iconHtml(fullId,52,{star:bonus})}${tierChipHtml(fullId)}`+
      `<div class="htext"><h3>${it.nm}</h3><span class="fam">${it.c} · sells in ${cityLabel(sellCity)}${s.premium?' · Premium':''}</span></div></div>`+
    (bonusPill?`<div style="margin-bottom:12px">${bonusPill}</div>`:'')+
    `<div class="mstats">`+
      `<div class="mstat"><span class="k">Cost / craft</span><span class="v">${cost!=null?fmt(cost):'<span class="dim">—</span>'}</span>${cost==null?`<span class="flag warn" style="margin-top:5px" title="${(priceReason(fullId)||'One or more raw materials in this recipe have no live market price — refresh prices, or this ingredient may be untraded.').replace(/"/g,'&quot;')}">no price data</span>`:''}</div>`+
      `<div class="mstat"><span class="k">Sell (${cityLabel(sellCity)})</span><span class="v">${price!=null?fmt(price):'<span class="dim">—</span>'}</span>${price==null?noPriceFlag(fullId):''}</div>`+
      `<div class="mstat"><span class="k">Net after fees</span><span class="v">${net!=null?fmt(net):'—'}</span></div>`+
      `<div class="mstat"><span class="k">Profit / craft</span><span class="v ${profit>0?'pos':profit<0?'neg':''}">${fmt(profit)}</span></div>`+
      `<div class="mstat"><span class="k">Margin</span><span class="v ${margin>0?'pos':margin<0?'neg':''}">${margin!=null?fmt(margin)+'%':'—'}</span></div>`+
      `<div class="mstat"><span class="k">Craftable now</span><span class="v">${craft!=null?fmt(craft):'—'}</span></div>`+
    `</div>`+
    `<h4>Recipe → raw</h4><div class="mrecipe">${rec?recipeText(rec,rr):'<span class="dim">No recipe.</span>'}</div>`+
    `<h4>Prices — every city + Black Market</h4>${compareHtml(fullId)}`+
    `<div class="mtrack"><button class="b primary" data-track="${fullId}">${isTracked(fullId)?'✓ Tracked — click to untrack':'⚑ Track this craft'}</button>`+
      `<span class="hint">Tracking builds the full material plan on the Tracking tab.</span></div>`;
  $('itemModalBody').innerHTML=body;
  $('itemModal').classList.add('open');
  currentModalId=fullId; _imOpenedAt=Date.now();
}
function closeItemModal(){ $('itemModal').classList.remove('open'); currentModalId=null; }

