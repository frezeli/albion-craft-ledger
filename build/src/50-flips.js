/* ════════ FLIP FINDER (cross-city + Black Market arbitrage) ════════ */
let scanning=false, flipColSort=null;
function flipItemIds(){
  const s=state.settings, out=[];
  for(const base in DATA){
    const it=DATA[base];
    if(it.t==null) continue;
    if(s.flipCat!=='All' && tabOf(it)!==s.flipCat) continue;
    if(s.flipTier!=='all' && it.t!==s.flipTier) continue;
    if(s.flipEnch==='all'){ out.push(base); if(isEnchantable(base)) for(let e=1;e<=4;e++) out.push(withE(base,e)); }
    else if(s.flipEnch===0){ out.push(base); }
    else if(isEnchantable(base)){ out.push(withE(base,s.flipEnch)); }
  }
  return [...new Set(out)];
}
async function scanFlips(){
  if(scanning)return; scanning=true;
  const btn=$('btnScanFlips'); btn.disabled=true;
  try{
    const ids=flipItemIds();
    if(!ids.length){ toast('No items in this scope'); return; }
    const extra=(`https://${SERVERS[state.settings.server]}/api/v2/stats/prices/.json?locations=${encodeURIComponent(FETCH_LOCS.join(','))}&qualities=1`).length;
    const chunks=chunk(ids,extra); let done=0,failed=0;
    btn.innerHTML='<span class="spin"></span>Scanning…';
    await pool(chunks,3,async c=>{try{await fetchChunk(c);}catch(e){failed++;} done++; btn.innerHTML=`<span class="spin"></span>${done}/${chunks.length}`;});
    if(chunks.length&&failed===chunks.length){ $('flipBanner').textContent='Could not reach the price API — try again in a moment.'; $('flipBanner').classList.remove('hidden'); }
    else{ $('flipBanner').classList.add('hidden'); state.lastRefresh={at:Date.now(),server:state.settings.server}; if(failed)toast(failed+' batches failed — partial data'); }
    save(); renderFlips(); renderMast();
  }finally{ scanning=false; btn.disabled=false; btn.textContent='Scan prices'; }
}
function computeFlips(){
  const s=state.settings, tax=s.premium?0.04:0.08, setup=0.025, rows=[];
  for(const fullId of flipItemIds()){
    const pe=priceEntry(fullId); if(!pe)continue;
    let minSell=Infinity,minSellCity=null, maxSellMin=0,maxSellMinCity=null, maxBuy=0,maxBuyCity=null, minBuyMax=Infinity,minBuyMaxCity=null;
    for(const c of CITIES){ const cp=pe.cities[c]; if(!cp)continue;
      if(cp.price>0){ if(cp.price<minSell){minSell=cp.price;minSellCity=c;} if(cp.price>maxSellMin){maxSellMin=cp.price;maxSellMinCity=c;} }
      if(cp.buy>0){ if(cp.buy>maxBuy){maxBuy=cp.buy;maxBuyCity=c;} if(cp.buy<minBuyMax){minBuyMax=cp.buy;minBuyMaxCity=c;} }
    }
    const bm=pe.cities[BM_KEY]; if(bm&&bm.buy>maxBuy){ maxBuy=bm.buy; maxBuyCity=BM; }   // BM only buys
    // instant: buy the cheapest listing, dump into the best buy order (incl. Black Market)
    let instant=null;
    if(minSell<Infinity && maxBuy>0) instant={buyCity:minSellCity,buyPrice:minSell,sellCity:maxBuyCity,sellPrice:maxBuy,profit:maxBuy*(1-tax)-minSell};
    // order: bid where buy orders are lowest, list where sell orders are highest (cities only)
    let order=null;
    if(minBuyMax<Infinity && maxSellMin>0) order={buyCity:minBuyMaxCity,buyPrice:minBuyMax,sellCity:maxSellMinCity,sellPrice:maxSellMin,profit:maxSellMin*(1-tax-setup)-minBuyMax};
    if(!instant && !order) continue;
    rows.push({fullId, instant, order,
      iP:instant?instant.profit:null, oP:order?order.profit:null,
      iM:(instant&&instant.buyPrice>0)?instant.profit/instant.buyPrice*100:null,
      oM:(order&&order.buyPrice>0)?order.profit/order.buyPrice*100:null});
  }
  return rows;
}
function orderFlips(rows){
  const s=state.settings, filter=($('flipFilter').value||'').trim().toLowerCase(), min=+s.flipMinProfit||0;
  const pkey=s.flipMode==='order'?'oP':'iP';
  let list=rows.filter(r=>r[pkey]!=null && r[pkey]>0 && r[pkey]>=min);
  if(filter)list=list.filter(r=>nameOf(r.fullId).toLowerCase().includes(filter));
  const nv=x=>x==null||isNaN(x)?-Infinity:x;
  if(flipColSort){const{k,dir}=flipColSort; list.sort((a,b)=>(nv(b[k])-nv(a[k]))*dir);}
  else list.sort((a,b)=>nv(b[pkey])-nv(a[pkey]));
  return {list:list.slice(0,LEDGER_CAP), total:list.length};
}
function routeHtml(f){
  if(!f)return '<span class="dim">—</span>';
  return `<span class="route"><span class="city${f.buyCity===BM?' bm':''}">${cityLabel(f.buyCity)}</span> <span class="pr">${fmt(f.buyPrice)}</span><span class="arw">→</span><span class="city${f.sellCity===BM?' bm':''}">${cityLabel(f.sellCity)}</span> <span class="pr">${fmt(f.sellPrice)}</span></span>`;
}
function renderFlips(){
  const s=state.settings, mode=s.flipMode;
  $('flipCat').value=s.flipCat;
  document.querySelectorAll('#flipTier button').forEach(b=>b.classList.toggle('on',b.dataset.ftier===String(s.flipTier)));
  document.querySelectorAll('#flipEnch button').forEach(b=>b.classList.toggle('on',b.dataset.fench===String(s.flipEnch)));
  document.querySelectorAll('#flipMode button').forEach(b=>b.classList.toggle('on',b.dataset.fmode===mode));
  if(document.activeElement!==$('flipMin'))$('flipMin').value=s.flipMinProfit||'';
  $('flipDesc').innerHTML=mode==='order'
    ? 'Ranked by <b>Order flip</b> — place a buy order where bids are lowest, a sell order where listings are priciest. Patient, competitive, includes the 2.5% setup fee. Profit per unit, after tax.'
    : 'Ranked by <b>Instant flip</b> — buy the cheapest listing, haul it, and dump it into the best buy order or the Black Market (✦). Fast to execute. Profit per unit, after tax.';
  const scanned=flipItemIds().some(id=>priceEntry(id));
  if(!scanned){ $('flipTable').innerHTML=''; $('flipCards').innerHTML=''; $('flipFoot').innerHTML='<div class="foot">Press <b>Scan prices</b> to load this market and find flips.</div>'; return; }
  const {list,total}=orderFlips(computeFlips());
  const cols=[['','#'],['','Item',1],['','Buy → Sell',1],['iP','Instant'],['oP','Order'],[mode==='order'?'oM':'iM','Margin']];
  let thead='<tr>'+cols.map(c=>{const dir=flipColSort&&flipColSort.k===c[0]?(flipColSort.dir>0?' ▾':' ▴'):''; return `<th class="${c[2]?'l':''}" ${c[0]?`data-fsort="${c[0]}"`:''}>${c[1]}${dir}</th>`;}).join('')+'</tr>';
  let trs='',cards='';
  list.forEach((r,i)=>{
    const f=mode==='order'?r.order:r.instant, nm=nameOf(r.fullId), m=mode==='order'?r.oM:r.iM;
    const top=i===0&&!flipColSort;
    trs+=`<tr class="r${top?' top':''}">
      <td class="rk">${top?'<span class="star">★</span>':i+1}</td>
      <td><div class="itemcell">${iconHtml(r.fullId)}<div><span class="nm">${nm}</span><span class="fam">${DATA[stripE(r.fullId)].c} · T${tierOf(r.fullId)}</span></div></div></td>
      <td>${routeHtml(f)}</td>
      <td class="num ${r.iP>0?'pos':r.iP<0?'neg':''}">${r.iP!=null?fmt(r.iP):'—'}</td>
      <td class="num ${r.oP>0?'pos':r.oP<0?'neg':''}">${r.oP!=null?fmt(r.oP):'—'}</td>
      <td class="num">${m!=null?fmt(m)+'%':'—'}</td></tr>`;
    cards+=`<div class="card${top?' top':''}">
      <div class="head">${iconHtml(r.fullId,44)}<div><span class="nm">${nm}</span><span class="fam">${DATA[stripE(r.fullId)].c} · T${tierOf(r.fullId)}</span></div></div>
      <div style="margin:2px 0 8px">${routeHtml(f)}</div>
      <div class="stats">
        <div class="st"><span class="k">Instant</span><span class="v ${r.iP>0?'pos':r.iP<0?'neg':''}">${r.iP!=null?fmt(r.iP):'—'}</span></div>
        <div class="st"><span class="k">Order</span><span class="v ${r.oP>0?'pos':r.oP<0?'neg':''}">${r.oP!=null?fmt(r.oP):'—'}</span></div>
        <div class="st"><span class="k">Margin</span><span class="v">${m!=null?fmt(m)+'%':'—'}</span></div>
      </div></div>`;
  });
  $('flipTable').innerHTML=list.length?`<table><thead>${thead}</thead><tbody>${trs}</tbody></table>`:'<div class="foot">No profitable flips in this scope. Try another category or tier, lower the min profit, or scan again.</div>';
  $('flipCards').innerHTML=list.length?cards:'<div class="foot">No profitable flips found.</div>';
  $('flipFoot').textContent=list.length?`Top ${list.length}${total>list.length?' of '+total:''} ${mode==='order'?'order (patient)':'instant (fast)'} flip${total===1?'':'s'}.`:'';
}

