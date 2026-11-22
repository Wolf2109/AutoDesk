'use strict';
/*
 * Most između web aplikacije i Android aplikacije (Capacitor).
 * U običnom pregledaču radi kao do sada; u Android aplikaciji koristi sistemsko deljenje fajlova i štampu.
 */
const NativeBridge = (() => {
    const cap = () => window.Capacitor;
    const isNative = () => !!(cap() && typeof cap().isNativePlatform === 'function' && cap().isNativePlatform());
    const cache = {};
    const plugin = name => {
        if (cache[name]) return cache[name];
        const c = cap();
        return (cache[name] = (c && c.Plugins && c.Plugins[name]) || (c && c.registerPlugin ? c.registerPlugin(name) : null));
    };
    const toBase64 = blob => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = () => rej(new Error('Čitanje fajla nije uspelo.'));
        r.readAsDataURL(blob);
    });

    /** Čuvanje/preuzimanje fajla. U aplikaciji otvara Android „Podeli/Sačuvaj“ (Drive, Fajlovi, WhatsApp…). */
    async function saveFile(name, data, mime = 'application/json') {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
        if (!isNative()) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            return;
        }
        const fs = plugin('Filesystem'), share = plugin('Share');
        if (!fs || !share) throw new Error('Čuvanje fajlova nije dostupno u ovoj verziji aplikacije.');
        const file = await fs.writeFile({ path: name, data: await toBase64(blob), directory: 'CACHE' });
        await share.share({ title: name, url: file.uri, dialogTitle: 'Sačuvaj ili podeli fajl' });
    }

    /** Štampa HTML dokumenta / „Sačuvaj kao PDF“ preko Android prozora za štampu. */
    async function printHtml(html, title) {
        const p = plugin('HtmlPrint');
        if (!p) throw new Error('Štampa nije dostupna u ovoj verziji aplikacije.');
        await p.print({ html, title: title || 'AutoDesk' });
    }

    /** Android dugme „nazad“: kada postoji slušalac, aplikacija se ne zatvara sama već ga obrađuje naš kod. */
    function onBackButton(fn) {
        const app = isNative() ? plugin('App') : null;
        if (app && app.addListener) app.addListener('backButton', fn);
    }
    function exitApp() {
        const app = plugin('App');
        if (app && app.exitApp) app.exitApp();
    }

    return { isNative, saveFile, printHtml, onBackButton, exitApp };
})();

window.NativeBridge = NativeBridge;
