'use strict';
const {app,BrowserWindow,dialog,session,ipcMain}=require('electron');
const path=require('node:path');
const {setupUpdates}=require('./updates.cjs');
const {start}=require('./server.cjs');
let server,win;
const origin='http://127.0.0.1:18743';
const prefs={nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true};
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(async()=>{
    server=await start(path.join(__dirname,'www'));
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    app.on('web-contents-created',(_e,wc)=>{
      wc.on('will-navigate',(e,url)=>{if(!url.startsWith(origin+'/')&&url!=='about:blank')e.preventDefault();});
      wc.on('will-attach-webview',e=>e.preventDefault());
      wc.setWindowOpenHandler(({url})=>url==='about:blank'?{action:'allow',overrideBrowserWindowOptions:{webPreferences:prefs,autoHideMenuBar:true}}:{action:'deny'});
    });
    win=new BrowserWindow({width:1280,height:850,fullscreen:false,minWidth:360,minHeight:540,backgroundColor:'#111214',autoHideMenuBar:true,icon:path.join(__dirname,'www/assets/icons/icon-512.png'),webPreferences:{...prefs,preload:path.join(__dirname,'update-preload.cjs')}});
    ipcMain.handle('app:version', event=>{
      if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) return null;
      return app.getVersion();
    });
    win.maximize();
    win.setMenuBarVisibility(false);
    win.webContents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown'||input.isAutoRepeat)return;
      if(input.key==='F11'||(input.key==='Escape'&&win.isFullScreen())){
        event.preventDefault();
        win.setFullScreen(input.key==='F11'?!win.isFullScreen():false);
      }
    });
    win.webContents.on('did-finish-load',()=>{
      win.webContents.insertCSS('* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; }').catch(e=>console.warn('Scrollbar CSS:',e.message));
    });
    await win.loadURL(origin+'/');
    setupUpdates(win);
  }).catch(e=>{dialog.showErrorBox('AutoDesk',`Pokretanje nije uspelo: ${e.message}`);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{if(server)server.close();});
}
