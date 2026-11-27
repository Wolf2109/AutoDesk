'use strict';
const VehicleSearch = (() => {
  let pending, outsideMenuController;
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
  function generationPeriod(rows, version){
    const matches=rows.filter(r=>(r.Version||'')===version && Number.isFinite(r.ProductionStart));
    if(!matches.length)return {ProductionStart:null,ProductionEnd:null,ProductionOngoing:null};
    const counts=new Map();
    for(const r of matches){const key=JSON.stringify([r.ProductionStart,r.ProductionEnd,r.ProductionOngoing]);if(!counts.has(key))counts.set(key,{row:r,count:0});counts.get(key).count++;}
    return [...counts.values()].sort((a,b)=>b.count-a.count||a.row.ProductionStart-b.row.ProductionStart)[0].row;
  }
  function generationOptions(rows){
    const options=unique(rows,'Version'); const periods=new Map(options.map(v=>[v,generationPeriod(rows,v)]));
    return options.sort((a,b)=>(periods.get(a).ProductionStart??Infinity)-(periods.get(b).ProductionStart??Infinity)||a.localeCompare(b,'sr-Latn',{numeric:true}));
  }
  const period = r => r.ProductionStart == null ? (r.ProductionEnd == null ? '' : `→ - ${r.ProductionEnd}`) : r.ProductionEnd == null || r.ProductionOngoing === true ? `${r.ProductionStart} - →` : r.ProductionStart === r.ProductionEnd ? String(r.ProductionStart) : `${r.ProductionStart}–${r.ProductionEnd}`;
  const name = v => !v || /^-+$/.test(v) ? 'Nije navedena' : v;
  const el = (tag,cls,txt) => {const n=document.createElement(tag); if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;};
  function picker(parent,label,items,display,choose,initial=null){
    const wrap=el('div','vs-picker field'), lab=el('label','',label), input=el('input'), list=el('div','vs-options'), toggle=el('button','vs-toggle');
    toggle.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const id='vs-'+label; input.id=id;lab.htmlFor=id;input.type='search';input.placeholder='Izaberi ili pretraži '+label.toLocaleLowerCase();input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',id+'-options');input.setAttribute('aria-expanded','false');toggle.type='button';toggle.setAttribute('aria-label','Prikaži '+label);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',id+'-options');list.id=id+'-options';list.setAttribute('role','listbox');list.hidden=true;
    let active=-1, matches=[], committed=initial, open=false;
    const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    function close(){open=false;wrap.classList.remove('is-open');input.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');list.hidden=true;input.value=committed===null?'':display(committed);}
    function select(v){committed=v;close();if(wrap.contains(document.activeElement))document.activeElement.blur();choose(v);}
    function show(q=''){for(const other of parent.querySelectorAll('.vs-picker.is-open'))if(other!==wrap)other.vsClose?.();matches=items.filter(v=>normalize(display(v)).includes(normalize(q)));active=-1;input.removeAttribute('aria-activedescendant');list.replaceChildren();for(const [i,v] of matches.entries()){const b=el('button','vs-option',display(v));b.id=id+'-option-'+i;b.type='button';b.tabIndex=-1;b.setAttribute('role','option');b.setAttribute('aria-selected',String(v===committed));b.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();};b.onclick=()=>select(v);list.append(b);}if(!matches.length)list.append(el('p','subtle','Nema rezultata'));list.scrollTop=0;if(!open){open=true;list.hidden=false;wrap.classList.add('is-open');input.setAttribute('aria-expanded','true');toggle.setAttribute('aria-expanded','true');}const rect=wrap.getBoundingClientRect();wrap.classList.toggle('opens-up',window.innerHeight-rect.bottom<210&&rect.top>window.innerHeight-rect.bottom);list.style.setProperty('--vs-available',Math.max(90,Math.min(280,(wrap.classList.contains('opens-up')?rect.top:window.innerHeight-rect.bottom)-12))+'px');}
    input.onfocus=()=>{if(!open)show('');if(committed!==null)input.select();};
    input.onclick=()=>{if(!open)show('');};input.oninput=()=>show(input.value);
    // The arrow opens only the list; it never focuses the text input.
    toggle.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();};
    toggle.onclick=()=>{if(document.activeElement===input)input.blur();if(open)close();else show('');};
    wrap.addEventListener('focusout',e=>{if(e.relatedTarget&&!wrap.contains(e.relatedTarget))close();});
    wrap.addEventListener('pointerdown',()=>{for(const other of parent.querySelectorAll('.vs-picker.is-open'))if(other!==wrap)other.vsClose?.();});
    wrap.vsClose=close;wrap.vsOpen=()=>show('');
    input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open)show('');if(!matches.length)return;active=active<0?(e.key==='ArrowDown'?0:matches.length-1):Math.max(0,Math.min(matches.length-1,active+(e.key==='ArrowDown'?1:-1)));[...list.children].forEach((b,i)=>b.classList.toggle('vs-active',i===active));input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active]?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&open){e.preventDefault();if(active>=0)select(matches[active]);else if(matches.length===1)select(matches[0]);}};
    const line=el('div','vs-input');line.append(input,toggle);wrap.append(lab,line,list);parent.append(wrap);input.value=committed===null?'':display(committed);return wrap;
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
      const sig=JSON.stringify(['Tool'].map(k=>norm(row[k])).concat(norm(mode)));
      if(!g.map.has(sig))g.map.set(sig,{row,codes:new Set(),support:[{tool:row.Tool,mode}]});
      const code=String(row['Engine type']||'').trim();if(known(engineCode(code))&&![...g.map.get(sig).codes].some(c=>engineCode(c)===engineCode(code)))g.map.get(sig).codes.add(code);
    }
    return [...groups.values()].map(g=>({rows:g.rows,engines:[...g.map.values()].map(e=>({...e,codes:[...e.codes].sort()}))}));
  }
  // Match engine aliases by rated PS and normalized engine code or name, within a vehicle.
  const engineNorm=v=>String(v??'').trim().toUpperCase();
  const engineCode=v=>engineNorm(v).replace(/[\s.\-]/g,'');
  const engineName=v=>engineNorm(v).replace(/\s+/g,'').replace(/(\d)\.(\d)/g,'$1.$2');
  const known=v=>v&&!/^(?:[-–—]+|0|N\/?A|UNKNOWN|NONE|NULL)$/.test(v);
  function groupEngines(rows){
    const parent=rows.map((_,i)=>i), index=new Map();
    function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    function join(a,b){a=root(a);b=root(b);if(a!==b)parent[b]=a;}
    rows.forEach((row,i)=>{
      const ps=Number(String(row['Power(PS)']??'').replace(',','.'));
      if(!Number.isFinite(ps)||ps<=0)return;
      const scope=JSON.stringify(['Brand','Model','Version','Type'].map(k=>engineNorm(row[k])).concat(fuelGroup(row),ps));
      const code=engineCode(row['Engine type']), name=engineName(row.Engine);
      for(const [kind,value] of [['code',code],['name',name]]){
        if(!known(value))continue;
        const key=JSON.stringify([scope,kind,value]);
        if(index.has(key))join(index.get(key),i);else index.set(key,i);
      }
    });
    const groups=new Map();
    rows.forEach((row,i)=>{
      const key=root(i);
      if(!groups.has(key))groups.set(key,{row,rows:[],codes:new Map(),kw:new Set(),fuels:new Set()});
      const g=groups.get(key);g.rows.push(row);
      const code=engineCode(row['Engine type']);if(known(code)&&!g.codes.has(code))g.codes.set(code,String(row['Engine type']).trim());
      const kw=Number(String(row['Power(KW)']??'').replace(',','.'));if(kw>0)g.kw.add(kw);
      if(row.Fuel)g.fuels.add(row.Fuel);
    });
    return [...groups.values()].map(g=>({...g,codes:[...g.codes.values()],modules:groupECU(g.rows)})).sort((a,b)=>String(a.row.Engine||'').localeCompare(String(b.row.Engine||''),'sr-Latn',{numeric:true})||Number(a.row['Power(PS)'])-Number(b.row['Power(PS)']));
  }
  // Combine engine variants with exactly the same complete module set.
  function groupModuleSets(rows){
    const merged=new Map();
    for(const variant of groupEngines(rows)){
      const a=variant.row;
      const ids=variant.modules.map(m=>['Ecu maker','Ecu model','MCU Type'].map(k=>engineNorm(m.rows[0][k]).replace(/\s+/g,' ')));
      const valid=ids.length&&ids.every(id=>id.every(known));
      const key=JSON.stringify([a.Brand,a.Model,a.Version,a.Type,fuelGroup(a),ids.map(id=>JSON.stringify(id)).sort(),valid?null:merged.size]);
      if(!merged.has(key))merged.set(key,{row:a,variants:[],rows:[]});
      const g=merged.get(key);g.variants.push(variant);g.rows.push(...variant.rows);
    }
    return [...merged.values()].map(g=>({...g,modules:groupECU(g.rows)}));
  }
  const moduleRows=(rows,type)=>rows.filter(r=>String(r['MCU Type']).trim().toUpperCase()===(type==='ECU'?'ECM':'TCM'));
  const fuelGroup=r=>/diesel|dizel/i.test(String(r.Fuel||''))?'Diesel':'Petrol';
  const searchRows=(rows,query)=>{const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return rows.filter(r=>{const text=['Brand','Model','Version','Engine','Engine type','Ecu maker','Ecu model','Power(PS)','Power(KW)','Fuel','Connection mode','Tool','ProductionStart','ProductionEnd'].map(k=>r[k]??'').join(' ').toLowerCase();return terms.every(t=>text.includes(t));});};
  const categories=[['cars','Automobili i kombiji'],['trucks','Kamioni i autobusi'],['heavy','Teška mehanizacija'],['other','Ostala vozila']];
  function vehicleCategory(r){
    const t=String(r.Type||'').trim().toLowerCase();
    if(['car','lcv'].includes(t))return 'cars';
    if(['truck','bus'].includes(t))return 'trucks';
    if(t==='tractor')return 'heavy';
    if(t==='other' && !/^(argo|can-am|hisun|kymco|linhai|masai|polaris|segway|ski-doo)$/i.test(String(r.Brand||'').trim()))return 'heavy';
    return 'other';
  }
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
    let category='cars', type='ECU', brand=null, model=null, version=null, fuel=null, modelWrap,versionWrap;
    const categoryTabs=el('div','vs-category-tabs');host.insertBefore(categoryTabs,tabs);
    const categoryButtons=categories.map(([id,label])=>{const b=el('button','vs-module-tab',label);b.type='button';b.onclick=()=>{if(category===id)return;category=id;brand=model=version=fuel=null;modelWrap=versionWrap=null;filters.replaceChildren();updateCategories();setup();};categoryTabs.append(b);return b;});
    function updateCategories(){categoryButtons.forEach((b,i)=>{const active=categories[i][0]===category;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});const scoped=rows.filter(r=>vehicleCategory(r)===category);info.textContent=`${unique(scoped,'Brand').length} marki · ${scoped.length.toLocaleString('sr-Latn')} zapisa · ${categories.find(c=>c[0]===category)[1]}`;}
    updateCategories();
    const buttons=['ECU','TCM'].map(t=>{const b=el('button','vs-module-tab',t);b.type='button';b.onclick=()=>{if(type!==t){type=t;updateModuleTabs();refresh();}};tabs.append(b);return b;});
    function updateModuleTabs(){buttons.forEach((b,i)=>{const active=['ECU','TCM'][i]===type;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});}
    const fuelTabs=el('div','vs-fuel-tabs');fuelTabs.hidden=true;host.insertBefore(fuelTabs,results);
    const fuelButtons=['Diesel','Petrol'].map((f,i)=>{const b=el('button','vs-module-tab vs-fuel-tab',i===0?'Dizel':'Benzin');b.type='button';b.onclick=()=>{fuel=fuel===f?null:f;refresh();};fuelTabs.append(b);return b;});
    function vehicleRows(){return rows.filter(r=>vehicleCategory(r)===category&&(brand===null||(r.Brand||'')===brand)&&(model===null||(r.Model||'')===model)&&(version===null||(r.Version||'')===version));}
    function refresh(){
      const q=search.value.trim(), complete=version!==null;
      fuelTabs.hidden=!(complete||q);
      if(!complete&&!q){results.replaceChildren(el('p','subtle','Izaberi vozilo ili unesi pojam za pretragu.'));return;}
      const found=searchRows(moduleRows(vehicleRows(),type),q);
      fuelButtons.forEach((b,i)=>{const f=['Diesel','Petrol'][i],active=fuel===f;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));b.textContent=(i===0?'Dizel':'Benzin')+' ('+groupModuleSets(found.filter(r=>fuelGroup(r)===f)).length+')';});
      showResults(fuel===null?found:found.filter(r=>fuelGroup(r)===fuel));
    }
    search.oninput=refresh;
    outsideMenuController?.abort();outsideMenuController=new AbortController();
    document.addEventListener('pointerdown',e=>{if(!host.isConnected){outsideMenuController?.abort();return;}for(const wrap of filters.querySelectorAll('.vs-picker.is-open'))if(!wrap.contains(e.target))wrap.vsClose?.();},{signal:outsideMenuController.signal});
    function showResults(r){
      results.replaceChildren();const groups=groupModuleSets(r);
      results.append(el('h3','',`${groups.length} grupa računara · ${groups.reduce((n,g)=>n+g.variants.length,0)} varijanti motora · ${r.length} zapisa`));
      if(!groups.length){results.append(el('p','subtle','Nema rezultata za ovu pretragu.'));return;}
      const detail=(grid,label,value)=>{const d=el('div');d.append(el('dt','',label),el('dd','',value||'—'));grid.append(d);};
      for(const g of groups){
        const a=g.row,card=el('article','vs-card vs-engine-card');
        const head=el('div','vs-engine-card-head'), title=el('h4','',g.variants.length===1?(a.Engine||'Motor nije naveden'):`${g.variants.length} varijanti motora`);
        head.append(title);card.append(head);
        if(version===null)card.append(el('p','subtle vs-vehicle-context',[a.Brand,a.Model,name(a.Version)].join(' · ')));
        for(const v of g.variants){
          const line=el('div','vs-variant-line'), h=el('div','vs-engine-card-head');
          h.append(el('strong','',v.row.Engine||'Motor nije naveden'),el('span','vs-power-pill',[v.row['Power(PS)']&&v.row['Power(PS)']+' KS',[...v.kw].map(k=>k+' kW').join(' / ')].filter(Boolean).join(' · ')));line.append(h);
          const meta=el('dl','vs-details vs-engine-meta');detail(meta,'Gorivo',[...v.fuels].join(' / '));detail(meta,'Oznake motora',v.codes.join(' / '));line.append(meta);card.append(line);
        }
        card.append(el('h5','vs-engine-heading',`${type} računari (${g.modules.length})`));
        const modules=el('div','vs-module-list');
        for(const mod of g.modules){
          const m=mod.rows[0], block=el('details','vs-module-entry'), summary=el('summary','vs-module-summary');
          summary.append(el('span','',m['Ecu maker']||''),el('strong','vs-module-model',m['Ecu model']||'Računar nije naveden'));block.append(summary);
          const body=el('div','vs-module-body');
          for(const v of g.variants){
            const matching=v.modules.find(x=>['Ecu maker','Ecu model','MCU Type'].every(k=>engineNorm(x.rows[0][k]).replace(/\s+/g,' ')===engineNorm(m[k]).replace(/\s+/g,' ')));
            if(!matching)continue;
            body.append(el('p','vs-engine-heading',`${v.row.Engine||'Motor'} · ${v.row['Power(PS)']||'—'} KS`));
            for(const e of matching.engines){
              const grid=el('dl','vs-details');detail(grid,'Oznake motora',e.codes.join(' / '));
              for(const support of e.support){detail(grid,'Alat',support.tool);detail(grid,'Modovi konekcije',support.mode);}
              body.append(grid);
            }
          }
          block.append(body);modules.append(block);
        }
        card.append(modules);results.append(card);
      }
    }
    function openNext(wrap){wrap.vsOpen();}
    function setup(){
      updateModuleTabs();
      picker(filters,'Marka',unique(vehicleRows(),'Brand'),name,b=>{
        if(brand===b&&modelWrap){openNext(modelWrap);return;}
        brand=b;model=version=null;fuel=null;modelWrap?.remove();versionWrap?.remove();versionWrap=null;
        const br=vehicleRows();
        modelWrap=picker(filters,'Model',unique(br,'Model'),name,m=>{
          if(model===m&&versionWrap){openNext(versionWrap);return;}
          model=m;version=null;fuel=null;versionWrap?.remove();
          const mr=vehicleRows();
          const versionLabel=v=>[name(v),period(generationPeriod(mr,v))].filter(Boolean).join(' · ');
          versionWrap=picker(filters,'Generacija',generationOptions(mr),versionLabel,v=>{version=v;fuel=null;refresh();});
          refresh();openNext(versionWrap);
        });
        refresh();openNext(modelWrap);
      });
      refresh();
    }
    setup();
  }
  return {render,unique,period,generationOptions,generationPeriod,groupECU,groupEngines,groupModuleSets,moduleRows,searchRows,fuelGroup,vehicleCategory};
})();
if(typeof module!=='undefined')module.exports=VehicleSearch;
