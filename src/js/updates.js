'use strict';
(() => {
 const cap=globalThis.Capacitor;
 const android=cap?.getPlatform?.()==='android';
 const repo=globalThis.AUTODESK_REPOSITORY;
 if(android){
   cap.Plugins.App.getInfo().then(info=>{
     const label=document.getElementById('appVersion');
     if(label&&info.version){label.textContent='v'+info.version.replace(/^(\d+\.\d+)\.0$/,'$1');label.hidden=false;}
   }).catch(e=>console.warn('App version:',e.message));
 }
 let busy=false,lastPrompt=0;
 const plugin=cap?.Plugins?.AutoDeskUpdate;
 let host, shadow;
 const mb=n=>n>=0?(n/1048576).toFixed(1)+' MB':'—';
 function popup(title,message,buttons=[],progress=false){
   if(!host){host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647';shadow=host.attachShadow({mode:'open'});document.body.append(host);}
   host.hidden=false;shadow.replaceChildren();
   const style=document.createElement('style');style.textContent=` :host{font-family:var(--f-body,system-ui,sans-serif)}.overlay{position:absolute;inset:0;display:grid;place-items:center;background:#05070dcc;pointer-events:auto;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));overflow:auto}.panel{box-sizing:border-box;width:min(100%,440px);min-width:0;max-height:100%;overflow:auto;background:var(--card,#0d111b);color:var(--text,#f4f5f7);border:1px solid var(--line-strong,#303541);border-radius:var(--ui-radius,8px);padding:clamp(16px,5vw,26px);box-shadow:0 20px 60px #0009}.brand{font-size:10px;letter-spacing:.15em;color:var(--gold,#ffba08);font-weight:700}h2{font:700 26px/1.1 var(--f-display,system-ui,sans-serif);margin:12px 0;color:inherit}p{font-size:14px;line-height:1.5;color:var(--muted,#9da4b2);overflow-wrap:anywhere}.stats,.actions{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center}.stats{font-size:13px;margin-top:16px}progress{width:100%;height:12px;accent-color:var(--gold,#ffba08);margin-top:8px}.speed{font-size:12px;margin-top:6px}.actions{justify-content:flex-end;margin-top:18px}button{font:700 14px var(--f-body,system-ui,sans-serif);min-height:44px;padding:10px 15px;border-radius:var(--ui-radius,8px);border:1px solid var(--line-strong,#303541);background:var(--card-hi,#141925);color:var(--text,#f4f5f7);cursor:pointer}button.primary{background:var(--gold,#ffba08);border-color:var(--gold,#ffba08);color:var(--update-primary-text,#101015)}button:focus-visible{outline:2px solid var(--gold,#ffba08);outline-offset:3px}@media(max-width:420px){.actions{display:grid;grid-template-columns:1fr;width:100%}.actions:empty{display:none}button{width:100%}}`;
   const overlay=document.createElement('div'),panel=document.createElement('section');overlay.className='overlay';panel.className='panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
   const add=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;panel.append(e);return e;};
   add('div','AUTODESK / AŽURIRANJE','brand');add('h2',title);add('p',message);
   if(progress){const stats=add('p','Priprema preuzimanja…');stats.id='stats';const bar=add('progress','');bar.max=100;bar.id='bar';}
   const actions=add('div','','actions');for(const [i,[label,fn]] of buttons.entries()){const b=document.createElement('button');b.textContent=label;if(i===buttons.length-1)b.className='primary';b.onclick=fn;actions.append(b);}
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
