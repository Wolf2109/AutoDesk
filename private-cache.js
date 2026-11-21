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
    const KINDS = { vehicles: 'vehicles', entries: 'entries', fuel: 'fuel' };
    const empty = () => ({ vehicles: [], entries: [], fuel: [], syncedAt: 0 });
    let mem = null, rerender = null;

    function load() {
        if (mem) return mem;
        try { mem = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { mem = empty(); }
        return mem;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(mem)); }
        catch (e) { console.warn('Lokalna kopija nije sačuvana:', e.message); }
    }

    const strip = d => { const { created, ...rest } = d.data(); return { id: d.id, ...rest }; };

    async function sync() {
        if (!navigator.onLine) throw Error('Nema internet veze.');
        const root = CloudSync.privateRoot();
        const [v, e, f] = await Promise.all(Object.values(KINDS).map(n => root.collection(n).get()));
        mem = { vehicles: v.docs.map(strip), entries: e.docs.map(strip), fuel: f.docs.map(strip), syncedAt: Date.now() };
        save();
        return mem;
    }

    /** Prvo otvaranje (nema kopije): jednom povuci podatke automatski, ako ima interneta. */
    async function ensureFirst() {
        if (load().syncedAt || !navigator.onLine) return;
        try { await sync(); } catch (e) { console.warn('Prva sinhronizacija nije uspela:', e.message); }
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

    function bar() {
        const t = load().syncedAt, on = navigator.onLine;
        return `<div class="syncBar"><div class="syncInfo"><i class="syncDot ${on ? 'on' : 'off'}"></i><span>${t ? 'Sinhronizovano: ' + when(t) : 'Još nije sinhronizovano'}${on ? '' : ' · bez interneta (samo pregled)'}</span></div>` +
            `<button class="secondary" id="syncBtn" ${on ? '' : 'disabled'}>⟳ Sinhronizuj</button></div>`;
    }

    function bind(fn) {
        rerender = fn;
        const b = document.getElementById('syncBtn');
        if (!b) return;
        b.onclick = async () => {
            b.disabled = true; b.textContent = 'Sinhronizacija…';
            try {
                const c = await sync();
                toast(`Sinhronizovano: ${c.vehicles.length} vozila, ${c.entries.length} servisa, ${c.fuel.length} unosa goriva.`);
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
        el.outerHTML = bar();
        bind(rerender);
    };
    window.addEventListener('online', refreshBar);
    window.addEventListener('offline', refreshBar);

    return { load, sync, ensureFirst, upsert, remove, removeWhere, needOnline, bar, bind };
})();

window.PrivateCache = PrivateCache;
