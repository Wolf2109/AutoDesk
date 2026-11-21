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
 * Svaka verzija evidencije dobija svoje delove (jedinstven prefiks), a meta se prebacuje transakcijom
 * samo ako je verzija ista kao ona koju je uređaj pročitao. Tako dva uređaja ne mogu da pomešaju
 * delove niti da tiho prepišu tuđu izmenu.
 */
const CloudSync = (() => {
  const cfg = window.AUTODESK_FIREBASE_CONFIG || {};
  const sdk = typeof firebase !== 'undefined';
  const ready = !!(sdk && cfg.apiKey && cfg.projectId && cfg.appId && cfg.ownerUid && !cfg.apiKey.includes('OVDE'));
  const CHUNK = 250000;      // znakova po dokumentu (Firestore ograničenje je 1 MiB)
  const PHOTO_MAX = 900000;  // najveća dozvoljena dužina jedne fotografije (data URL)
  let auth, db;
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

  async function getMeta() {
    const d = await syncCol().doc('meta').get();
    return d.exists ? d.data() : null;
  }

  async function readChunks(meta) {
    const count = meta.count;
    if (!Number.isSafeInteger(count) || count < 1 || count > 2000) throw Error('Neispravna struktura podataka u oblaku.');
    const prefix = meta.prefix || 'chunk_'; // stariji format nije imao prefiks
    const docs = await Promise.all(Array.from({ length: count }, (_, i) => syncCol().doc(prefix + i).get()));
    if (docs.some(d => !d.exists)) return null;
    return JSON.parse(docs.map(d => d.data().text).join(''));
  }

  /** Učitava trenutnu evidenciju. Ako je neko u međuvremenu objavio novu verziju, pokušava ponovo. */
  async function loadState() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const meta = await getMeta();
      if (!meta) return { meta: null, state: null };
      const state = await readChunks(meta);
      if (state) return { meta, state };
      await sleep(400 * (attempt + 1));
    }
    throw Error('Podaci u oblaku se trenutno menjaju. Pokušajte ponovo za nekoliko sekundi.');
  }

  /** Čuva novu verziju; baca grešku sa code === 'conflict' ako je verzija u oblaku promenjena. */
  async function saveState(state, baseVersion) {
    const chunks = split(JSON.stringify(state));
    if (chunks.length > 1500) throw Error('Previše podataka za sinhronizaciju.');
    const version = baseVersion + 1, prefix = `s${version}_${token()}_`, col = syncCol(), metaRef = col.doc('meta');
    let old = null;
    try {
      for (let i = 0; i < chunks.length; i += 400) {
        const b = db.batch();
        chunks.slice(i, i + 400).forEach((text, j) => b.set(col.doc(prefix + (i + j)), { text }));
        await b.commit();
      }
      await db.runTransaction(async tx => {
        const m = await tx.get(metaRef);
        const current = m.exists ? (m.data().version || 0) : 0;
        if (current !== baseVersion) { const e = Error('Podaci su izmenjeni na drugom uređaju.'); e.code = 'conflict'; throw e; }
        old = m.exists ? m.data() : null;
        tx.set(metaRef, { version, prefix, count: chunks.length, updatedAt: stamp() });
      });
    } catch (e) {
      await batchDelete(chunks.map((_, i) => col.doc(prefix + i))).catch(() => {});
      throw e;
    }
    if (old?.count) {
      const oldPrefix = old.prefix || 'chunk_';
      await batchDelete(Array.from({ length: old.count }, (_, i) => col.doc(oldPrefix + i))).catch(() => {});
    }
    return version;
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
    for (let i = 0; i < chunks.length; i += 400) {
      const b = db.batch();
      chunks.slice(i, i + 400).forEach((t, j) => b.set(col.doc(String(i + j)), { text: t }));
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
    if (!ready) throw Error('Firebase nije dostupan. Proverite internet vezu i firebase-config.js.');
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
    ready, getMeta, loadState, saveState, putPhoto, getPhoto, deletePhotos,
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
