/* Firebase Cloud Firestore synchronization for a single authenticated owner. */
'use strict';
const CloudSync = (() => {
  const cfg = window.AUTODESK_FIREBASE_CONFIG || {};
  const ready = !!(cfg.apiKey && cfg.projectId && cfg.appId && cfg.ownerUid && !cfg.apiKey.includes('OVDE'));
  let auth, db;
  if(ready){
    firebase.initializeApp(cfg);
    auth=firebase.auth(); db=firebase.firestore();
  }
  const user=()=>{const u=auth?.currentUser;if(!u||u.uid!==cfg.ownerUid)throw Error('Prijavite se vlasničkim nalogom.');return u;};
  const root=()=>db.collection('autodesk_users').doc(user().uid).collection('sync');
  async function load(){
    const meta=await root().doc('meta').get();
    if(!meta.exists)return null;
    const count=meta.data().count;
    if(!Number.isSafeInteger(count)||count<1||count>1000)throw Error('Neispravna struktura podataka u oblaku.');
    const docs=await Promise.all(Array.from({length:count},(_,i)=>root().doc('chunk_'+i).get()));
    if(docs.some(d=>!d.exists))throw Error('Nedostaje deo podataka u oblaku.');
    const parsed=JSON.parse(docs.map(d=>d.data().text).join(''));
    for(const p of parsed.photos||[]){if(p.data){p.blob=await(await fetch(p.data)).blob();delete p.data;}}
    return parsed;
  }
  async function save(state){
    const copy=structuredClone(state);
    for(const p of copy.photos||[]){if(p.blob instanceof Blob){p.data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(p.blob);});delete p.blob;}}
    const json=JSON.stringify(copy), size=350000;
    const chunks=[];for(let i=0;i<json.length;i+=size)chunks.push(json.slice(i,i+size));
    if(chunks.length>900)throw Error('Previše podataka za besplatnu sinhronizaciju.');
    const col=root(),old=await col.doc('meta').get(),oldCount=old.exists?(old.data().count||0):0;
    // Write content before the manifest; a failed upload never publishes a new manifest.
    for(let i=0;i<chunks.length;i+=400){const batch=db.batch();chunks.slice(i,i+400).forEach((text,j)=>batch.set(col.doc('chunk_'+(i+j)),{text}));await batch.commit();}
    await col.doc('meta').set({count:chunks.length,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    for(let i=chunks.length;i<oldCount;i+=400){const batch=db.batch();for(let j=i;j<Math.min(oldCount,i+400);j++)batch.delete(col.doc('chunk_'+j));await batch.commit();}
  }
  async function login(email,password){
    if(!ready)throw Error('Firebase konfiguracija nije potpuna.');
    const result=await auth.signInWithEmailAndPassword(email,password);
    if(result.user.uid!==cfg.ownerUid){await auth.signOut();throw Error('Ovaj nalog nema pristup.');}
    return result;
  }
  async function register(){throw Error('Nalog već postoji. Prijavite se postojećim Firebase nalogom.');}
  async function resend(email,password){
    if(!ready)throw Error('Firebase nije podešen.');
    const result=await auth.signInWithEmailAndPassword(email,password);
    if(result.user.uid!==cfg.ownerUid){await auth.signOut();throw Error('Ovaj nalog nema pristup.');}
    if(!result.user.emailVerified)await result.user.sendEmailVerification();
    await auth.signOut();
  }
  return {ready,load,save,login,register,resend,logout:()=>auth?.signOut(),currentUser:()=>auth?.currentUser,waitForAuth:()=>new Promise(resolve=>{if(!ready)return resolve(null);const off=auth.onAuthStateChanged(u=>{off();resolve(u);},()=>resolve(null));})};
})();

window.CloudSync = CloudSync;
