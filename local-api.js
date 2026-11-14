'use strict';
// GitHub Pages edition: all records and images remain in this browser's IndexedDB.
const LocalAPI = (() => {
  const DBNAME = 'autodesk-pages-v1';
  let connection;
  function open() { if (connection) return connection; connection = new Promise((resolve,reject) => { const r=indexedDB.open(DBNAME,1); r.onupgradeneeded=()=>r.result.createObjectStore('state'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); return connection; }
  async function localRead() { const db=await open(); return new Promise((resolve,reject)=>{const t=db.transaction('state','readonly'),r=t.objectStore('state').get('main');r.onsuccess=()=>resolve(r.result || {clients:[],vehicles:[],services:[],orders:[],photos:[],settings:{currency:'RSD'},seq:0,ids:{},backups:{}});r.onerror=()=>reject(r.error);}); }
  async function localWrite(s) { const db=await open(); return new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(s,'main');t.oncomplete=resolve;t.onerror=()=>reject(t.error);}); }
  // Keep a session cache for instant navigation. Mutations always fetch the latest
  // cloud snapshot first, so a stale tab cannot silently overwrite another device.
  let cloudQueue=Promise.resolve();
  let snapshot=null;
  let initialLoad=null;
  let lastCheck=0;
  let backgroundLoad=null;
  const RECHECK_MS=30000;
  async function fetchCloud(){
    if(!window.CloudSync?.ready) throw Error('Firebase nije podešen. Pogledajte UPUTSTVO.md.');
    const remote=await CloudSync.load();
    if(remote){await localWrite(remote);return remote;}
    const local=await localRead();
    if(local.clients.length||local.orders.length||local.vehicles.length||local.services.length){
      await CloudSync.save(local);
    }
    return local;
  }
  async function read(fresh=false){
    if(!window.CloudSync?.ready) throw Error('Firebase nije podešen. Pogledajte UPUTSTVO.md.');
    if(fresh){
      if(backgroundLoad) await backgroundLoad;
      await cloudQueue.catch(()=>{});
      const latest=await fetchCloud();
      snapshot=latest;
      lastCheck=Date.now();
      return structuredClone(latest);
    }
    if(snapshot){
      if(Date.now()-lastCheck>RECHECK_MS && !backgroundLoad){
        backgroundLoad=(async()=>{
          try{
            await cloudQueue.catch(()=>{});
            const updated=await fetchCloud();
            snapshot=updated;
            lastCheck=Date.now();
          }catch(e){console.warn('Pozadinska sinhronizacija:',e);}
          finally{backgroundLoad=null;}
        })();
      }
      return structuredClone(snapshot);
    }
    if(!initialLoad){
      initialLoad=(async()=>{
        const first=await fetchCloud();
        snapshot=first;
        lastCheck=Date.now();
        return first;
      })().catch(e=>{initialLoad=null;throw e;});
    }
    return structuredClone(await initialLoad);
  }
  async function write(s){
    // A successful write means both Firestore and IndexedDB were updated.
    const task=cloudQueue.catch(()=>{}).then(async()=>{
      await CloudSync.save(s);
      await localWrite(s);
      snapshot=structuredClone(s);
      lastCheck=Date.now();
    });
    cloudQueue=task;
    return task;
  }
  const err=m=>{throw Error(m);};
  const num=x=>Number(x)||0;
  const stamp=()=>new Date().toISOString();
  const clone=x=>structuredClone(x);
  function rich(s,o){const c=s.clients.find(x=>x.id===o.client_id),v=s.vehicles.find(x=>x.id===o.vehicle_id);return {...o,client_name:c?.name||'',vehicle_name:v?`${v.make} ${v.model} • ${v.registration||''}`:'',difference:num(o.charged_amount)-num(o.spent_amount)};}
  const sorted=arr=>arr.sort((a,b)=>b.id-a.id);
  const csvField=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  function downloadCSV(rows,currency){const cols=['order_number','date','client_name','vehicle_name','description','notes','spent_amount','charged_amount','difference'];return new Blob(['\ufeff'+cols.concat('currency').join(',')+'\r\n'+rows.map(x=>cols.map(k=>csvField(k.endsWith('amount')||k==='difference'?(num(x[k])/100).toFixed(2):x[k])).concat(csvField(currency)).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});}
  async function call(url,opt={}) {
    const method=(opt.method||'GET').toUpperCase(),u=new URL(url,'https://local.invalid'),parts=u.pathname.split('/').filter(Boolean),table=parts[0],key=Number(parts[1]),q=u.searchParams;
    // Legacy server routes use /export.pdf and /export.csv (not /export/pdf).
    if(table==='export.pdf'||table==='export.csv'){parts[1]=table.slice('export.'.length);table='export';}
    const s=await read(method!=='GET'), body=opt.body instanceof FormData?opt.body:opt.body?JSON.parse(opt.body):{};
    const save=async result=>{await write(s);return result;};
    const next=t=>(s.ids[t]=(s.ids[t]||Math.max(0,...(s[t]||[]).map(x=>x.id)))+1);
    if(table==='health')return {ok:true};
    if(table==='auth'){
      if(parts[1]==='status')return {setup:!!s.password};
      if(parts[1]==='setup'){if(s.password)err('Lozinka je već postavljena.');if(String(body.password||'').length<6)err('Lozinka mora imati najmanje 6 znakova.');const salt=crypto.getRandomValues(new Uint8Array(16));s.salt=Array.from(salt);s.password=await digest(body.password,s.salt);return save({ok:true});}
      if(parts[1]==='login'){if(!s.password||await digest(body.password,s.salt)!==s.password)err('Pogrešna lozinka.');return {token:'local-session'};}
      if(parts[1]==='logout')return {ok:true};
    }
    if(table==='settings'){
      if(method==='GET')return clone(s.settings);
      const old=s.settings.currency||'RSD',currency=body.currency||old;
      if(!['RSD','EUR'].includes(currency))err('Nepodržana valuta.');
      if(currency!==old){if(body.confirm_conversion!==true)err('Potvrdite konverziju.');const f=old==='RSD'?1/120:120;for(const o of s.orders){o.spent_amount=Math.round(num(o.spent_amount)*f);o.charged_amount=Math.round(num(o.charged_amount)*f);}for(const x of s.services)x.price_amount=Math.round(num(x.price_amount)*f);}
      for(const k of ['currency','workshop_name','workshop_info','date_format'])if(k in body)s.settings[k]=body[k];return save({ok:true,currency,converted:currency!==old});
    }
    if(['clients','vehicles','services'].includes(table)){
      const a=s[table];
      if(method==='GET'){let result=sorted(clone(a));const search=(q.get('search')||'').toLowerCase();if(search)result=result.filter(x=>Object.values(x).some(v=>String(v??'').toLowerCase().includes(search)));return result;}
      if(method==='DELETE'){if(table==='clients'&&(s.vehicles.some(v=>v.client_id===key)||s.orders.some(o=>o.client_id===key)))err('Klijent ima povezana vozila ili naloge. Istorija je zaštićena.');if(table==='vehicles'&&s.orders.some(o=>o.vehicle_id===key))err('Vozilo ima radne naloge. Istorija je zaštićena.');const i=a.findIndex(x=>x.id===key);if(i<0)err('Zapis nije pronađen.');a.splice(i,1);return save({ok:true});}
      if(table==='clients'&&!String(body.name||'').trim())err('Unesite ime klijenta.');
      if(table==='services'&&!String(body.name||'').trim())err('Naziv usluge je obavezan.');
      if(table==='vehicles'){body.client_id=num(body.client_id);if(!s.clients.some(c=>c.id===body.client_id))err('Klijent ne postoji.');if(!body.make||!body.model)err('Marka i model su obavezni.');}
      if(table==='services')body.price_amount=num(body.price_amount);
      if(method==='POST'){const record={...body,id:next(table)};a.push(record);return save(clone(record));}
      if(method==='PUT'){const i=a.findIndex(x=>x.id===key);if(i<0)err('Zapis nije pronađen.');a[i]={...a[i],...body,id:key};return save(clone(a[i]));}
    }
    if(table==='orders'){
      if(method==='GET'){
        if(key && parts[2]==='status' && method==='PATCH'){const o=s.orders.find(x=>x.id===key);if(!o)err('Nalog nije pronađen.');if(!['received','in_progress','waiting','done','delivered'].includes(body.status))err('Neispravan status.');o.status=body.status;o.updated_at=stamp();return save({ok:true,status:o.status});}
        if(key){const o=s.orders.find(x=>x.id===key);if(!o)err('Nalog nije pronađen.');return {...rich(s,o),photos:s.photos.filter(p=>p.work_order_id===key).map(p=>({id:p.id,url:'#photo-'+p.id}))};}
        let rows=s.orders.filter(o=>(!q.get('status')||(q.get('status')==='active'?['received','in_progress','waiting'].includes(o.status||'done'):(o.status||'done')===q.get('status')))&&(!q.get('from')||o.date>=q.get('from'))&&(!q.get('to')||o.date<=q.get('to'))&&(!q.get('client_id')||o.client_id===num(q.get('client_id')))&&(!q.get('vehicle_id')||o.vehicle_id===num(q.get('vehicle_id')))).map(o=>rich(s,o));
        const search=(q.get('search')||'').toLowerCase();if(search)rows=rows.filter(o=>[o.order_number,o.description,o.client_name,o.vehicle_name].some(x=>String(x||'').toLowerCase().includes(search)));
        return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
      }
      if(parts[2]==='photos'&&method==='POST'){if(!s.orders.some(o=>o.id===key))err('Nalog nije pronađen.');const files=body.getAll('photos');if(files.length>12)err('Najviše 12 fotografija.');for(const f of files){if(!f.type.startsWith('image/'))err('Dozvoljene su samo slike.');if(f.size>12*1024*1024)err('Fotografija je prevelika.');s.photos.push({id:next('photos'),work_order_id:key,blob:f});}return save({ok:true});}
      if(method==='DELETE'){const i=s.orders.findIndex(o=>o.id===key);if(i<0)err('Nalog nije pronađen.');s.orders.splice(i,1);s.photos=s.photos.filter(p=>p.work_order_id!==key);return save({ok:true});}
      const client_id=num(body.client_id),vehicle_id=num(body.vehicle_id);if(!s.clients.some(c=>c.id===client_id))err('Klijent ne postoji.');if(!s.vehicles.some(v=>v.id===vehicle_id&&v.client_id===client_id))err('Vozilo ne pripada izabranom klijentu.');if(!String(body.description||'').trim())err('Opis posla je obavezan.');
      const values={...body,client_id,vehicle_id,spent_amount:num(body.spent_amount),charged_amount:num(body.charged_amount),status:body.status||'done',next_service_km:body.next_service_km===''?null:(body.next_service_km==null?null:num(body.next_service_km)),next_service_date:body.next_service_date||null};
      if(body.mileage!=null && body.mileage!==''){const v=s.vehicles.find(x=>x.id===vehicle_id);if(v)v.mileage=Math.max(num(v.mileage),num(body.mileage));}
      if(method==='POST'){const o={...values,id:next('orders'),order_number:'RN-'+String(++s.seq).padStart(6,'0'),created_at:stamp(),updated_at:stamp()};s.orders.push(o);return save(rich(s,o));}
      if(method==='PUT'){const i=s.orders.findIndex(o=>o.id===key);if(i<0)err('Nalog nije pronađen.');s.orders[i]={...s.orders[i],...values,id:key,updated_at:stamp()};return save(rich(s,s.orders[i]));}
    }
    if(table==='photos'){
      const i=s.photos.findIndex(p=>p.id===key);if(i<0)err('Fotografija nije pronađena.');if(method==='GET')return s.photos[i].blob;
      if(method==='DELETE'){s.photos.splice(i,1);return save({ok:true});}
    }
    if(table==='reminders'){
      const p=n=>String(n).padStart(2,'0'), d=new Date(), today=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
      d.setDate(d.getDate()+30);const cutoff=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
      const latest=new Map();for(const o of [...s.orders].sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.id-a.id)){if(!latest.has(o.vehicle_id))latest.set(o.vehicle_id,o);}
      const rows=[...latest.values()].filter(o=>{const v=s.vehicles.find(v=>v.id===o.vehicle_id);return (o.next_service_date&&o.next_service_date<=cutoff)||(o.next_service_km!=null&&v&&num(v.mileage)>=num(o.next_service_km));}).map(o=>{const v=s.vehicles.find(v=>v.id===o.vehicle_id),c=s.clients.find(c=>c.id===o.client_id);return {id:o.id,order_number:o.order_number,next_service_date:o.next_service_date,next_service_km:o.next_service_km,client_name:c?.name||'',phone:c?.phone||'',vehicle_name:v?`${v.make} ${v.model}`:'',registration:v?.registration||'',vehicle_mileage:v?.mileage??null};}).sort((a,b)=>(a.next_service_date||'9999').localeCompare(b.next_service_date||'9999')).slice(0,30);
      return {today,rows};
    }
    if(table==='stats'){
      const rows=s.orders.filter(o=>(!q.get('from')||o.date>=q.get('from'))&&(!q.get('to')||o.date<=q.get('to'))),spent=rows.reduce((a,o)=>a+num(o.spent_amount),0),charged=rows.reduce((a,o)=>a+num(o.charged_amount),0);
      const group=(items,getKey)=>{const m=new Map();for(const o of items){const k=getKey(o);m.set(k,(m.get(k)||0)+1);}return [...m].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,5);};
      const dates=new Map();for(const o of rows){const d=dates.get(o.date)||{date:o.date,spent:0,charged:0};d.spent+=num(o.spent_amount);d.charged+=num(o.charged_amount);dates.set(o.date,d);}
      return {totals:{count:rows.length,spent,charged,difference:charged-spent,average:rows.length?Math.round(charged/rows.length):0},clients:s.clients.length,vehicles:s.vehicles.length,trend:[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)),makes:group(rows,o=>s.vehicles.find(v=>v.id===o.vehicle_id)?.make||''),active:group(rows,o=>s.clients.find(c=>c.id===o.client_id)?.name||''),recent:s.orders.map(o=>rich(s,o)).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id).slice(0,6)};
    }
    if(table==='export'){
      const rows=s.orders.filter(o=>(!q.get('from')||o.date>=q.get('from'))&&(!q.get('to')||o.date<=q.get('to'))).map(o=>rich(s,o)).sort((a,b)=>b.date.localeCompare(a.date));
      if(parts[1]==='csv')return downloadCSV(rows,s.settings.currency||'RSD');
      if(parts[1]==='pdf'){const w=opt.previewWindow || window.open('','_blank');if(!w)err('Dozvolite iskačuće prozore za PDF.');const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>AutoDesk izveštaj</title><style>body{font:12px Arial;padding:25px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:6px;text-align:left}h1{font-size:20px}</style></head><body><h1>AutoDesk – izveštaj</h1><table><tr>'+['Broj','Datum','Klijent','Vozilo','Opis','Potrošeno','Naplaćeno','Razlika'].map(x=>'<th>'+x+'</th>').join('')+'</tr>'+rows.map(o=>'<tr>'+[o.order_number,o.date,o.client_name,o.vehicle_name,o.description,(o.spent_amount/100).toFixed(2),(o.charged_amount/100).toFixed(2),(o.difference/100).toFixed(2)].map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</table><p>Valuta: '+escape(s.settings.currency||'RSD')+'</p></body></html>');w.document.close();return null;}
    }
    if(table==='backups'){
      if(method==='GET'&&!parts[1])return Object.keys(s.backups||{}).sort().reverse();
      if(method==='POST'){const filename='autodesk-'+stamp().replace(/[:.]/g,'-')+'.json';const snapshot=clone({...s,backups:{}});s.backups??={};s.backups[filename]=snapshot;await write(s);return {filename};}
      if(method==='GET'&&parts[1]){const snapshot=s.backups?.[decodeURIComponent(parts[1])];if(!snapshot)err('Kopija nije pronađena.');return new Blob([JSON.stringify(await serialize(snapshot))],{type:'application/json'});}
    }
    err('Nepodržana operacija: '+method+' '+url);
  }
  async function digest(password,salt){const data=new TextEncoder().encode(salt.join(',')+':'+password);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function serialize(s){const result=clone(s);for(const p of result.photos||[]){if(p.blob instanceof Blob){p.data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(p.blob);});delete p.blob;}}return result;}
  async function restore(file){const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.clients)||!Array.isArray(parsed.orders)||!Array.isArray(parsed.vehicles)||!Array.isArray(parsed.services))err('Neispravna kopija.');for(const p of parsed.photos||[]){if(p.data){p.blob=await(await fetch(p.data)).blob();delete p.data;}}parsed.backups={};await write(parsed);}
  return {call,restore,exportAll:async()=>new Blob([JSON.stringify(await serialize(await read()))],{type:'application/json'})};
})();
