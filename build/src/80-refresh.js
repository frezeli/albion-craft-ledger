/* ════════ price refresh ════════ */
let refreshing=false;
function gatherPriceIds(){
  const ids=new Set(), s=state.settings;
  const addTree=(fullId,depth)=>{ if(depth>10)return; ids.add(fullId); const rec=recipeOf(fullId); if(rec)rec.r.forEach(ing=>addTree(ing.id,depth+1)); };
  computeLedgerCached().forEach(r=>addTree(r.fullId,0)); // visible ledger + their trees
  state.tracked.forEach(t=>addTree(t.id,0));            // tracked trees
  RAW_KEYS.forEach(k=>{ if(s.tier==='all')TIERS.forEach(t=>ids.add(`T${t}_${k}`)); else ids.add(`T${s.tier}_${k}`); }); // raws for advisor
  return [...ids];
}
function chunk(ids,extra){const budget=3700-extra,out=[];let cur=[],len=0; for(const id of ids){if(cur.length&&len+id.length+1>budget){out.push(cur);cur=[];len=0;} cur.push(id);len+=id.length+1;} if(cur.length)out.push(cur); return out;}
async function pool(items,limit,fn){const q=[...items]; await Promise.all(Array.from({length:Math.min(limit,q.length)},async()=>{while(q.length)await fn(q.shift());}));}
async function fetchChunk(ids){
  const s=state.settings;
  const url=`https://${SERVERS[s.server]}/api/v2/stats/prices/${ids.join(',')}.json?locations=${encodeURIComponent(FETCH_LOCS.join(','))}&qualities=1`;
  const r=await fetch(url); if(!r.ok)throw new Error('HTTP '+r.status);
  const rows=await r.json(), now=Date.now();
  ids.forEach(id=>{state.priceCache[s.server+'|'+id]={fetchedAt:now,cities:{}};});
  rows.forEach(row=>{const e=state.priceCache[s.server+'|'+row.item_id]; if(!e)return; const city=(row.city||'').replace(/\s+/g,''); if(!STORE_LOCS.has(city))return;
    const sell=row.sell_price_min>0?row.sell_price_min:0, buy=row.buy_price_max>0?row.buy_price_max:0;
    if(sell||buy){ e.cities[city]={price:sell,date:row.sell_price_min_date,buy,buyDate:row.buy_price_max_date}; if(sell) delete state.manualPrices[row.item_id+'|'+city]; }});
}
async function refreshTrends(){
  const s=state.settings, tcity=homeCity();
  const ids=orderLedger(computeLedgerCached()).list.slice(0,LEDGER_CAP).map(r=>r.fullId);
  if(!ids.length)return;
  const extra=(`https://${SERVERS[s.server]}/api/v2/stats/charts/.json?locations=${tcity}&time-scale=6`).length;
  await pool(chunk(ids,extra),2,async c=>{
    try{const r=await fetch(`https://${SERVERS[s.server]}/api/v2/stats/charts/${c.join(',')}.json?locations=${tcity}&time-scale=6`); if(!r.ok)return; const data=await r.json();
      data.forEach(d=>{const ts=(d.data&&d.data.timestamps)||[], avg=(d.data&&d.data.prices_avg)||[]; if(ts.length<2||avg.length<2)return; const li=ts.length-1,lastT=parseApiDate(ts[li]); if(lastT==null)return; const target=lastT-STALE_MS; let ri=0,bd=Infinity; for(let i=0;i<ts.length;i++){const t=parseApiDate(ts[i]); if(t==null)continue; const dd=Math.abs(t-target); if(dd<bd){bd=dd;ri=i;}} if(ri===li)ri=Math.max(0,li-1); const ref=avg[ri],cur=avg[li]; if(!ref||!cur)return; state.trendCache[s.server+'|'+d.item_id+'|'+tcity]={pct:(cur-ref)/ref*100};});
    }catch(e){}
  });
}
async function doRefresh(){
  if(refreshing)return; refreshing=true;
  const btn=$('btnRefresh'); btn.disabled=true;
  try{
    const ids=gatherPriceIds();
    const extra=(`https://${SERVERS[state.settings.server]}/api/v2/stats/prices/.json?locations=${encodeURIComponent(FETCH_LOCS.join(','))}&qualities=1`).length;
    const chunks=chunk(ids,extra); let done=0,failed=0;
    btn.innerHTML='<span class="spin"></span>Fetching…';
    await pool(chunks,3,async c=>{try{await fetchChunk(c);}catch(e){failed++;} done++; btn.innerHTML=`<span class="spin"></span>${done}/${chunks.length}`;});
    if(chunks.length&&failed===chunks.length){$('apiBanner').textContent='Could not reach the price API — cached values shown; you can type prices directly into the Sell fields.'; $('apiBanner').classList.remove('hidden');}
    else{$('apiBanner').classList.add('hidden'); state.lastRefresh={at:Date.now(),server:state.settings.server}; if(failed)toast(failed+' price batches failed — partial data');}
    save(); renderActive();
    btn.innerHTML='<span class="spin"></span>Trends…'; await refreshTrends(); save(); if(current==='ledger')renderLedger();
  }finally{ refreshing=false; btn.disabled=false; btn.textContent='Refresh prices'; renderMast(); }
}
let autoT=null; const autoRefresh=()=>{clearTimeout(autoT); autoT=setTimeout(doRefresh,450);};

