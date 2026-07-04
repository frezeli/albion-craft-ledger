/* ════════ state ════════ */
const LS_KEY='albionCraftLedger.v2';
function defaultState(){
  return {v:2,
    settings:{server:'europe',city:'Martlock',homeCity:'Martlock',tier:'all',enchant:0,premium:true,sellMethod:'instant',returnRate:15,sortMode:'total',craftableOnly:false,hideSuspicious:true,
      ledgerTab:'all', invTab:'all', invTier:4, invEnch:0,
      flipCat:'all', flipTier:'all', flipEnch:0, flipMode:'instant', flipMinProfit:0},
    silver:0, inventory:{}, tracked:[], gatherRates:{}, manualPrices:{}, priceCache:{}, trendCache:{}, lastRefresh:null};
}
let state=load();
function load(){ try{const r=localStorage.getItem(LS_KEY); return r?merge(JSON.parse(r)):defaultState();}catch(e){return defaultState();} }
function merge(p){
  const d=defaultState(), s=Object.assign(d,p);
  s.settings=Object.assign(d.settings,p.settings||{});
  if(s.settings.city==='all')s.settings.city=s.settings.homeCity||'Martlock';  // migrate: All-cities mode removed
  // migrate old top-level tab names (Weapons/Resources/…) to the new leaf-category keys
  ['ledgerTab','invTab','flipCat'].forEach(k=>{ if(s.settings[k]!=='all' && !CAT_KEYS.has(s.settings[k])) s.settings[k]='all'; });
  ['inventory','gatherRates','manualPrices','priceCache','trendCache'].forEach(k=>{if(typeof s[k]!=='object'||!s[k])s[k]={};});
  if(!Array.isArray(s.tracked))s.tracked=[];
  return s;
}
function save(){ dataVersion++; try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){toast('Could not save — storage full or blocked');} }

/* ════════ inventory helpers (per quality) ════════ */
function invQ(fullId){ return state.inventory[fullId]||{}; }
function invTotal(fullId){ const q=state.inventory[fullId]; if(!q)return 0; let s=0; for(const k in q)s+=q[k]||0; return s; }
function setInvQ(fullId,quality,val){
  val=Math.max(0,Math.floor(val||0));
  const q=state.inventory[fullId]||{};
  if(val)q[quality]=val; else delete q[quality];
  if(Object.keys(q).length)state.inventory[fullId]=q; else delete state.inventory[fullId];
}

