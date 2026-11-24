const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {webcrypto} = require('node:crypto');
let stored, remote = null, version = 0, writes = 0;
const db = {transaction(){return {objectStore(){return {get(){const r={};queueMicrotask(()=>{r.result=structuredClone(stored);r.onsuccess()});return r},put(v){stored=structuredClone(v)}}},set oncomplete(fn){queueMicrotask(fn)}}}};
const indexedDB = {open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess()});return r}};
const CloudSync = {ready:true,getMeta:async()=>remote?{version}:null,loadState:async()=>({meta:{version},state:structuredClone(remote)}),saveState:async(s,v)=>{assert.equal(v,version);remote=structuredClone(s);writes++;return ++version},primeCache(){}};
const navigator={onLine:true};
function boot(){const c=vm.createContext({window:{CloudSync},CloudSync,navigator,indexedDB,structuredClone,crypto:webcrypto,URL,FormData,Blob,console,Date,Math,Set,Map});vm.runInContext(fs.readFileSync('local-api.js','utf8')+'\nthis.api=LocalAPI;',c);return c.api;}
(async()=>{let api=boot();await api.call('/settings');const first=await api.call('/clients',{method:'POST',body:JSON.stringify({name:'A'})});assert.equal(writes,1);navigator.onLine=false;const second=await api.call('/clients',{method:'POST',body:JSON.stringify({name:'B'})});assert.equal(writes,1);assert.equal(api.status().pending,true);api=boot();assert.equal((await api.call('/clients')).length,2);remote.clients.push({id:42,name:'C'});version++;navigator.onLine=true;await api.refresh();assert.equal(remote.clients.length,3);assert.equal(api.status().pending,false);navigator.onLine=false;await api.call('/clients/'+first.id,{method:'PUT',body:JSON.stringify({name:'local'})});remote.clients.find(x=>x.id===first.id).name='remote';version++;navigator.onLine=true;await assert.rejects(api.refresh(),/Sukob/);assert.equal(api.status().pending,true);assert.equal((await api.call('/clients')).find(x=>x.id===first.id).name,'local');console.log('Offline smoke OK: restart, merge, conflict retention');})().catch(e=>{console.error(e);process.exitCode=1});
