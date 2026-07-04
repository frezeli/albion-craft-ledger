'use strict';
const DATA=JSON.parse(document.getElementById('ds').textContent);

/* ════════ constants ════════ */
const SERVERS={europe:'europe.albion-online-data.com',west:'west.albion-online-data.com',east:'east.albion-online-data.com'};
const CITIES=['Caerleon','Bridgewatch','Lymhurst','Martlock','Thetford','FortSterling','Brecilien'];
const BM='Black Market', BM_KEY='BlackMarket';               // Caerleon Black Market (buy-only NPC)
const FETCH_LOCS=[...CITIES,BM];
const STORE_LOCS=new Set(FETCH_LOCS.map(c=>c.replace(/\s+/g,'')));
const cityLabel=c=>c==='FortSterling'?'Fort Sterling':c;
const TIERS=[1,2,3,4,5,6,7,8];
const QUAL=[['1','Normal','q1'],['2','Good','q2'],['3','Outstanding','q3'],['4','Excellent','q4'],['5','Masterpiece','q5']];
const DEFAULT_RATES={1:500,2:400,3:300,4:200,5:120,6:70,7:40,8:25};
const STALE_MS=24*3600*1000, LEDGER_CAP=60, INV_CAP=200;
// raw gathered resource families and their gather regions
const RAWMAP={FIBER:['Fiber','Thetford','Bridgewatch'],WOOD:['Wood','Lymhurst','Thetford'],HIDE:['Hide','Bridgewatch','Lymhurst'],ORE:['Ore','Fort Sterling','Martlock'],ROCK:['Stone','Martlock','Fort Sterling']};
const RAW_KEYS=Object.keys(RAWMAP);

/* ════════ city specialty crafting/refining bonuses (real Albion mapping) ════════ */
const CITY_COLOR={FortSterling:'#a9b7c2',Lymhurst:'#93c07e',Bridgewatch:'#e0b24a',Martlock:'#6fb6e6',Thetford:'#c58ee0',Caerleon:'#d07a68',Brecilien:'#7ecab5'};
const CRAFT_SUB_CITY={
  hammer:'FortSterling',spear:'FortSterling',holystaff:'FortSterling',plate_helmet:'FortSterling',cloth_armor:'FortSterling',
  sword:'Lymhurst',bow:'Lymhurst',arcanestaff:'Lymhurst',leather_helmet:'Lymhurst',leather_shoes:'Lymhurst',
  axe:'Martlock',quarterstaff:'Martlock',froststaff:'Martlock',plate_shoes:'Martlock',
  crossbow:'Bridgewatch',dagger:'Bridgewatch',cursestaff:'Bridgewatch',plate_armor:'Bridgewatch',cloth_shoes:'Bridgewatch',
  mace:'Thetford',firestaff:'Thetford',naturestaff:'Thetford',leather_armor:'Thetford',cloth_helmet:'Thetford',
  knuckles:'Caerleon',shapeshifterstaff:'Caerleon'};
const CITY_SPEC_DESC={
  FortSterling:'+40% Planks · +15% Hammer, Spear, Holy staff, Plate helm, Cloth armor',
  Lymhurst:'+40% Cloth · +15% Sword, Bow, Arcane staff, Leather helm & shoes',
  Bridgewatch:'+40% Stone blocks · +15% Crossbow, Dagger, Cursed staff, Plate armor, Cloth shoes',
  Martlock:'+40% Leather · +15% Axe, Quarterstaff, Frost staff, Plate boots, Off-hands',
  Thetford:'+40% Metal bars · +15% Mace, Fire & Nature staff, Leather armor, Cloth helm',
  Caerleon:'+15% Tools, Food, Gatherer gear, War gloves, Shapeshifter staff',
  Brecilien:'+15% Potions, Capes, Bags'};
// which city's crafting/refining bonus applies to this item (null = none). Returns a CITIES key.
function bonusCityOf(fullId){
  const base=stripE(fullId), it=DATA[base]; if(!it)return null;
  const c=it.c, s=it.s;
  if(c==='crafting'&&s==='refinedresources'){
    if(/PLANK/.test(base))return 'FortSterling';
    if(/CLOTH/.test(base))return 'Lymhurst';
    if(/STONEBLOCK/.test(base))return 'Bridgewatch';
    if(/LEATHER/.test(base))return 'Martlock';
    if(/METALBAR/.test(base))return 'Thetford';
    return null;
  }
  if(c==='offhands')return 'Martlock';
  if(c==='consumables'){ if(s==='food')return 'Caerleon'; if(s==='potions')return 'Brecilien'; return null; }
  if(c==='capes'||c==='bags')return 'Brecilien';
  if(c==='gathering')return 'Caerleon';   // gatherer tools + gatherer gear
  return CRAFT_SUB_CITY[s]||null;
}
// bonus applies where you CRAFT (the home city). true when the current craft city specialises in this item.
function hasCityBonus(fullId){ const bc=bonusCityOf(fullId); return bc!=null && bc===homeCity(); }

/* ════════ categories & sub-categories (grouped tree, modelled on Naz's albion-ledger-craft) ════════ */
// [groupLabel, [[leafKey, leafLabel], …]] — rendered as <optgroup> with an "All" option first.
const CAT_GROUPS=[
  ['Combat Gear',[['melee','Melee Weapons'],['ranged','Ranged Weapons'],['magic','Magic Weapons'],['offhand','Off-Hand Items'],['armor','Armor']]],
  ['Accessories',[['bags_capes','Bags & Capes']]],
  ['Utility',[['tools','Tools'],['mounts','Mounts']]],
  ['Consumables',[['food','Food'],['potions','Potions']]],
  ['Materials',[['raw','Raw Materials'],['refined','Refined Materials']]],
  ['Artifacts',[['artifacts','Artifacts']]],
  ['Other',[['other','Other']]],
];
const CAT_LABELS={}, CAT_KEYS=new Set();
CAT_GROUPS.forEach(([g,leaves])=>leaves.forEach(([k,l])=>{CAT_LABELS[k]=l; CAT_KEYS.add(k);}));
// weapon sub-type → damage class (Naz splits weapons into melee / ranged / magic)
const MELEE_W=new Set(['dagger','knuckles','spear','axe','sword','quarterstaff','hammer','mace']);
const RANGED_W=new Set(['bow','crossbow']);
const MAGIC_W=new Set(['cursestaff','firestaff','froststaff','arcanestaff','holystaff','naturestaff','shapeshifterstaff']);
// classify an item into a leaf category key
function catOf(it){
  switch(it.c){
    case 'weapons':
      if(MELEE_W.has(it.s))return 'melee';
      if(RANGED_W.has(it.s))return 'ranged';
      if(MAGIC_W.has(it.s))return 'magic';
      return 'other';
    case 'offhands':return 'offhand';
    case 'head':case 'armors':case 'shoes':return 'armor';
    case 'bags':case 'capes':return 'bags_capes';
    case 'gathering':return 'tools';
    case 'mounts':return 'mounts';
    case 'consumables':
      if(it.s==='food')return 'food';
      if(it.s==='potions')return 'potions';
      return 'other';
    case 'crafting':
      if(it.s==='resources')return 'raw';
      if(it.s==='refinedresources')return 'refined';
      return 'other';
    case 'artefacts':return 'artifacts';
    default:return 'other';   // vanity, furniture, farming, misc
  }
}
// enchant applies to gear + resources only
const ENCHANTABLE=new Set(['weapon','equipmentitem','simpleitem']);
const isEnchantable=base=>{const it=DATA[base]; return it&&ENCHANTABLE.has(it.g);};

/* ════════ item families (same item across tiers) for the inventory catalog ════════ */
const TIER_ADJ=/^(?:Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+/;
const FAMILIES={};
function buildFamilies(){
  for(const base in DATA){
    const it=DATA[base];
    if(it.t==null) continue;
    const key=base.replace(/^T\d+_/,'');
    let f=FAMILIES[key];
    if(!f){ f={key,name:it.nm.replace(TIER_ADJ,''),cat:catOf(it),ench:isEnchantable(base),tiers:{}}; FAMILIES[key]=f; }
    f.tiers[it.t]=base;
    if(!f.ench && isEnchantable(base)) f.ench=true;
  }
}
let dataVersion=0; // bumped on every state mutation to invalidate the ledger cache

/* ════════ id helpers ════════ */
const stripE=id=>{const i=id.indexOf('@'); return i<0?id:id.slice(0,i);};
const enchOf=id=>{const i=id.indexOf('@'); return i<0?0:+id.slice(i+1);};
const withE=(base,e)=>e?base+'@'+e:base;
const nameOf=id=>{const it=DATA[stripE(id)]; const e=enchOf(id); return (e?'.'+e+' ':'')+(it?it.nm:id);};
const tierOf=id=>{const it=DATA[stripE(id)]; return it?it.t:null;};
const recipeOf=id=>{const it=DATA[stripE(id)]; if(!it)return null; const e=enchOf(id); return e?(it.e&&it.e[e]):it.b;};
const rawFamily=id=>{const b=stripE(id); for(const k of RAW_KEYS)if(b.endsWith('_'+k))return k; return null;};

