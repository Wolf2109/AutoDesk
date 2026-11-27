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
   panel.append(el('div','AUTODESK  /  UPDATE','brand'),el('h2',headings[state.phase]||'Ažuriranje'));
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
     if(label&&version){label.textContent='AutoDesk v'+version.replace(/^(\d+\.\d+)\.0$/,'$1');label.hidden=false;}
   }).catch(e=>console.warn('App version:',e.message));
   host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none';root=host.attachShadow({mode:'closed'});
   const css=el('style');css.textContent=`:host{font-family:var(--f-body,Arial,sans-serif)}.overlay{position:absolute;inset:0;display:grid;place-items:center;background:#0009;pointer-events:auto;padding:20px;box-sizing:border-box}.panel{box-sizing:border-box;width:min(100%,440px);background:var(--card,#202124);color:var(--text,#f5f5f5);border:1px solid var(--line-strong,#444);border-top:3px solid var(--accent,#e3212b);padding:26px;border-radius:12px;box-shadow:0 20px 80px #0009}.brand{font-size:11px;letter-spacing:.18em;color:var(--accent,#ef4444);font-weight:800}h2{font-size:23px;margin:14px 0 10px}p{font-size:14px;line-height:1.5;color:var(--muted,#b2b2b2);overflow-wrap:anywhere}.stats,.actions{display:flex;justify-content:space-between;gap:12px;align-items:center}.stats{font-size:13px;margin-top:22px}progress{width:100%;height:12px;accent-color:var(--accent,#e3212b);margin-top:10px}.speed{font-size:12px;margin-top:6px}.actions{justify-content:flex-end;margin-top:20px}button{font:inherit;font-size:14px;font-weight:700;padding:11px 15px;border-radius:7px;border:1px solid #555;background:#292a2e;color:white;cursor:pointer}button.primary{background:#c91e28;border-color:#c91e28}button:focus-visible{outline:2px solid white;outline-offset:3px}`;
   root.append(css);document.body.append(host);render();ipcRenderer.send('update:request');
 });
}
