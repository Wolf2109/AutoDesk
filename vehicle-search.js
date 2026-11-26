'use strict';
const VehicleSearch = (() => {
  let pending;
  const load = () => pending ||= (async () => {
    const url = globalThis.VEHICLE_DATABASE_URL;
    let response;
    try { response = await fetch(url, {credentials:'omit'}); }
    catch (_) { throw Error('Mrežna greška ili CORS zabrana: ' + url); }
    if (!response.ok) throw Error('HTTP ' + response.status + ': ' + url);
    let rows;
    try { rows = await response.json(); }
    catch (_) { throw Error('Server nije vratio validan JSON: ' + url); }
    if (!Array.isArray(rows) || !rows.length || !rows[0].Brand) throw Error('Neispravan format baze: ' + url);
    return rows;
  })().catch(e=>{pending=null;throw e;});
  const unique = (rows,key) => [...new Set(rows.map(r=>r[key] || ''))].sort((a,b)=>a.localeCompare(b,'sr-Latn',{numeric:true}));
  const period = r => r.ProductionStart == null ? (r.ProductionEnd == null ? 'Godine nisu proverene' : `→ - ${r.ProductionEnd}`) : r.ProductionEnd == null || r.ProductionOngoing === true ? `${r.ProductionStart} - →` : r.ProductionStart === r.ProductionEnd ? String(r.ProductionStart) : `${r.ProductionStart}–${r.ProductionEnd}`;
  const name = v => !v || /^-+$/.test(v) ? 'Nije navedena' : v;
  const el = (tag,cls,txt) => {const n=document.createElement(tag); if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;};
  function picker(parent,label,items,display,choose){
    const wrap=el('div','vs-picker field'), lab=el('label','',label), input=el('input'), list=el('div','vs-options'), toggle=el('button','vs-toggle');
    toggle.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const id='vs-'+label; input.id=id;lab.htmlFor=id;input.type='search';input.placeholder='Izaberi ili pretraži '+label.toLocaleLowerCase();input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',id+'-options');input.setAttribute('aria-expanded','false');toggle.type='button';toggle.setAttribute('aria-label','Prikaži '+label);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',id+'-options');list.id=id+'-options';list.setAttribute('role','listbox');list.hidden=true;
    let active=-1, matches=[], committed=null, open=false;
    const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    function close(){open=false;wrap.classList.remove('is-open');input.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');list.hidden=true;input.value=committed===null?'':display(committed);}
    function select(v){committed=v;close();choose(v);}
    function show(q=''){matches=items.filter(v=>normalize(display(v)).includes(normalize(q)));active=-1;input.removeAttribute('aria-activedescendant');list.replaceChildren();for(const [i,v] of matches.entries()){const b=el('button','vs-option',display(v));b.id=id+'-option-'+i;b.type='button';b.tabIndex=-1;b.setAttribute('role','option');b.setAttribute('aria-selected',String(v===committed));b.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();};b.onclick=()=>select(v);list.append(b);}if(!matches.length)list.append(el('p','subtle','Nema rezultata'));list.scrollTop=0;if(!open){open=true;list.hidden=false;wrap.classList.add('is-open');input.setAttribute('aria-expanded','true');toggle.setAttribute('aria-expanded','true');}const rect=wrap.getBoundingClientRect();wrap.classList.toggle('opens-up',window.innerHeight-rect.bottom<210&&rect.top>window.innerHeight-rect.bottom);list.style.setProperty('--vs-available',Math.max(90,Math.min(280,(wrap.classList.contains('opens-up')?rect.top:window.innerHeight-rect.bottom)-12))+'px');}
    input.onfocus=()=>{if(!open){show('');if(committed!==null)input.select();}};input.oninput=()=>show(input.value);toggle.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();};toggle.onclick=()=>{if(open){close();}else{input.focus();show('');}};
    wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement))close();},100));
    // A single menu remains open; clicking elsewhere restores the last committed selection.
    wrap.addEventListener('pointerdown',()=>{for(const other of parent.querySelectorAll('.vs-picker.is-open'))if(other!==wrap)other.vsClose?.();});wrap.vsClose=close;
    input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open)show('');if(!matches.length)return;active=active<0?(e.key==='ArrowDown'?0:matches.length-1):Math.max(0,Math.min(matches.length-1,active+(e.key==='ArrowDown'?1:-1)));[...list.children].forEach((b,i)=>b.classList.toggle('vs-active',i===active));input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active]?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&open){e.preventDefault();if(active>=0)select(matches[active]);else if(matches.length===1)select(matches[0]);}};
    const line=el('div','vs-input');line.append(input,toggle);wrap.append(lab,line,list);parent.append(wrap);return wrap;
  }
  function groupECU(rows){
    const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
    const groups=new Map();
    for(const [i,row] of rows.entries()){
      const fields=['Ecu maker','Ecu model','MCU Type'].map(k=>norm(row[k]));
      const key=JSON.stringify(fields.every(v=>v&&!/^-+$/.test(v))?fields:[...fields,i]);
      if(!groups.has(key))groups.set(key,{rows:[],map:new Map()});
      const g=groups.get(key);g.rows.push(row);
      // Merge engine codes only when the engine, power, fuel and support are identical.
      const mode=String(row['Connection mode']||'').split(',').map(x=>x.trim()).filter(Boolean).sort().join(', ');
      const sig=JSON.stringify(['Engine','Power(PS)','Power(KW)','Fuel','Type','Tool'].map(k=>norm(row[k])).concat(norm(mode)));
      if(!g.map.has(sig))g.map.set(sig,{row,codes:new Set(),support:[{tool:row.Tool,mode}]});
      const code=String(row['Engine type']||'').trim();if(code&&!/^-+$/.test(code))g.map.get(sig).codes.add(code);
    }
    return [...groups.values()].map(g=>({rows:g.rows,engines:[...g.map.values()].map(e=>({...e,codes:[...e.codes].sort()}))}));
  }
  const moduleRows=(rows,type)=>rows.filter(r=>String(r['MCU Type']).trim().toUpperCase()===(type==='ECU'?'ECM':'TCM'));
  const searchRows=(rows,query)=>{const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>{const text=['Brand','Model','Version','Engine','Engine type','Ecu maker','Ecu model','Power(PS)','Power(KW)','Fuel','Connection mode','Tool','ProductionStart','ProductionEnd'].map(k=>r[k]??'').join(' ').toLowerCase();return terms.every(t=>text.includes(t));});};
  async function render(){
    const content=document.querySelector('#content'); const host=el('section','panel vs-host');const heading=el('h3','','Pretraga vozila');const info=el('p','subtle','Učitavanje baze vozila…');const filters=el('div','vs-filters');const results=el('div','vs-results');host.append(heading,info,filters,results);content.replaceChildren(host);prepareContentMotion('vehicle-search');
    let rows;
    try { rows=await load(); }
    catch(e) {
      if(!host.isConnected)return;
      info.textContent='Baza vozila nije dostupna. '+e.message;
      const retry=el('button','btn','Pokušaj ponovo');retry.type='button';retry.onclick=()=>{if(host.isConnected)render();};filters.append(retry);return;
    }
    if(!host.isConnected)return;info.textContent=`${unique(rows,'Brand').length} marki · ${rows.length.toLocaleString('sr-Latn')} zapisa · baza vozila`;
    const tabs=el('div','vs-module-tabs'), search=el('input','vs-result-search'), searchLabel=el('label','vs-search-label','Pretraga ECU / TCM');
    search.type='search';search.id='vs-result-query';searchLabel.htmlFor=search.id;search.placeholder='Model ECU, oznaka motora, marka, model…';
    host.insertBefore(tabs,filters);host.insertBefore(searchLabel,filters);host.insertBefore(search,filters);
    let type='ECU', scoped=[], selectedRows=null, complete=false, modelWrap,versionWrap;
    const buttons=['ECU','TCM'].map(t=>{const b=el('button','vs-module-tab',t);b.type='button';b.onclick=()=>{if(type!==t){type=t;setup();}};tabs.append(b);return b;});
    function refresh(){const q=search.value.trim();if(complete||q){showResults(searchRows(selectedRows??scoped,q));}else results.replaceChildren(el('p','subtle','Izaberi vozilo ili unesi pojam za pretragu.'));}
    search.oninput=refresh;
    function clearModel(){modelWrap?.remove();versionWrap?.remove();selectedRows=null;complete=false;refresh();}
    function clearVersion(){versionWrap?.remove();selectedRows=null;complete=false;refresh();}
    function showResults(r){
      results.replaceChildren();const groups=groupECU(r);
      results.append(el('h3','',`${groups.length} ${type} kartica · ${r.length} zapisa`));
      if(!groups.length){results.append(el('p','subtle','Nema rezultata za ovu pretragu.'));return;}
      const detail=(grid,label,value)=>{const d=el('div');d.append(el('dt','',label),el('dd','',value||'—'));grid.append(d);};
      for(const g of groups){
        const a=g.rows[0], card=el('article','vs-card');
        const heading=el('h4',''); if(a['Ecu maker']) heading.append(document.createTextNode(a['Ecu maker']+(a['Ecu model']?' · ':''))); if(a['Ecu model']) heading.append(el('span','vs-module-model',a['Ecu model'])); if(!a['Ecu maker']&&!a['Ecu model']) heading.textContent='ECU nije naveden'; card.append(heading);
        const meta=el('dl','vs-details');detail(meta,'Tip modula',a['MCU Type']);card.append(meta);
        card.append(el('h5','vs-engine-heading',`Motori (${g.engines.length})`));
        for(const engine of g.engines){
          const item=el('div','vs-engine');item.append(el('strong','',engine.row.Engine||'Motor nije naveden'));
          const grid=el('dl','vs-details');
          detail(grid,'Oznake motora',engine.codes.join(' / '));
          detail(grid,'Snaga',[engine.row['Power(PS)']&&engine.row['Power(PS)']+' KS',engine.row['Power(KW)']&&engine.row['Power(KW)']+' kW'].filter(Boolean).join(' / '));
          detail(grid,'Gorivo',engine.row.Fuel);detail(grid,'Tip vozila',engine.row.Type);
          for(const support of engine.support){detail(grid,'Alat',support.tool);detail(grid,'Modovi konekcije',support.mode);}
          item.append(grid);card.append(item);
        }results.append(card);
      }
    }
    function setup(){
      scoped=moduleRows(rows,type);selectedRows=null;complete=false;modelWrap=versionWrap=null;filters.replaceChildren();
      buttons.forEach((b,i)=>{const active=['ECU','TCM'][i]===type;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
      picker(filters,'Marka',unique(scoped,'Brand'),name,brand=>{clearModel();if(brand===null)return;const br=scoped.filter(a=>(a.Brand||'')===brand);selectedRows=br;refresh();modelWrap=picker(filters,'Model',unique(br,'Model'),name,model=>{clearVersion();selectedRows=br;if(model===null){refresh();return;}const mr=br.filter(a=>(a.Model||'')===model);selectedRows=mr;refresh();const versions=unique(mr,'Version');const versionLabel=v=>`${name(v)} · ${period(mr.find(a=>(a.Version||'')===v))}`;versionWrap=picker(filters,'Verzija',versions,versionLabel,v=>{complete=v!==null;selectedRows=v===null?mr:mr.filter(a=>(a.Version||'')===v);refresh();});});});
      refresh();
    }
    setup();
  }
  return {render,unique,period,groupECU,moduleRows,searchRows};
})();
if(typeof module!=='undefined')module.exports=VehicleSearch;
