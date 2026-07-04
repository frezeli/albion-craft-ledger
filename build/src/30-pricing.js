/* ════════ pricing ════════ */
const $=id=>document.getElementById(id);
function parseApiDate(s){ if(!s||s.startsWith('0001'))return null; const t=Date.parse(s.endsWith('Z')?s:s+'Z'); return isNaN(t)?null:t; }
function priceEntry(fullId){ return state.priceCache[state.settings.server+'|'+fullId]; }
function cityPrice(fullId,city){
  const man=state.manualPrices[fullId+'|'+city];
  if(man!=null)return {price:man,manual:true,date:null};
  const e=priceEntry(fullId), c=e&&e.cities[city];
  if(c&&c.price>0)return {price:c.price,manual:false,date:parseApiDate(c.date)};
  return null;
}
const priceOf=(fullId,city)=>{const p=cityPrice(fullId,city); return p?p.price:null;};
function homeCity(){ return state.settings.city; }  // single-city model: craft + sell in the selected city
function cityEntry(fullId,city){ const e=priceEntry(fullId); return (e&&e.cities[city])||null; }
function bestSellCity(fullId){ const e=priceEntry(fullId); if(!e)return null; let bc=null,bp=0; for(const c of CITIES){const cp=e.cities[c]; if(cp&&cp.price>bp){bp=cp.price;bc=c;}} return bc?{city:bc,price:bp}:null; }
/* market state for the three badges — buy orders tell "sold out" from a truly dead market */
function marketStatus(fullId,city){
  if(state.manualPrices[fullId+'|'+city]!=null) return {kind:'manual'};
  const e=priceEntry(fullId);
  if(!e) return {kind:'noscan'};                                  // never fetched this item
  const c=e.cities[city];
  if(c&&c.price>0){ const date=parseApiDate(c.date); const stale=date!=null?(Date.now()-date>STALE_MS):false; return {kind:stale?'stale':'ok',date}; }
  if(c&&c.buy>0) return {kind:'soldout'};                         // buyers bidding, nobody selling
  return {kind:'notforsale'};                                     // no sellers and no buyers here
}

/* ════════ cost to raw (recursive) ════════ */
let _costCache=null; // reset each computeLedger pass; keyed by city|fullId (rr constant within a pass)
function costToRaw(fullId,city,rr,seen){
  seen=seen||new Set(); const key=fullId;
  const ck=city+'|'+fullId;
  if(_costCache && ck in _costCache) return _costCache[ck];
  const rec=recipeOf(fullId);
  const mkt=priceOf(fullId,city);
  let result;
  if(!rec) result=mkt;                 // leaf: raw resource / artifact / token
  else if(seen.has(key)) result=mkt;   // cycle guard
  else {
    seen.add(key);
    let sum=0, ok=true;
    for(const ing of rec.r){
      let unit=costToRaw(ing.id,city,rr,seen);
      if(unit==null){ ok=false; break; } // a deeper leaf has no price
      const eff=ing.a?ing.n:ing.n*(1-rr); // artifacts never return
      sum+=unit*eff;
    }
    seen.delete(key);
    // prefer the from-raw cost; if the raw path is incomplete (some deep
    // resource lacks a price), fall back to this item's own market price.
    result = ok ? sum/(rec.o||1) : mkt;
  }
  if(_costCache) _costCache[ck]=result;
  return result;
}
/* diagnostic: why did a price / cost lookup bottom out at null for this item?
   returns a short human string for a tooltip, or null when a price IS available. */
function priceReason(fullId){
  const city=homeCity();
  if(priceOf(fullId,city)!=null) return null;            // a live/manual sell price exists
  const e=priceEntry(fullId);
  if(!e) return 'This item hasn’t been scanned yet — press “Refresh prices” to pull live market data.';
  const c=e.cities[city];
  if(c&&c.buy>0) return `No sell orders in ${cityLabel(city)} right now (buyers are bidding, nobody selling) — the market for this item is thin.`;
  const bs=bestSellCity(fullId);
  if(bs) return `No sellers in ${cityLabel(city)}, but ${cityLabel(bs.city)} lists it at ~${fmt(bs.price)}. Low-volume items often trade in only one city.`;
  return `No live market data tracked for this item in any city. Low-volume gear (transformation weapons, faction items) is often untraded on the Data Project — the price may not be a bug, just an empty market.`;
}
const feeRate=()=>(state.settings.premium?0.04:0.08)+(state.settings.sellMethod==='order'?0.025:0);
const fmt=n=>n==null||isNaN(n)?'—':Math.round(n).toLocaleString('en-US');
const fmt1=n=>n==null||isNaN(n)?'—':(Math.round(n*10)/10).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
function ago(ts){const m=(Date.now()-ts)/60000; if(m<1)return'just now'; if(m<60)return Math.floor(m)+'m ago'; const h=m/60; if(h<24)return Math.floor(h)+'h ago'; return Math.floor(h/24)+'d ago';}
function iconUrl(fullId){ return 'https://render.albiononline.com/v1/item/'+fullId+'.png?size=64'; }
function iconHtml(fullId,size,opts){ opts=opts||{}; const e=enchOf(fullId); const qb=opts.q?` qb${opts.q}`:''; const dim=size?` style="width:${size}px;height:${size}px"`:''; return `<span class="icoWrap${qb}"${dim}><img loading="lazy" src="${iconUrl(fullId)}" alt="" onerror="this.style.display='none'">${e?`<span class="ench">.${e}</span>`:''}${opts.star?'<span class="bstar" title="This city specialises in this craft">★</span>':''}</span>`; }
// T7.1-style chip: tier + enchant suffix coloured by level
function tierChipHtml(fullId){ const t=tierOf(fullId), e=enchOf(fullId); if(t==null)return ''; return `<span class="tchip">T${t}${e?`<span class="e e${e}">.${e}</span>`:''}</span>`; }
function toast(m){const t=$('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2600);}

/* ════════ craftable count from direct ingredients on hand ════════ */
function craftableCount(fullId,rr){
  const rec=recipeOf(fullId); if(!rec)return null;
  let min=Infinity;
  for(const ing of rec.r){
    const eff=ing.a?ing.n:ing.n*(1-rr);
    if(eff<=0)continue;
    const have=invTotal(ing.id);
    min=Math.min(min,Math.floor(have/eff));
  }
  return isFinite(min)?min*(rec.o||1):0;
}

