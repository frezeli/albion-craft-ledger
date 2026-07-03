import {readFileSync, writeFileSync} from 'fs';
import {gzipSync} from 'zlib';
const d = JSON.parse(readFileSync('./items.json','utf8')).items;
const names={};
readFileSync('./items.txt','utf8').split('\n').forEach(l=>{
  const m=l.match(/^\s*\d+:\s*(\S+)\s*:\s*(.+?)\s*$/);
  if(m) names[m[1]]=m[2];
});
const asArr=x=>x==null?[]:Array.isArray(x)?x:[x];
// normalize _LEVELn -> @n so ids match the pricing/icon API convention
const norm=id=>id.replace(/_LEVEL[1-4]$/,m=>'@'+m.slice(-1));
function recipeFrom(cr){
  const v=asArr(cr)[0]; if(!v) return null;
  const res=asArr(v.craftresource).map(r=>{
    const o={id:norm(r['@uniquename']),n:+r['@count']};
    if(r['@maxreturnamount']==='0') o.a=1;
    return o;
  }).filter(r=>r.id&&r.n);
  if(!res.length) return null;
  const o={r:res};
  if(v['@amountcrafted']&&+v['@amountcrafted']!==1) o.o=+v['@amountcrafted'];
  return o;
}
// enchantable groups: gear + resources enchant; consumables/tools/mounts/furniture/journals don't
const ENCHGRP=new Set(['weapon','equipmentitem','simpleitem']);
const GROUPS=['weapon','equipmentitem','transformationweapon','simpleitem','consumableitem','farmableitem','mount','furnitureitem','journalitem'];

const map={}; // id -> {nm,t,c,s,g}
// first, index EVERY named item across all groups (for inventory + leaf pricing/names)
for(const g of Object.keys(d)){
  for(const it of asArr(d[g])){
    const id=it&&it['@uniquename']; if(!id||!names[id]) continue;
    if(!map[id]) map[id]={nm:names[id],t:+it['@tier']||null,c:it['@shopcategory']||null,s:it['@shopsubcategory1']||null,g};
  }
}
// attach recipes to craftable items
let baseN=0,enchN=0;
for(const g of GROUPS){
  for(const it of asArr(d[g])){
    const id=it&&it['@uniquename']; if(!id||!map[id]) continue;
    const b=recipeFrom(it.craftingrequirements);
    if(b){ map[id].b=b; baseN++; }
    if(ENCHGRP.has(g)){
      const es={};
      for(const en of asArr(it.enchantments&&it.enchantments.enchantment)){
        const lv=en['@enchantmentlevel'], er=recipeFrom(en.craftingrequirements);
        if(lv&&er){ es[lv]=er; enchN++; }
      }
      if(Object.keys(es).length) map[id].e=es;
    }
  }
}
// validate: every recipe leaf id (minus @n enchant) resolves to a named item
const miss=new Set();
const checkLeaf=lid=>{ const base=lid.replace(/@[1-4]$/,''); if(!map[lid]&&!map[base]) miss.add(lid); };
for(const id of Object.keys(map)){
  const it=map[id];
  if(it.b) it.b.r.forEach(r=>checkLeaf(r.id));
  if(it.e) for(const lv of Object.keys(it.e)) it.e[lv].r.forEach(r=>checkLeaf(r.id));
}
const out=JSON.stringify(map);
writeFileSync('./albion-dataset.json',out);
console.log('items in map:', Object.keys(map).length);
console.log('craftable base recipes:', baseN, '| enchant recipes:', enchN);
console.log('unresolved recipe leaves:', miss.size);
if(miss.size) console.log('  examples:', [...miss].slice(0,25).join(', '));
console.log('dataset raw:', (out.length/1048576).toFixed(2),'MB | gzip:', (gzipSync(out).length/1048576).toFixed(2),'MB');
