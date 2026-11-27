'use strict';
(() => {
 const cap=globalThis.Capacitor;
 const android=cap?.getPlatform?.()==='android';
 const repo=globalThis.AUTODESK_REPOSITORY;
 if(android){
   cap.Plugins.App.getInfo().then(info=>{
     const label=document.getElementById('appVersion');
     if(label&&info.version){label.textContent='AutoDesk v'+info.version.replace(/^(\d+\.\d+)\.0$/,'$1');label.hidden=false;}
   }).catch(e=>console.warn('App version:',e.message));
 }
 let busy=false,lastPrompt=0;
 const plugin=cap?.Plugins?.AutoDeskUpdate;
 let host, shadow;
 const mb=n=>n>=0?(n/1048576).toFixed(1)+' MB':'—';
 function popup(title,message,buttons=[],progress=false){
   if(!host){host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647';shadow=host.attachShadow({mode:'open'});document.body.append(host);}
   host.hidden=false;shadow.replaceChildren();
   const style=document.createElement('style');style.textContent=`.overlay{position:absolute;inset:0;background:#000a;display:grid;place-items:center;padding:18px;font-family:Arial,sans-serif}.panel{box-sizing:border-box;width:min(100%,440px);background:#202124;color:#fff;border:1px solid #444;border-top:3px solid #e3212b;border-radius:12px;padding:24px;box-shadow:0 20px 80px #0009}.brand{color:#ef4444;font-size:11px;font-weight:bold;letter-spacing:.15em}h2{font-size:22px}p{color:#ccc;font-size:14px;line-height:1.5;overflow-wrap:anywhere}progress{width:100%;accent-color:#e3212b;height:14px}.actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}button{padding:12px;border-radius:7px;background:#34353a;color:white;border:1px solid #555;font-weight:bold}button:last-child{background:#c91e28}`;
   const overlay=document.createElement('div'),panel=document.createElement('section');overlay.className='overlay';panel.className='panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
   const add=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;panel.append(e);return e;};
   add('div','AUTODESK / UPDATE','brand');add('h2',title);add('p',message);
   if(progress){const stats=add('p','Priprema preuzimanja…');stats.id='stats';const bar=add('progress','');bar.max=100;bar.id='bar';}
   const actions=add('div','','actions');for(const [label,fn] of buttons){const b=document.createElement('button');b.textContent=label;b.onclick=fn;actions.append(b);}
   overlay.append(panel);shadow.append(style,overlay);
 }
 const close=()=>{if(host)host.hidden=true;};
 const notice=(title,msg)=>popup(title,msg,[['Zatvori',close]]);
 async function install(){try{const result=await plugin.install();if(result?.permissionRequired)popup('Dozvola za instalaciju','Dozvolite instaliranje aplikacija iz ovog izvora u Android podešavanjima, vratite se i ponovo pritisnite Instaliraj.',[['Kasnije',close],['Instaliraj',install]]);}catch(e){notice('Instalacija nije uspela',e.message);}}
 async function download(url){
   if(busy)return;busy=true;let listener;
   popup('Preuzimanje ažuriranja','Nova verzija aplikacije se preuzima…',[],true);
   try{listener=await plugin.addListener('progress',p=>{const bar=shadow.getElementById('bar'),stats=shadow.getElementById('stats');if(!bar||!stats)return;const percent=p.total>0?Math.min(100,Math.floor(p.received/p.total*100)):null;if(percent!==null)bar.value=percent;stats.textContent=mb(p.received)+' / '+mb(p.total)+(percent===null?'':' · '+percent+'%')+' · '+mb(p.speed)+'/s';});await plugin.download({url});popup('Ažuriranje je spremno','Preuzimanje je završeno. Android će tražiti potvrdu instalacije.',[['Kasnije',close],['Instaliraj',install]]);}catch(e){notice('Preuzimanje nije uspelo',e.message);}finally{await listener?.remove();busy=false;}
 }
 async function check(manual=false){
   if(!android||!repo||busy|| (host&&!host.hidden))return;
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
     if(result.status!==200||!Number.isSafeInteger(meta.versionCode)||!/^\d+\.\d+(\.\d+)?$/.test(meta.versionName))throw Error('Neispravna verzija.');
     if(meta.versionCode<=Number(app.build)){if(manual)notice('Imate najnoviju verziju','Nema dostupnih novih ažuriranja.');return;}
     if(!manual&&lastPrompt===meta.versionCode)return;
     lastPrompt=meta.versionCode;
     popup('Nova verzija je dostupna',`Dostupna je verzija ${meta.versionName}.`,[['Kasnije',close],['Preuzmi',()=>download(base+'AutoDesk.apk')]]);
   }catch(e){if(manual)notice('Provera ažuriranja nije uspela',e.message);}
   finally{busy=false;}
 }
 function mount(root){if(!android||!repo||!root)return;const panel=document.createElement('section');panel.className='panel';const h=document.createElement('h3');h.textContent='Ažuriranje aplikacije';const p=document.createElement('p');p.className='subtle';cap.Plugins.App.getInfo().then(x=>p.textContent='Trenutna verzija: '+x.version).catch(()=>{});const b=document.createElement('button');b.className='secondary';b.textContent='Proveri ažuriranja';b.onclick=()=>check(true);panel.append(h,p,b);root.prepend(panel);}
 globalThis.AutoDeskUpdates={mount};
 if(android&&repo){addEventListener('load',()=>check());setInterval(()=>check(),3600000);}
})();
