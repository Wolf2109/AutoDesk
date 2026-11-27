'use strict';
const {app,dialog,Menu,shell}=require('electron');
const {autoUpdater}=require('electron-updater');
function setupUpdates(win){
  if(!app.isPackaged)return;
  const portable=!!process.env.PORTABLE_EXECUTABLE_FILE;
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=false;
  let busy=false, manual=false, offered=false;
  const check=async(user=false)=>{if(busy||offered)return;busy=true;manual=user;try{await autoUpdater.checkForUpdates();}catch(e){if(user)dialog.showMessageBox(win,{message:'Provera ažuriranja nije uspela.',detail:String(e.message)});}finally{busy=false;}};
  autoUpdater.on('error',e=>console.warn('Updater:',e.message));
  autoUpdater.on('update-not-available',()=>{if(manual)dialog.showMessageBox(win,{message:'Koristite najnoviju verziju.'});});
  autoUpdater.on('update-available',async info=>{if(offered)return;offered=true;try{const r=await dialog.showMessageBox(win,{title:'AutoDesk',message:`Dostupna je verzija ${info.version}`,buttons:[portable?'Otvori stranicu za preuzimanje':'Preuzmi','Kasnije'],defaultId:0,cancelId:1});if(r.response!==0)return;if(portable){const config=require('./package.json').build.publish?.[0];if(config)await shell.openExternal(`https://github.com/${config.owner}/${config.repo}/releases/tag/v${info.version}`);}else await autoUpdater.downloadUpdate();}catch(e){dialog.showMessageBox(win,{message:'Preuzimanje nije uspelo.',detail:String(e.message)});}finally{offered=false;}});
  autoUpdater.on('update-downloaded',async()=>{const r=await dialog.showMessageBox(win,{message:'Ažuriranje je spremno. Sačuvajte otvoreni rad pre restarta.',buttons:['Restartuj i instaliraj','Kasnije'],cancelId:1});if(r.response===0)autoUpdater.quitAndInstall();});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'AutoDesk',submenu:[{label:`Verzija ${app.getVersion()}`,enabled:false},{label:'Proveri ažuriranja',click:()=>check(true)},{role:'quit'}]}]));win.setMenuBarVisibility(true);
  check();const timer=setInterval(()=>check(),3600000);app.once('before-quit',()=>clearInterval(timer));
}
module.exports={setupUpdates};
