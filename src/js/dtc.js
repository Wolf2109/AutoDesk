(function(root){
'use strict';
const aliases={VW:'VOLKSWAGEN',MERCEDESBENZ:'MERCEDES',MERCEDES:'MERCEDES',SKODA:'SKODA',CHEVY:'CHEVROLET',LANDROVER:'LANDROVER',ALFAROMEO:'ALFAROMEO',VWT:'VOLKSWAGEN'};
const key=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const brand=x=>aliases[key(x)]||key(x);
const code=x=>String(x||'').trim().toUpperCase();
const valid=x=>/^[PBCU][0-3][0-9A-F]{3}$/.test(x);
const codes=x=>[...new Set(String(x||'').split(/[,;\s]+/).map(code).filter(valid))];
function lookup(db,make,c){c=code(c);const b=brand(make);if(!valid(c))return null;const m=Object.entries(db.manufacturers||{}).find(([k])=>brand(k)===b);if(m&&Object.hasOwn(m[1],c))return {code:c,description:m[1][c],scope:'OEM',make:b};if(Object.hasOwn(db.generic||{},c))return {code:c,description:db.generic[c],scope:'Generic',make:''};return null;}
let pending;root.addEventListener?.('autodesk-catalog-sync',()=>{pending=null;});function load(){if(!pending)pending=(root.loadAutoDeskCatalog ? root.loadAutoDeskCatalog('dtc-database.json',r=>!!r?.generic&&!!r?.manufacturers) : fetch('./data/dtc-database.json').then(r=>{if(!r.ok)throw Error('DTC baza nije dostupna');return r.json();})).catch(e=>{pending=null;throw e;});return pending;}
function search(db,make,q){q=String(q||'').trim().toUpperCase();if(q.length<2)return [];const m=Object.entries(db.manufacturers||{}).find(([k])=>brand(k)===brand(make));const all=new Set([...Object.keys(m?.[1]||{}),...Object.keys(db.generic||{})]);return [...all].filter(c=>c.startsWith(q)||String(lookup(db,make,c)?.description||'').toUpperCase().includes(q)).sort((a,b)=>Number(!a.startsWith(q))-Number(!b.startsWith(q))||a.localeCompare(b)).slice(0,12).map(c=>lookup(db,make,c));}
root.DTC={brand,code,valid,codes,lookup,load,search};if(typeof module!=='undefined')module.exports=root.DTC;
})(typeof window!=='undefined'?window:globalThis);
