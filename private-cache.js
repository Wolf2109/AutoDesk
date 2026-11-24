'use strict';
/*
 * Lokalna kopija podataka za „Lična vozila“ i „Gorivo“ (rad bez interneta + štednja Firebase limita).
 *
 * - Stranice čitaju ISKLJUČIVO iz lokalne kopije (localStorage), pa ne troše Firestore čitanja.
 * - Podaci se povlače iz Firebase-a samo ručno, dugmetom „Sinhronizuj“ (i automatski jednom, ako kopija još ne postoji).
 * - Izmene (dodavanje, izmena, brisanje, uvoz) se upisuju u Firebase i odmah u lokalnu kopiju, bez ponovnog čitanja.
 * - Bez interneta se podaci samo pregledaju; izmene su moguće kada je veza tu.
 */
const PrivateCache = (() => {
    const KEY = 'autodesk_private_cache_v1';
    // Dve odvojene grupe: 'service' (vozila + servisi) i 'fuel' (gorivo), svaka sa svojom sinhronizacijom.
    const GROUPS = { service: ['vehicles', 'entries'], fuel: ['fuel'], tools: ['tools'] };
    const empty = () => ({ vehicles: [], entries: [], fuel: [], tools: [], syncedAt: { service: 0, fuel: 0, tools: 0 } });
    let mem = null, rerender = null, barKind = 'fuel';

    function load() {
        if (mem) return mem;
        try { mem = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { mem = empty(); }
        // stara kopija je imala jedno vreme sinhronizacije za sve
        if (typeof mem.syncedAt === 'number') mem.syncedAt = { service: mem.syncedAt, fuel: mem.syncedAt, tools: 0 };
        mem.syncedAt = { service: 0, fuel: 0, tools: 0, ...mem.syncedAt };
        return mem;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(mem)); }
        catch (e) { console.warn('Lokalna kopija nije sačuvana:', e.message); }
    }

    const strip = d => { const { created, ...rest } = d.data(); return { id: d.id, ...rest }; };

    /** Povlači samo jednu grupu iz Firebase-a; druga ostaje netaknuta. */
    async function sync(kind) {
        if (!GROUPS[kind]) throw Error('Nepoznata grupa podataka.');
        if (!navigator.onLine) throw Error('Nema internet veze.');
        const root = CloudSync.privateRoot(), c = load();
        const snaps = await Promise.all(GROUPS[kind].map(n => root.collection(n).get()));
        GROUPS[kind].forEach((n, i) => { c[n] = snaps[i].docs.map(strip); });
        c.syncedAt[kind] = Date.now();
        save();
        return c;
    }

    /** Prvo otvaranje (nema kopije): jednom povuci podatke automatski, ako ima interneta. */
    async function ensureFirst(kind) {
        if (load().syncedAt[kind] || !navigator.onLine) return;
        try { await sync(kind); } catch (e) { console.warn('Prva sinhronizacija nije uspela:', e.message); }
    }

    function upsert(kind, item) {
        const c = load(), i = c[kind].findIndex(x => x.id === item.id);
        if (i < 0) c[kind].push(item); else c[kind][i] = { ...c[kind][i], ...item };
        save();
    }
    function remove(kind, id) { load()[kind] = load()[kind].filter(x => x.id !== id); save(); }
    function removeWhere(kind, fn) { load()[kind] = load()[kind].filter(x => !fn(x)); save(); }
    function needOnline() { if (!navigator.onLine) throw Error('Nema internet veze. Izmene su moguće samo kada ste online.'); }

    /* ---------- traka sa dugmetom „Sinhronizuj“ ---------- */

    const when = ms => new Date(ms).toLocaleString('sr-Latn-RS', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    function bar(kind = barKind) {
        const t = load().syncedAt[kind], on = navigator.onLine;
        return `<div class="syncBar"><div class="syncInfo"><i class="syncDot ${on ? 'on' : 'off'}"></i><span>${t ? 'Sinhronizovano: ' + when(t) : 'Još nije sinhronizovano'}${on ? '' : ' · bez interneta (samo pregled)'}</span></div>` +
            `<button class="secondary" id="syncBtn" ${on ? '' : 'disabled'}>⟳ Sinhronizuj</button></div>`;
    }

    function bind(fn, kind) {
        rerender = fn; barKind = kind;
        const b = document.getElementById('syncBtn');
        if (!b) return;
        b.onclick = async () => {
            b.disabled = true; b.textContent = 'Sinhronizacija…';
            try {
                const c = await sync(kind);
                toast(kind === 'tools' ? `Alati sinhronizovani: ${c.tools.length} uređaja.` : kind === 'fuel' ? `Gorivo sinhronizovano: ${c.fuel.length} unosa.` : `Servisi sinhronizovani: ${c.vehicles.length} vozila, ${c.entries.length} unosa.`);
                await rerender();
            } catch (e) {
                toast('Sinhronizacija nije uspela: ' + e.message);
                b.disabled = !navigator.onLine; b.textContent = '⟳ Sinhronizuj';
            }
        };
    }

    // Kada veza nestane ili se vrati, osveži samo traku (ne celu stranicu).
    const refreshBar = () => {
        const el = document.querySelector('.syncBar');
        if (!el || !rerender) return;
        el.outerHTML = bar(barKind);
        bind(rerender, barKind);
    };
    window.addEventListener('online', refreshBar);
    window.addEventListener('offline', refreshBar);

    return { load, sync, ensureFirst, upsert, remove, removeWhere, needOnline, bar, bind };
})();

window.PrivateCache = PrivateCache;
