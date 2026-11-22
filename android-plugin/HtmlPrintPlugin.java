package rs.autodijagnostikalazarevic.autodesk;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Štampa / „Sačuvaj kao PDF“ za HTML dokumente (nalozi, istorija vozila, servisna knjižica, izveštaji).
 * Otvara standardni Android prozor za štampu, u kome se bira „Sačuvaj kao PDF“ ili štampač.
 */
@CapacitorPlugin(name = "HtmlPrint")
public class HtmlPrintPlugin extends Plugin {
    private WebView printView; // čuva se do sledeće štampe da ga ne uništi sakupljač smeća usred štampe

    @PluginMethod
    public void print(final PluginCall call) {
        final String html = call.getString("html");
        final String title = call.getString("title", "AutoDesk");
        if (html == null || html.isEmpty()) {
            call.reject("Nema sadržaja za štampu.");
            return;
        }
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    final WebView wv = new WebView(getContext());
                    wv.getSettings().setJavaScriptEnabled(false);
                    wv.setWebViewClient(new WebViewClient() {
                        private boolean done = false;

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (done) return;
                            done = true;
                            try {
                                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                                PrintAttributes attrs = new PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build();
                                pm.print(title, adapter, attrs);
                                call.resolve();
                            } catch (Exception e) {
                                call.reject("Štampa nije uspela: " + e.getMessage());
                            }
                        }
                    });
                    printView = wv;
                    wv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    call.reject("Štampa nije uspela: " + e.getMessage());
                }
            }
        });
    }
}
