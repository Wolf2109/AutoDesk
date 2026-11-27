package rs.autodijagnostikalazarevic.autodesk;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="AutoDeskUpdate")
public class AutoDeskUpdatePlugin extends Plugin {
 @PluginMethod public void open(PluginCall call) {
  String url=call.getString("url", "");
  if(!url.matches("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/apk-latest/AutoDesk\\.apk")){call.reject("Neispravan URL");return;}
  try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); call.resolve(); }
  catch(Exception e){call.reject("Pregledač nije dostupan",e);}
 }
}
