package rs.autodijagnostikalazarevic.autodesk;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;

@CapacitorPlugin(name="AutoDeskUpdate")
public class AutoDeskUpdatePlugin extends Plugin {
 private volatile boolean downloading;
 private File apk() { return new File(getContext().getCacheDir(), "AutoDesk.apk"); }
 @PluginMethod public synchronized void download(PluginCall call) {
  String url=call.getString("url", "");
  if(!url.matches("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/apk-latest/AutoDesk\\.apk")){call.reject("Neispravan URL");return;}
  if(downloading){call.reject("Preuzimanje je već u toku");return;}
  downloading=true;
  new Thread(() -> {
   File target=apk(), partial=new File(target.getPath()+".part");
   HttpURLConnection connection=null;
   try {
    target.delete(); partial.delete();
    connection=(HttpURLConnection)new URL(url).openConnection();
    connection.setConnectTimeout(20000); connection.setReadTimeout(30000);
    if(connection.getResponseCode()!=200)throw new IOException("HTTP "+connection.getResponseCode());
    long total=connection.getContentLengthLong(), received=0, start=android.os.SystemClock.elapsedRealtime(), last=0;
    try(InputStream in=connection.getInputStream(); OutputStream out=new FileOutputStream(partial)) {
     byte[] buffer=new byte[65536]; int n;
     while((n=in.read(buffer))!=-1){out.write(buffer,0,n);received+=n;long now=android.os.SystemClock.elapsedRealtime();
      if(now-last>=250){JSObject progress=new JSObject();progress.put("received",received);progress.put("total",total);progress.put("speed",received*1000.0/Math.max(1,now-start));notifyListeners("progress",progress);last=now;}
     }
    }
    if(received==0||(total>0&&received!=total)||!partial.renameTo(target))throw new IOException("Nepotpuno preuzimanje");
    call.resolve();
   }catch(Exception e){partial.delete();call.reject("Preuzimanje nije uspelo",e);}
   finally{if(connection!=null)connection.disconnect();downloading=false;}
  }).start();
 }
 @PluginMethod public void install(PluginCall call){
  if(downloading||!apk().isFile()){call.reject("APK nije spreman");return;}
  try {
   if(android.os.Build.VERSION.SDK_INT>=26&&!getContext().getPackageManager().canRequestPackageInstalls()){
    getActivity().startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getContext().getPackageName())));
    JSObject result=new JSObject();result.put("permissionRequired",true);call.resolve(result);return;
   }
   Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",apk());
   Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
   getActivity().startActivity(intent);call.resolve();
  }catch(Exception e){call.reject("Instalacija nije pokrenuta",e);}
 }
}
