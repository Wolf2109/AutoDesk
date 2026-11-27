'use strict';
/*
 * Firebase Cloud Firestore sinhronizacija (jedan vlasnik).
 *
 * Raspored u bazi (autodesk_users/{uid}/...):
 *   sync/meta                 -> { version, prefix, count }   (pokazivač na trenutnu verziju evidencije)
 *   sync/{prefix}{i}          -> { text }                     (JSON evidencije podeljen u delove; bez fotografija)
 *   photos/{id}               -> { order_id, data }           (jedna smanjena fotografija = jedan dokument)
 *   backups/{name}            -> { kind, ts, count, size }    + backups/{name}/chunks/{i} -> { text }
 *
 * Male izmene menjaju samo zahvaćene delove u jednoj transakciji sa meta dokumentom.
 * Velike izmene koriste nov prefiks; čitanje proverava verziju pre i posle.
 */
const CloudSync = (() => {
  const cfg = window.AUTODESK_FIREBASE_CONFIG || {};
  const sdk = typeof firebase !== 'undefined';
  const ready = !!(sdk && cfg.apiKey && cfg.projectId && cfg.appId && cfg.ownerUid && !cfg.apiKey.includes('OVDE'));
  const CHUNK = 250000;      // znakova po dokumentu (Firestore ograničenje je 1 MiB)
  const PHOTO_MAX = 900000;  // najveća dozvoljena dužina jedne fotografije (data URL)
  let auth, db, cached = null;
  if (ready) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const token = () => Math.random().toString(36).slice(2, 10);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const user = () => {
    const u = auth?.currentUser;
    if (!u || u.uid !== cfg.ownerUid) throw Error('Prijavite se vlasničkim nalogom.');
    return u;
  };
  const base = () => db.collection('autodesk_users').doc(user().uid);
  const syncCol = () => base().collection('sync');
  const split = text => {
    const parts = [];
    for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
    return parts.length ? parts : [''];
  };
  async function batchDelete(refs) {
    for (let i = 0; i < refs.length; i += 400) {
      const b = db.batch();
      refs.slice(i, i + 400).forEach(r => b.delete(r));
      await b.commit();
    }
  }

  /* ---------- evidencija ---------- */

  const GROUPS = ['clients', 'vehicles', 'services', 'orders', 'photo_metadata'];
  const keys = ['clients', 'vehicles', 'services', 'orders', 'photos'];
  const colFor = (generation, group) => base().collection('record_sets').doc(generation).collection(group);
  const rawMeta = async () => {
    const d = await syncCol().doc('meta').get({source:'server'});
    return d.exists ? d.data() : null;
  };
  const conflict = () => Object.assign(Error('Podaci su izmenjeni na drugom uređaju.'), {code:'conflict'});
  const restOf = state => Object.fromEntries(Object.entries(state).filter(([k]) => !keys.includes(k)));
  const rowMap = (state, k) => {
    const map = new Map();
    for (const row of state[k] || []) {
      const id = String(row.id);
      if (!id || id === 'undefined' || id.includes('/') || map.has(id)) throw Error('Neispravan ili dupliran ID: '+k);
      const payload = JSON.stringify(row);
      if (new TextEncoder().encode(payload).length > 900000) throw Error('Zapis je prevelik: '+k);
      map.set(id,payload);
    }
    return map;
  };
  async function readChunks(meta) {
    if (!Number.isSafeInteger(meta.count) || meta.count < 1 || meta.count > 2000) throw Error('Neispravna stara evidencija.');
    const docs = await Promise.all(Array.from({length:meta.count}, (_,i) => syncCol().doc((meta.prefix || 'chunk_')+i).get({source:'server'})));
    if (docs.some(d => !d.exists)) throw Error('Nedostaje deo stare evidencije.');
    return JSON.parse(docs.map(d=>d.data().text).join(''));
  }
  // A fresh generation is invisible until its pointer commits. Never delete the legacy data.
  async function publishGeneration(state, expected, legacy = null) {
    const generation = db.collection('autodesk_users').doc().id, version = expected + 1;
    const payload = JSON.stringify(restOf(state));
    if (new TextEncoder().encode(payload).length > 900000) throw Error('Podešavanja su prevelika.');
    const records = keys.flatMap((k,i) => [...rowMap(state,k)].map(([id,payload]) => ({ref:colFor(generation,GROUPS[i]).doc(id),payload})));
    for (let i=0;i<records.length;i+=8) {
      const batch=db.batch();
      records.slice(i,i+8).forEach(r=>batch.set(r.ref,{payload:r.payload,revision:version,deleted:false}));
      await batch.commit();
    }
    const meta = {schema:2,generation,version,payload,groupVersions:Object.fromEntries(GROUPS.map(g=>[g,version]))};
    await db.runTransaction(async tx=>{
      const ref=syncCol().doc('meta'), d=await tx.get(ref), m=d.exists?d.data():null;
      if ((m?.version || 0)!==expected || (legacy && m?.schema===2)) throw conflict();
      tx.set(ref,{...meta,updatedAt:stamp(), ...(legacy?{legacy:{version:legacy.version,prefix:legacy.prefix||'chunk_',count:legacy.count}}:m?.legacy?{legacy:m.legacy}:{})});
    });
    cached={meta,state:JSON.stringify(state)};
    return meta;
  }
  async function getMeta() {
    for(let attempt=0;attempt<3;attempt++) {
      const meta=await rawMeta();
      if (!meta || meta.schema===2) return meta;
      const state=await readChunks(meta);
      try { return await publishGeneration(state,meta.version||0,meta); }
      catch(e) { if(e.code!=='conflict') throw e; }
    }
    throw conflict();
  }
  async function loadState(firstMeta) {
    for(let attempt=0;attempt<4;attempt++) {
      const meta=attempt===0 && firstMeta ? firstMeta : await getMeta();
      if(!meta) return {meta:null,state:null};
      if(meta.schema!==2) throw Error('Nepodržan format baze.');
      const previous=cached && cached.meta.schema===2 && cached.meta.generation===meta.generation && cached.meta.version<=meta.version ? cached : null;
      if(previous?.meta.version===meta.version) return {meta,state:JSON.parse(previous.state)};
      const state=JSON.parse(meta.payload);
      const old=previous ? JSON.parse(previous.state) : {};
      for(let i=0;i<keys.length;i++) {
        const k=keys[i], col=colFor(meta.generation,GROUPS[i]);
        const map=new Map((old[k]||[]).map(r=>[String(r.id),r]));
        if(previous && meta.groupVersions?.[GROUPS[i]] <= previous.meta.version) { state[k]=[...map.values()]; continue; }
        let q=previous ? col.where('revision','>',previous.meta.version) : col;
        // Bounded network pages; first sync still builds the complete offline copy.
        q=q.orderBy(previous?'revision':firebase.firestore.FieldPath.documentId()).limit(250);
        while(true) {
          const page=await q.get({source:'server'});
          for(const d of page.docs) {
            const r=d.data();
            if(r.deleted) map.delete(d.id); else map.set(d.id,JSON.parse(r.payload));
          }
          if(page.docs.length<250) break;
          q=q.startAfter(page.docs[page.docs.length-1]);
        }
        state[k]=[...map.values()].sort((a,b)=>Number(a.id)-Number(b.id));
      }
      const check=await rawMeta();
      if(check?.version===meta.version && check.generation===meta.generation) {
        cached={meta,state:JSON.stringify(state)}; return {meta,state};
      }
      await sleep(200*(attempt+1));
    }
    throw Error('Podaci se trenutno menjaju. Ponovite sinhronizaciju.');
  }
  async function saveState(state, baseVersion) {
    if(!cached || cached.meta.version!==baseVersion || cached.meta.schema!==2) {
      const meta=await getMeta();
      if((meta?.version||0)!==baseVersion) throw conflict();
      if(!meta) return (await publishGeneration(state,baseVersion)).version;
      await loadState(meta);
    }
    const previous=JSON.parse(cached.state), meta=cached.meta, version=baseVersion+1, changes=[];
    const payload=JSON.stringify(restOf(state));
    if(new TextEncoder().encode(payload).length>900000) throw Error('Podešavanja su prevelika.');
    keys.forEach((k,i)=>{
      const before=rowMap(previous,k), after=rowMap(state,k), col=colFor(meta.generation,GROUPS[i]);
      for(const [id,p] of after) if(before.get(id)!==p) changes.push({group:GROUPS[i],ref:col.doc(id),data:{payload:p,revision:version,deleted:false}});
      for(const id of before.keys()) if(!after.has(id)) changes.push({group:GROUPS[i],ref:col.doc(id),data:{revision:version,deleted:true}});
    });
    if(!changes.length && payload===meta.payload) return baseVersion;
    const bytes=changes.reduce((n,r)=>n+new TextEncoder().encode(r.data.payload||'').length+1024,0);
    if(changes.length>400 || bytes>7000000) return (await publishGeneration(state,baseVersion)).version;
    const groupVersions={...meta.groupVersions};
    for(const r of changes) groupVersions[r.group]=version;
    const next={...meta,version,payload,groupVersions};
    await db.runTransaction(async tx=>{
      const ref=syncCol().doc('meta'), d=await tx.get(ref);
      if(!d.exists || d.data().version!==baseVersion || d.data().generation!==meta.generation) throw conflict();
      changes.forEach(r=>tx.set(r.ref,r.data));
      tx.set(ref,{...next,updatedAt:stamp()});
    });
    cached={meta:next,state:JSON.stringify(state)}; return version;
  }
  const cacheMeta = () => cached?.meta || null;
  function primeCache(meta,state) {
    if(meta?.schema===2 && state && (!cached || cached.meta.version<=meta.version)) cached={meta,state:JSON.stringify(state)};
  }

  /* ---------- fotografije ---------- */

  async function putPhoto(id, dataUrl, orderId) {
    if (String(dataUrl).length > PHOTO_MAX) throw Error('Fotografija je prevelika čak i posle smanjivanja.');
    await base().collection('photos').doc(String(id)).set({ order_id: orderId, data: dataUrl, created: stamp() });
  }
  async function getPhoto(id) {
    const d = await base().collection('photos').doc(String(id)).get();
    if (!d.exists) throw Error('Fotografija nije pronađena.');
    return d.data().data;
  }
  async function deletePhotos(ids) {
    const col = base().collection('photos');
    await batchDelete(ids.map(id => col.doc(String(id))));
  }

  /* ---------- rezervne kopije ---------- */

  async function putBackup(name, text, kind = 'manual') {
    const ref = base().collection('backups').doc(name), chunks = split(text), col = ref.collection('chunks');
    for (let i = 0; i < chunks.length; i += 10) {
      const b = db.batch();
      chunks.slice(i, i + 10).forEach((t, j) => b.set(col.doc(String(i + j)), { text: t }));
      await b.commit();
    }
    await ref.set({ kind, ts: Date.now(), count: chunks.length, size: text.length });
  }
  async function listBackups() {
    const snap = await base().collection('backups').get();
    return snap.docs.map(d => ({ name: d.id, kind: d.data().kind || 'manual', ts: d.data().ts || 0, size: d.data().size || 0 })).sort((a, b) => b.ts - a.ts);
  }
  async function getBackup(name) {
    const ref = base().collection('backups').doc(name), meta = await ref.get();
    if (!meta.exists) throw Error('Kopija nije pronađena.');
    const docs = await Promise.all(Array.from({ length: meta.data().count }, (_, i) => ref.collection('chunks').doc(String(i)).get()));
    if (docs.some(d => !d.exists)) throw Error('Kopija je oštećena.');
    return docs.map(d => d.data().text).join('');
  }
  async function deleteBackup(name) {
    const ref = base().collection('backups').doc(name), meta = await ref.get();
    if (!meta.exists) return;
    await batchDelete(Array.from({ length: meta.data().count }, (_, i) => ref.collection('chunks').doc(String(i))));
    await ref.delete();
  }

  /* ---------- prijava ---------- */

  async function login(email, password) {
    if (!ready) throw Error('Firebase nije dostupan. Proverite internet vezu i config/firebase-config.js.');
    const result = await auth.signInWithEmailAndPassword(email, password);
    if (result.user.uid !== cfg.ownerUid) { await auth.signOut(); throw Error('Ovaj nalog nema pristup.'); }
    return result;
  }
  async function resetPassword(email) {
    if (!ready) throw Error('Firebase nije dostupan.');
    if (!email) throw Error('Unesite email adresu.');
    await auth.sendPasswordResetEmail(email);
  }
  async function changePassword(current, next) {
    const u = user();
    if (!current || !next || next.length < 6) throw Error('Unesite postojeću i novu lozinku (min. 6 znakova).');
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, current));
    await u.updatePassword(next);
  }

  /* ---------- lična vozila (zasebna celina) ----------
   * Potpuno odvojen koren u bazi: autodesk_private/{uid}/vehicles i /entries.
   * Ne dodiruje autodesk_users/{uid} (radni nalozi, klijenti, fotografije, kopije). */
  const privateRoot = () => db.collection('autodesk_private').doc(user().uid);

  return {
    privateRoot, privateDb: () => db, privateBatchDelete: batchDelete, privateStamp: stamp,
    ready, getMeta, loadState, saveState, primeCache, cacheMeta, putPhoto, getPhoto, deletePhotos,
    putBackup, listBackups, getBackup, deleteBackup, login, resetPassword, changePassword,
    logout: () => auth?.signOut(),
    currentUser: () => auth?.currentUser,
    waitForAuth: () => new Promise(resolve => {
      if (!ready) return resolve(null);
      const off = auth.onAuthStateChanged(u => { off(); resolve(u); }, () => resolve(null));
    })
  };
})();

window.CloudSync = CloudSync;
