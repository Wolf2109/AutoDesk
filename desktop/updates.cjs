'use strict';
const {app,Menu,shell,ipcMain}=require('electron');
const {autoUpdater}=require('electron-updater');
function setupUpdates(win){
  if(!app.isPackaged)return;
  const portable=!!process.env.PORTABLE_EXECUTABLE_FILE;
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=false;
  let state={phase:'idle'}, busy=false, manual=false, ready=false, version='';
  const show=(phase,extra={})=>{state={phase,version,portable,...extra};if(!win.isDestroyed())win.webContents.send('update:state',state);};
  const check=async(user=false)=>{
    if(busy||['available','downloading','ready'].includes(state.phase)) {if(user)show(state.phase,state);return;}
    busy=true;manual=user;if(user)show('checking');
    try{await autoUpdater.checkForUpdates();}catch(e){if(user)show('error',{detail:String(e.message)});}finally{busy=false;}
  };
  autoUpdater.on('error',e=>{console.warn('Updater:',e.message);if(manual||state.phase==='downloading')show('error',{detail:String(e.message)});});
  autoUpdater.on('update-not-available',()=>{if(manual)show('current');else show('idle');});
  autoUpdater.on('update-available',info=>{version=info.version;show('available');});
  autoUpdater.on('download-progress',p=>{if(state.phase==='downloading')show('downloading',{percent:p.percent,transferred:p.transferred,total:p.total,speed:p.bytesPerSecond});});
  autoUpdater.on('update-downloaded',()=>{ready=true;show('ready');});
  const valid=e=>!win.isDestroyed()&&e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame;
  ipcMain.on('update:request',e=>{if(valid(e))show(state.phase,state);});
  ipcMain.on('update:action',async(e,action)=>{
    if(!valid(e))return;
    if(action==='dismiss'&&!['checking','downloading'].includes(state.phase)){if(state.phase==='ready')return;show('idle');return;}
    if(action==='install'&&ready&&state.phase==='ready'){autoUpdater.quitAndInstall();return;}
    if(action!=='download'||state.phase!=='available')return;
    if(portable){try{const config=require('./package.json').build.publish?.[0];if(!config)throw Error('Repozitorijum nije podešen.');await shell.openExternal(`https://github.com/${config.owner}/${config.repo}/releases/tag/v${version}`);show('idle');}catch(e){show('error',{detail:String(e.message)});}return;}
    show('downloading',{percent:0});
    try{await autoUpdater.downloadUpdate();}catch(e){show('error',{detail:String(e.message)});}
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'AutoDesk',submenu:[{label:`Verzija ${app.getVersion()}`,enabled:false},{label:'Proveri ažuriranja',click:()=>check(true)},{role:'quit'}]}]));win.setMenuBarVisibility(true);
  check();const timer=setInterval(()=>check(),3600000);app.once('before-quit',()=>clearInterval(timer));
}
module.exports={setupUpdates};
