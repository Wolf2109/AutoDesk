'use strict';
/*
 * Gorivo — praćenje točenja goriva (zasebna celina, nije vezano za vozila ni za radionicu).
 * Podaci: autodesk_private/{uid}/fuel/{id} -> { date, time, product, liters, price, points }
 * JSON uvoz/izvoz: [{ "Datum":"2023-01-08", "Vreme":"09:40", "Naziv proizvoda", "Litara", "Cena", "Bodovi", "RSD/L" }]
 */
const FuelTracker = (() => {
    const COLORS = ['#FFB81C', '#4DA3FF', '#3DDC97', '#C58AFF', '#FF8A8A'];
    const MONTHS = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
    const st = { all: [], year: '', mYear: '', limit: 30 };

    const col = () => CloudSync.privateRoot().collection('fuel');
    const n2 = n => new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
    const rsd = n => new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + ' RSD';
    const fdate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
    const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
    const ppl = e => e.liters > 0 ? e.price / e.liters : 0;
    const byTime = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
    const colorOf = p => COLORS[Math.max(0, products().indexOf(p)) % COLORS.length];
    const products = () => {
        const t = {};
        st.all.forEach(e => { t[e.product] = (t[e.product] || 0) + e.liters; });
        return Object.keys(t).sort((a, b) => t[b] - t[a]);
    };

    async function load() {
        st.all = PrivateCache.load().fuel.slice().sort(byTime);   // samo lokalna kopija; Firebase tek na „Sinhronizuj“
        const years = [...new Set(st.all.map(e => e.date.slice(0, 4)))];
        if (st.year && !years.includes(st.year)) st.year = '';
    }

    /* ---------- prikaz ---------- */

    async function render() {
        await PrivateCache.ensureFirst('fuel');
        await load();
        const years = [...new Set(st.all.map(e => e.date.slice(0, 4)))].sort().reverse();
        const list = st.all.filter(e => !st.year || e.date.startsWith(st.year));
        const tabs = years.length > 1 ? `<div class="pvTabs"><button class="${st.year ? '' : 'active'}" data-fy="">Sve godine</button>${years.map(y => `<button class="${st.year === y ? 'active' : ''}" data-fy="${y}">${y}</button>`).join('')}</div>` : '';

        if (!years.includes(st.mYear)) st.mYear = st.year || years[0] || '';
        $('#content').innerHTML = `
            ${PrivateCache.bar('fuel')}
            <div class="toolbar">
                <div class="subtle" style="align-self:center">Praćenje goriva (sva vozila zajedno)</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="secondary" id="fuImport">Uvezi JSON</button>
                    <button class="secondary" id="fuExport" ${st.all.length ? '' : 'disabled'}>Izvezi JSON</button>
                    <button class="primary" id="fuAdd">+ Unos goriva</button>
                </div>
            </div>
            <input type="file" id="fuFile" accept="application/json,.json" class="hidden">
            ${tabs}
            ${list.length ? body(list) : '<section class="panel"><div class="empty">Još nema unosa goriva.<br>Dodajte unos, uvezite JSON ili pritisnite „Sinhronizuj“.</div></section>'}`;

        PrivateCache.bind(render, 'fuel');
        document.querySelectorAll('[data-fy]').forEach(b => b.onclick = () => { st.year = b.dataset.fy; if (st.year) st.mYear = st.year; st.limit = 30; render().catch(e => toast(e.message)); });
        $('#fuAdd').onclick = () => entryForm();
        $('#fuImport').onclick = () => $('#fuFile').click();
        $('#fuFile').onchange = onFile;
        $('#fuExport').onclick = exportJson;
        if (list.length) {
            renderList(list);
            renderMonthly();
            const sc = document.querySelector('.fuBars'); if (sc) sc.scrollLeft = sc.scrollWidth;
        }
    }

    function body(list) {
        const liters = sum(list, e => e.liters), price = sum(list, e => e.price), last = list[0];
        const months = monthly(list);
        const cards = [
            statCard('Ukupno potrošeno', rsd(price), 'accent', `${list.length} točenja`),
            statCard('Ukupno litara', n2(liters) + ' L', '', `prosečno ${n2(liters / list.length)} L po točenju`),
            statCard('Prosečna cena', n2(price / liters) + ' RSD/L', '', 'ponderisana prosečna cena'),
            statCard('Prosek po točenju', rsd(price / list.length), '', ''),
            statCard('Poslednja cena', n2(ppl(last)) + ' RSD/L', '', `${esc(last.product)} · ${fdate(last.date)}`),
            statCard('Prosek po mesecu', rsd(price / Math.max(1, months.length)), '', `${months.length} ${months.length === 1 ? 'mesec' : 'meseci'} sa točenjem`)
        ].join('');
        const prods = products().filter(p => list.some(e => e.product === p));
        const legend = prods.map(p => `<span><i class="dot" style="background:${colorOf(p)}"></i>${esc(p)}</span>`).join('');
        return `<div class="statsGrid fuStats">${cards}</div>
            <section class="panel fuPanel"><h3>Potrošnja po mesecima (RSD)</h3>${barChart(months, prods)}<div class="legend">${legend}</div></section>
            <section class="panel fuPanel" id="fuMonthly"></section>
            <div class="twoCol fuTwo">
                <section class="panel fuPanel"><h3>Po vrsti goriva</h3>${summary(list, prods, e => e.product)}</section>
                ${st.year ? '' : `<section class="panel fuPanel"><h3>Po godinama</h3>${summary(list, [...new Set(list.map(e => e.date.slice(0, 4)))].sort().reverse(), e => e.date.slice(0, 4))}</section>`}
            </div>
            <section class="panel fuPanel" id="fuList"></section>`;
    }


    /* ---------- mesečni prikaz za izabranu godinu ---------- */

    const isDiesel = e => /DIZEL|DIESEL/i.test(e.product);

    function renderMonthly() {
        const box = $('#fuMonthly');
        if (!box) return;
        const years = [...new Set(st.all.map(e => e.date.slice(0, 4)))].sort().reverse();
        const grp = (a, f) => { const x = a.filter(f); return { l: sum(x, e => e.liters), p: sum(x, e => e.price), n: x.length }; };
        const cell = (g, name) => `<div class="mg" data-g="${name}"><span>${g.n ? n2(g.l) + ' L' : '–'}</span><span>${g.n ? rsd(g.p) : '–'}</span></div>`;
        const row = (label, a, cls = '') => {
            const d = grp(a, isDiesel), p = grp(a, e => !isDiesel(e)), t = grp(a, () => true);
            return `<div class="fmRow ${cls} ${t.n ? '' : 'fmEmpty'}"><b class="fmName">${label}</b>${cell(d, 'Dizel')}${cell(p, 'Benzin')}${cell(t, 'Ukupno')}</div>`;
        };
        const yearAll = st.all.filter(e => e.date.startsWith(st.mYear));
        const rows = MONTHS.map((m, i) => row(m, yearAll.filter(e => e.date.slice(5, 7) === String(i + 1).padStart(2, '0')))).join('');
        box.innerHTML = `<div class="fmTop"><h3>Mesečni prikaz</h3><select id="fuMYear" aria-label="Godina">${years.map(y => `<option ${y === st.mYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div class="fmHead"><span>Mesec</span><span>Dizel · litara / iznos</span><span>Benzin · litara / iznos</span><span>Ukupno · litara / iznos</span></div>
            ${rows}${row('Ukupno ' + st.mYear, yearAll, 'fmTotal')}`;
        $('#fuMYear').onchange = e => { st.mYear = e.target.value; renderMonthly(); };
    }

    function monthly(list) {
        const m = new Map();
        list.forEach(e => {
            const k = e.date.slice(0, 7), r = m.get(k) || { k, price: 0, liters: 0, p: {} };
            r.price += e.price; r.liters += e.liters;
            const q = r.p[e.product] || (r.p[e.product] = { price: 0, liters: 0 });
            q.price += e.price; q.liters += e.liters;
            m.set(k, r);
        });
        return [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
    }

    const mlabel = k => k.slice(5) + '/' + k.slice(2, 4);

    function barChart(months, prods) {
        const max = Math.max(1, ...months.map(m => m.price));
        return `<div class="fuBars">${months.map(m => `<div class="fb" title="${MONTHS[+m.k.slice(5) - 1]} ${m.k.slice(0, 4)}: ${rsd(m.price)} · ${n2(m.liters)} L">
            <span class="fv">${Math.round(m.price / 1000)}k</span>
            <div class="fstack" style="height:${(m.price / max * 100).toFixed(1)}%">${prods.filter(p => m.p[p]).map(p => `<i style="flex:${m.p[p].price};background:${colorOf(p)}"></i>`).join('')}</div>
            <span class="fl">${mlabel(m.k)}</span></div>`).join('')}</div>`;
    }

    function summary(list, keys, keyOf) {
        return `<div class="fuSum"><div class="fsHead"><span></span><span>Točenja</span><span>Litara</span><span>Ukupno</span><span>RSD/L</span></div>${keys.map(k => {
            const a = list.filter(e => keyOf(e) === k), l = sum(a, e => e.liters), p = sum(a, e => e.price);
            return `<div class="fsRow"><b class="fsName">${esc(k)}</b><span data-l="Točenja">${a.length}</span><span data-l="Litara">${n2(l)}</span><span data-l="Ukupno">${rsd(p)}</span><span data-l="RSD/L">${n2(p / l)}</span></div>`;
        }).join('')}</div>`;
    }

    function renderList(list) {
        const box = $('#fuList'), rows = list.slice(0, st.limit);
        box.innerHTML = `<h3>Unosi (${list.length})</h3><div class="tableWrap cards"><table class="fuTbl"><thead><tr><th>Datum i vreme</th><th>Gorivo</th><th class="r">Litara</th><th class="r">Iznos</th><th class="r">RSD/L</th><th class="r">Bodovi</th><th></th></tr></thead><tbody>${rows.map(e => `<tr>
            <td class="fDate"><strong>${fdate(e.date)}${e.time ? ' · ' + esc(e.time) : ''}</strong><div class="pvMeta"><i class="dot" style="background:${colorOf(e.product)}"></i>${esc(e.product)} · ${n2(e.liters)} L · ${n2(ppl(e))} RSD/L</div></td>
            <td class="fProd">${esc(e.product)}</td><td class="fL r">${n2(e.liters)}</td>
            <td class="fPrice r"><b>${n2(e.price)} RSD</b></td><td class="fPpl r">${n2(ppl(e))}</td><td class="fPts r">${e.points ?? '–'}</td>
            <td class="fAct"><button class="secondary" data-fedit="${esc(e.id)}">Izmeni</button><button class="danger" data-fdel="${esc(e.id)}">Obriši</button></td></tr>`).join('')}</tbody></table></div>
            ${list.length > st.limit ? `<button class="secondary" id="fuMore" style="width:100%;margin-top:12px">Prikaži još (${list.length - st.limit})</button>` : ''}`;
        if ($('#fuMore')) $('#fuMore').onclick = () => { st.limit += 30; renderList(list); };
        box.querySelectorAll('[data-fedit]').forEach(b => b.onclick = () => entryForm(st.all.find(x => x.id === b.dataset.fedit)));
        box.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => {
            if (!confirm('Obrisati ovaj unos?')) return;
            try { PrivateCache.edit('fuel', b.dataset.fdel, null); await render(); toast('Unos je obrisan.'); } catch (e) { toast(e.message); }
        });
    }

    /* ---------- forma ---------- */

    function entryForm(item = {}) {
        modal(item.id ? 'Izmena unosa goriva' : 'Novi unos goriva', '');
        const known = [...new Set([...products(), 'EVRO DIZEL', 'EVRO PREMIJUM BMB-95'])];
        const prod = `<div class="field full"><label for="f_product">Vrsta goriva</label><input id="f_product" name="product" list="fuProducts" value="${esc(item.product || products()[0] || 'EVRO DIZEL')}" required><datalist id="fuProducts">${known.map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>`;
        const now = new Date(), hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        formShell(
            field('Datum', 'date', item.date || today(), 'date', true) +
            field('Vreme', 'time', item.time || (item.id ? '' : hhmm), 'time') +
            prod +
            field('Litara', 'liters', item.liters ?? '', 'number', true) +
            field('Iznos (RSD)', 'price', item.price ?? '', 'number', true) +
            field('Bodovi', 'points', item.points ?? '', 'number'),
            async b => {
                const liters = Number(b.liters), price = Number(b.price);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw Error('Unesite ispravan datum.');
                if (!(liters > 0) || !(price > 0)) throw Error('Litara i iznos moraju biti veći od nule.');
                const data = { date: b.date, time: b.time || '', product: (b.product || '').trim().toUpperCase() || 'GORIVO', liters: Math.round(liters * 100) / 100, price: Math.round(price * 100) / 100, points: b.points === '' ? null : Math.round(Number(b.points)) };
                if (item.id) { PrivateCache.edit('fuel', item.id, data); }
                else { const ref = {id: PrivateCache.create('fuel', data)}; }
            }
        );
    }

    /* ---------- uvoz / izvoz ---------- */

    function exportJson() {
        const out = st.all.slice().reverse().map(e => ({ 'Datum': e.date, 'Vreme': e.time || '', 'Naziv proizvoda': e.product, 'Litara': e.liters, 'Cena': e.price, 'Bodovi': e.points ?? null, 'RSD/L': Math.round(ppl(e) * 100) / 100 }));
        const d = new Date(), p = x => String(x).padStart(2, '0');
        NativeBridge.saveFile(`gorivo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`, new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })).catch(e => toast(e.message));
    }

    function parseRows(text) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw Error('JSON mora biti lista unosa.');
        const rows = data.map(r => {
            let date = String(r['Datum'] || '').trim().slice(0, 10), m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(r['Datum'] || ''));
            if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            const pts = r['Bodovi'];
            return {
                date, time: String(r['Vreme'] || '').slice(0, 5), product: String(r['Naziv proizvoda'] || '').trim(),
                liters: Math.round(Number(r['Litara']) * 100) / 100, price: Math.round(Number(r['Cena']) * 100) / 100,
                points: typeof pts === 'number' && pts >= 0 ? Math.round(pts) : null
            };
        }).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.product && r.liters > 0 && r.price > 0);
        if (!rows.length) throw Error('U fajlu nema ispravnih unosa (Datum, Naziv proizvoda, Litara, Cena).');
        return rows;
    }

    async function onFile(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            PrivateCache.needOnline();
            const rows = parseRows(await file.text());
            const key = r => [r.date, r.time, r.liters, r.price].join('|');
            const have = new Set(st.all.map(key));
            const fresh = rows.filter(r => { const k = key(r); if (have.has(k)) return false; have.add(k); return true; });
            if (!confirm(`U fajlu je ${rows.length} unosa. Novih za uvoz: ${fresh.length}, već postoji: ${rows.length - fresh.length}.\nUvesti?`)) return;
            const db = CloudSync.privateDb();
            for (let i = 0; i < fresh.length; i += 400) {
                const b = db.batch(), added = [];
                fresh.slice(i, i + 400).forEach(r => { const ref = col().doc(); b.set(ref, { ...r, created: CloudSync.privateStamp() }); added.push({ id: ref.id, ...r }); });
                await b.commit();
                added.forEach(x => PrivateCache.upsert('fuel', x));
            }
            toast(`Uvezeno: ${fresh.length}.`);
            await refresh();
        } catch (err) { toast('Uvoz nije moguć: ' + err.message); }
    }

    return { render };
})();

window.FuelTracker = FuelTracker;
