'use strict';
const EcuSearch = (() => {
  let pending;
  const normalize = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const present = v => v && !/^(UNKNOWN|N\/A|-+)$/i.test(String(v).trim());
  const index = rows => rows.map(row => ({row, catalog: present(row.catalog_number) ? normalize(row.catalog_number) : '', bosch: present(row.bosch_number) ? normalize(row.bosch_number) : ''}));
  function search(rows, query) {
    const q = normalize(query);
    if (!q) return [];
    const exact = [], partial = [];
    for (const r of rows) {
      if (r.catalog === q || r.bosch === q) exact.push(r.row);
      else if (r.catalog.includes(q) || r.bosch.includes(q)) partial.push(r.row);
    }
    return exact.concat(partial);
  }
  globalThis.addEventListener?.('autodesk-catalog-sync', () => {pending=null;});
  const load = () => pending ||= (async () => {
    if(globalThis.loadAutoDeskCatalog) return index(await globalThis.loadAutoDeskCatalog('ecu_database.json',r=>Array.isArray(r)&&r.length>0&&'bosch_number' in r[0]));
    const response = await fetch(new URL('./data/ecu_database.json', document.baseURI), {credentials:'omit'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length || !('bosch_number' in rows[0])) throw Error('Neispravan format baze');
    return index(rows);
  })().catch(e => {pending = null; throw e;});
  const el = (tag, cls, text) => {const n = document.createElement(tag); if(cls) n.className=cls; if(text != null)n.textContent=text; return n;};
  // Keep each Bosch number and ECU designation separate; preserve catalog-to-make links.
  function groupResults(rows) {
    const groups=new Map();
    for(const row of rows){
      const key=JSON.stringify([normalize(row.bosch_number),String(row.ecu_name??'').replace(/\s+/g,'').toUpperCase()]);
      if(!groups.has(key))groups.set(key,{...row,catalogs:new Map()});
      const g=groups.get(key), catalog=present(row.catalog_number)?normalize(row.catalog_number):'';
      if(!g.catalogs.has(catalog))g.catalogs.set(catalog,{number:row.catalog_number,makes:new Map()});
      const c=g.catalogs.get(catalog);c.makes.set(String(row.vehicle_make??'').trim().toUpperCase(),row.vehicle_make);
    }
    return [...groups.values()];
  }
  function card(row) {
    const item = el('article','vs-card ecu-result-card');
    item.append(el('h4','',present(row.ecu_name)?row.ecu_name:'Naziv nije naveden'));
    const details=el('dl','vs-details');
    const block=el('div');block.append(el('dt','','Bosch broj'),el('dd','',present(row.bosch_number)?row.bosch_number:'Nije navedeno'));details.append(block);
    item.append(details);
    const list=el('div','ecu-catalog-list');
    for(const c of row.catalogs.values()){
      const d=el('dl','vs-details');
      for(const [label,value] of [['Kataloški broj',c.number],['Marka',[...c.makes.values()].filter(present).join(' / ')]]){
        const b=el('div');b.append(el('dt','',label),el('dd','',present(value)?value:'Nije navedeno'));d.append(b);
      }
      list.append(d);
    }
    item.append(list);return item;
  }
  async function render() {
    const host=el('section','panel vs-host ecu-search-host'), info=el('p','subtle','Učitavanje baze računara…'), label=el('label','vs-search-label','Kataloški ili Bosch broj'), input=el('input','vs-result-search'), status=el('p','subtle ecu-search-status'), results=el('div','vs-results'), more=el('button','btn ecu-more','Prikaži još');
    input.type='search';input.id='ecu-number-query';label.htmlFor=input.id;input.placeholder='Npr. 0281010001 ili 038 906 018 FB';input.autocomplete='off';input.spellcheck=false;input.disabled=true;status.setAttribute('role','status');more.type='button';more.hidden=true;
    host.append(el('h3','','Pretraga računara'),info,label,input,status,results,more);document.querySelector('#content').replaceChildren(host);prepareContentMotion('ecu-search');
    let rows;
    try {rows=await load();} catch(e){if(!host.isConnected)return;info.textContent='Baza računara nije dostupna. '+e.message;const retry=el('button','btn','Pokušaj ponovo');retry.onclick=()=>{if(host.isConnected)render();};host.append(retry);return;}
    if(!host.isConnected)return;
    info.textContent=rows.length.toLocaleString('sr-Latn')+' zapisa · baza računara';input.disabled=false;
    let found=[], shown=0, timer;
    function next(){const fragment=document.createDocumentFragment();for(const row of found.slice(shown,shown+80))fragment.append(card(row));results.append(fragment);shown=Math.min(shown+80,found.length);more.hidden=shown>=found.length;more.textContent=`Prikaži još (${found.length-shown})`;}
    function refresh(){results.replaceChildren();shown=0;more.hidden=true;const q=normalize(input.value);if(!q){status.textContent='Unesi kataloški ili Bosch broj.';return;}found=groupResults(search(rows,q));status.textContent=found.length?`${found.length.toLocaleString('sr-Latn')} pronađenih računara`:'Nema pronađenih računara.';next();}
    input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(host.isConnected)refresh();},120);});more.onclick=next;refresh();
  }
  return {render, index, search, groupResults};
})();
if(typeof module !== 'undefined' && module.exports) module.exports=EcuSearch;
