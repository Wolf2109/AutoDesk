'use strict';
const {ipcRenderer}=require('electron');
if(process.isMainFrame){
 let host, root, state={phase:'idle'}, hidden=false;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const mb=n=>Number.isFinite(n)?(n/1048576).toFixed(1)+' MB':'—';
 function render(){
   if(!root)return;
   root.querySelector('.overlay')?.remove();
   if(state.phase==='idle'||hidden)return;
   const overlay=el('div','','overlay'), panel=el('section','','panel');
   panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Ažuriranje aplikacije');
   const headings={checking:'Provera ažuriranja',available:'Nova verzija je dostupna',downloading:'Preuzimanje ažuriranja',ready:'Ažuriranje je spremno',current:'Imate najnoviju verziju',error:'Ažuriranje nije uspelo'};
   panel.append(el('div','AUTODESK / AŽURIRANJE','brand'),el('h2',headings[state.phase]||'Ažuriranje'));
   const messages={checking:'Proveravamo dostupnost nove verzije…',available:'Dostupna je verzija '+state.version+'.',downloading:'Verzija '+state.version+' se preuzima.',ready:'Sačuvajte otvoreni rad pre ponovnog pokretanja aplikacije.',current:'Nema dostupnih novih ažuriranja.',error:state.detail||'Pokušajte ponovo kasnije.'};
   panel.append(el('p',messages[state.phase]));
   if(state.phase==='downloading'){
     const percent=Math.max(0,Math.min(100,Number(state.percent)||0));
     const line=el('div','','stats');line.append(el('span',mb(state.transferred)+' / '+mb(state.total)),el('strong',Math.floor(percent)+'%'));panel.append(line);
     const bar=el('progress');bar.max=100;bar.value=percent;bar.setAttribute('aria-label','Napredak preuzimanja');panel.append(bar,el('p',mb(state.speed)+'/s','speed'));
   }
   const actions=el('div','','actions');
   const button=(label,action,primary=false)=>{const b=el('button',label,primary?'primary':'');b.onclick=()=>{if(action==='hide'){hidden=true;render();}else ipcRenderer.send('update:action',action);};actions.append(b);};
   if(state.phase==='available'){button('Kasnije','dismiss');button(state.portable?'Otvori preuzimanje':'Preuzmi','download',true);}
   else if(state.phase==='ready'){button('Kasnije','hide');button('Restartuj i instaliraj','install',true);}
   else if(['current','error'].includes(state.phase))button('Zatvori','dismiss',true);
   panel.append(actions);overlay.append(panel);root.append(overlay);
 }
 ipcRenderer.on('update:state',(_e,next)=>{if(next.phase!==state.phase||next.phase==='ready')hidden=false;state=next;render();});
 window.addEventListener('DOMContentLoaded',()=>{
   ipcRenderer.invoke('app:version').then(version=>{
     const label=document.getElementById('appVersion');
     if(label&&version){label.textContent='v'+version.replace(/^(\d+\.\d+)\.0$/,'$1');label.hidden=false;}
   }).catch(e=>console.warn('App version:',e.message));
   host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none';root=host.attachShadow({mode:'closed'});
   const css=el('style');css.textContent=` :host{font-family:var(--f-body,system-ui,sans-serif)}.overlay{position:absolute;inset:0;display:grid;place-items:center;background:#05070dcc;pointer-events:auto;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));overflow:auto}.panel{box-sizing:border-box;width:min(100%,440px);min-width:0;max-height:100%;overflow:auto;background:var(--card,#0d111b);color:var(--text,#f4f5f7);border:1px solid var(--line-strong,#303541);border-radius:16px;padding:clamp(16px,5vw,26px);box-shadow:0 20px 60px #0009}.brand{font-size:10px;letter-spacing:.15em;color:var(--gold,#ffba08);font-weight:700}h2{font:700 26px/1.1 var(--f-display,system-ui,sans-serif);margin:12px 0;color:inherit}p{font-size:14px;line-height:1.5;color:var(--muted,#9da4b2);overflow-wrap:anywhere}.stats,.actions{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center}.stats{font-size:13px;margin-top:16px}progress{width:100%;height:12px;accent-color:var(--gold,#ffba08);margin-top:8px}.speed{font-size:12px;margin-top:6px}.actions{justify-content:flex-end;margin-top:18px}button{font:700 14px var(--f-body,system-ui,sans-serif);min-height:44px;padding:10px 15px;border-radius:8px;border:1px solid var(--line-strong,#303541);background:var(--card-hi,#141925);color:var(--text,#f4f5f7);cursor:pointer}button.primary{background:var(--gold,#ffba08);border-color:var(--gold,#ffba08);color:#101015}button:focus-visible{outline:2px solid var(--gold,#ffba08);outline-offset:3px}@media(max-width:420px){.actions{display:grid;grid-template-columns:1fr;width:100%}.actions:empty{display:none}button{width:100%}}`;
   root.append(css);document.body.append(host);render();ipcRenderer.send('update:request');
 });
}
