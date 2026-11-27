'use strict';
(() => {
 const cap=globalThis.Capacitor;
 const android=cap?.getPlatform?.()==='android';
 const repo=globalThis.AUTODESK_REPOSITORY;
 let busy=false,lastPrompt=0;
 async function check(manual=false){
   if(!android||!repo||busy)return;
   busy=true;
   try{
     const app=await cap.Plugins.App.getInfo();
     const base=`https://github.com/${repo}/releases/download/apk-latest/`;
     const response=await fetch(`https://api.github.com/repos/${repo}/releases/tags/apk-latest`,{cache:'no-store'});
     if(!response.ok)throw Error('HTTP '+response.status);
     const release=await response.json();
     const asset=release.assets?.find(x=>x.name==='android-update.json');
     if(!asset)throw Error('Nema objavljenih metapodataka.');
     // Native HTTP avoids GitHub asset redirect CORS restrictions.
     const result=await cap.Plugins.CapacitorHttp.get({url:base+'android-update.json',headers:{'Cache-Control':'no-cache'}});
     const meta=typeof result.data==='string'?JSON.parse(result.data):result.data;
     if(result.status!==200||!Number.isSafeInteger(meta.versionCode)||!/^1\.0\.\d+$/.test(meta.versionName))throw Error('Neispravna verzija.');
     if(meta.versionCode<=Number(app.build)){if(manual)alert('Koristite najnoviju verziju.');return;}
     if(!manual&&lastPrompt===meta.versionCode)return;
     lastPrompt=meta.versionCode;
     if(confirm(`Dostupna je verzija ${meta.versionName}. Otvoriti preuzimanje APK-a?`))await cap.Plugins.AutoDeskUpdate.open({url:base+'AutoDesk.apk'});
   }catch(e){if(manual)alert('Provera ažuriranja nije uspela: '+e.message);}
   finally{busy=false;}
 }
 function mount(root){if(!android||!repo||!root)return;const panel=document.createElement('section');panel.className='panel';const h=document.createElement('h3');h.textContent='Ažuriranje aplikacije';const p=document.createElement('p');p.className='subtle';cap.Plugins.App.getInfo().then(x=>p.textContent='Trenutna verzija: '+x.version).catch(()=>{});const b=document.createElement('button');b.className='secondary';b.textContent='Proveri ažuriranja';b.onclick=()=>check(true);panel.append(h,p,b);root.prepend(panel);}
 globalThis.AutoDeskUpdates={mount};
 if(android&&repo){addEventListener('load',()=>check());setInterval(()=>check(),3600000);}
})();
